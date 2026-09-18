import { apiError,getApiContext } from "@/lib/api-context";
import { prisma } from "@/lib/prisma";
export async function GET(request:Request){
  try{
    const {tenantId,branchId,session}=await getApiContext();
    const params=new URL(request.url).searchParams;
    const end=params.get("to")?new Date(`${params.get("to")}T23:59:59`):new Date();
    const start=params.get("from")?new Date(`${params.get("from")}T00:00:00`):new Date(end.getTime()-30*86_400_000);
    const duration=end.getTime()-start.getTime();
    const previousStart=new Date(start.getTime()-duration);
    const base={tenantId,branchId,status:"COMPLETED" as const,createdAt:{gte:start,lte:end},createdById:params.get("employee")||undefined};
    let sales=await prisma.sale.findMany({where:base,select:{id:true,total:true,customerId:true}});
    if(params.get("payment")){const paid=await prisma.salePayment.findMany({where:{tenantId,method:params.get("payment")!,saleId:{in:sales.map(sale=>sale.id)}},select:{saleId:true}});const ids=new Set(paid.map(row=>row.saleId));sales=sales.filter(sale=>ids.has(sale.id))}
    if(params.get("species")){const pets=await prisma.pet.findMany({where:{tenantId,type:params.get("species")!,deletedAt:null},select:{customerId:true}});const customers=new Set(pets.map(pet=>pet.customerId));sales=sales.filter(sale=>sale.customerId&&customers.has(sale.customerId))}
    const items=await prisma.saleItem.findMany({where:{tenantId,saleId:{in:sales.map(sale=>sale.id)}}});
    const productIds=[...new Set(items.map(item=>item.productId))];
    const products=await prisma.product.findMany({where:{tenantId,id:{in:productIds},category:params.get("category")||undefined,brand:params.get("brand")||undefined},select:{id:true,name:true,category:true,brand:true,costPrice:true,minimumStock:true}});
    const allowed=new Set(products.map(product=>product.id));
    const filteredItems=items.filter(item=>allowed.has(item.productId));
    if(params.get("category")||params.get("brand")){const saleIds=new Set(filteredItems.map(item=>item.saleId));sales=sales.filter(sale=>saleIds.has(sale.id))}
    const revenue=sales.reduce((sum,sale)=>sum+Number(sale.total),0);
    const cost=filteredItems.reduce((sum,item)=>sum+Number(item.quantity)*Number(products.find(product=>product.id===item.productId)?.costPrice??0),0);
    const topMap=new Map<string,{quantity:number;revenue:number}>();
    for(const item of filteredItems){const current=topMap.get(item.productId)??{quantity:0,revenue:0};current.quantity+=Number(item.quantity);current.revenue+=Number(item.total);topMap.set(item.productId,current)}
    const topProducts=[...topMap].map(([id,value])=>({productId:id,name:products.find(product=>product.id===id)?.name??id,...value})).sort((a,b)=>b.quantity-a.quantity).slice(0,10);
    const [previous,payments,balances,allProducts,expenses,branchTotals,pets]=await Promise.all([
      prisma.sale.aggregate({where:{tenantId,branchId,status:"COMPLETED",createdAt:{gte:previousStart,lt:start}},_sum:{total:true}}),
      prisma.salePayment.groupBy({by:["method"],where:{tenantId,saleId:{in:sales.map(sale=>sale.id)}},_sum:{amount:true}}),
      prisma.stockBalance.findMany({where:{tenantId,branchId}}),
      prisma.product.findMany({where:{tenantId,deletedAt:null,active:true},select:{id:true,name:true,minimumStock:true}}),
      prisma.financialEntry.aggregate({where:{tenantId,branchId,type:"PAYABLE",status:"PAID",paidAt:{gte:start,lte:end}},_sum:{amount:true}}),
      prisma.sale.groupBy({by:["branchId"],where:{tenantId,branchId:{in:session.user.branchIds},status:"COMPLETED",createdAt:{gte:start,lte:end}},_sum:{total:true},_count:true}),
      prisma.pet.groupBy({by:["type"],where:{tenantId,customerId:{in:sales.flatMap(sale=>sale.customerId?[sale.customerId]:[])}},_count:true}),
    ]);
    const branchNames=await prisma.branch.findMany({where:{tenantId,id:{in:branchTotals.map(row=>row.branchId)}},select:{id:true,name:true}});
    const branches=branchTotals.map(row=>({branchId:row.branchId,branchName:branchNames.find(branch=>branch.id===row.branchId)?.name??"Loja removida",_sum:row._sum,_count:row._count}));
    const productMap=new Map(allProducts.map(product=>[product.id,product]));
    const lowStock=balances.filter(balance=>{const product=productMap.get(balance.productId);return product&&balance.quantity.lte(product.minimumStock)}).map(balance=>({productId:balance.productId,name:productMap.get(balance.productId)!.name,quantity:balance.quantity,minimum:productMap.get(balance.productId)!.minimumStock}));
    const previousRevenue=Number(previous._sum.total??0);
    return Response.json({period:{start,end},sales:{revenue,count:sales.length,ticket:sales.length?revenue/sales.length:0,cost,estimatedProfit:revenue-cost,changePercent:previousRevenue?((revenue-previousRevenue)/previousRevenue)*100:null},topProducts,payments,petTypes:pets,lowStock,expenses:Number(expenses._sum.amount??0),branches});
  }catch(error){return apiError(error)}
}
