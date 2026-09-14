import { apiError,getApiContext } from "@/lib/api-context";
import { PERMISSIONS } from "@/lib/permissions";
import { quantity } from "@/lib/money";
import { prisma } from "@/lib/prisma";
type StockRow={line:number;internalCode:string;quantity:string};
const parse=(text:string)=>{const lines=text.replace(/^\uFEFF/,"").split(/\r?\n/).filter(Boolean),headers=lines[0]?.split(/[,;]/).map(v=>v.trim())??[];return lines.slice(1).map((line,index)=>({line:index+2,...Object.fromEntries(line.split(/[,;]/).map((v,i)=>[headers[i],v.trim().replace(/^"|"$/g,"")]))}) as StockRow)};
export async function POST(request:Request){
  try{
    const {tenantId,branchId,userId}=await getApiContext(PERMISSIONS.STOCK_VIEW_MOVE,"stock");
    const body=await request.json() as {csv:string;commit?:boolean;idempotencyKey?:string};
    const rows=parse(body.csv??"");
    if(rows.length>5000)return Response.json({error:"Limite de 5.000 linhas."},{status:422});
    const codes=[...new Set(rows.map(row=>row.internalCode))];
    const products=await prisma.product.findMany({where:{tenantId,internalCode:{in:codes},deletedAt:null}});
    const map=new Map(products.map(product=>[product.internalCode,product]));
    const checked=rows.map(row=>{const product=map.get(row.internalCode);let error="";try{if(!product)error="Produto não encontrado";else if(quantity(row.quantity).lt(0))error="Quantidade negativa"}catch{error="Quantidade inválida"}return {...row,product,error}});
    const errors=checked.filter(row=>row.error);
    if(!body.commit)return Response.json({preview:checked.map(({product,...row})=>({...row,productId:product?.id})).slice(0,100),totalRows:rows.length,validRows:rows.length-errors.length,errorRows:errors.length});
    if(!body.idempotencyKey)return Response.json({error:"Chave de idempotência obrigatória."},{status:422});
    const existing=await prisma.importJob.findUnique({where:{tenantId_idempotencyKey:{tenantId,idempotencyKey:body.idempotencyKey}}});
    if(existing)return Response.json({job:existing,replayed:true});
    const job=await prisma.importJob.create({data:{tenantId,branchId,createdById:userId,idempotencyKey:body.idempotencyKey,type:"STOCK",status:"PROCESSING",totalRows:rows.length,errorRows:errors.length,errors:errors.map(error=>({line:error.line,error:error.error})).slice(0,500)}});
    let processed=0;
    const valid=checked.filter(row=>!row.error&&row.product);
    for(let start=0;start<valid.length;start+=100){
      const batch=valid.slice(start,start+100);
      await prisma.$transaction(async tx=>{
        for(const row of batch){
          const qty=quantity(row.quantity);
          const current=await tx.stockBalance.upsert({where:{tenantId_branchId_productId:{tenantId,branchId,productId:row.product!.id}},update:{},create:{tenantId,branchId,productId:row.product!.id,quantity:0,averageCost:row.product!.costPrice}});
          const delta=qty.minus(current.quantity);
          const balance=await tx.stockBalance.update({where:{id:current.id},data:{quantity:qty}});
          await tx.stockMovement.create({data:{tenantId,branchId,productId:row.product!.id,userId,type:"INVENTORY",quantity:delta,balanceAfter:balance.quantity,reason:"Importação de estoque",referenceType:"ImportJob",referenceId:job.id}});
          processed++;
        }
        await tx.importJob.update({where:{id:job.id},data:{processedRows:processed}});
      });
    }
    const completed=await prisma.importJob.update({where:{id:job.id},data:{status:errors.length?"COMPLETED_WITH_ERRORS":"COMPLETED",completedAt:new Date()}});
    return Response.json({job:completed},{status:201});
  }catch(error){return apiError(error)}
}
