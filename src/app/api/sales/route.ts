import { Prisma } from "@/generated/prisma/client";
import { apiError,getApiContext } from "@/lib/api-context";
import { bulkFromAmount,money,quantity } from "@/lib/money";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { saleInput } from "@/modules/commerce/schemas";

export async function GET(){
  try{
    const {tenantId,branchId}=await getApiContext(PERMISSIONS.SALES_VIEW_CREATE,"sales");
    const sales=await prisma.sale.findMany({where:{tenantId,branchId},orderBy:{createdAt:"desc"},take:100});
    return Response.json({sales});
  }catch(error){return apiError(error)}
}

export async function POST(request:Request){
  try{
    const {tenantId,branchId,userId}=await getApiContext(PERMISSIONS.SALES_VIEW_CREATE,"sales");
    const parsed=saleInput.safeParse(await request.json());
    if(!parsed.success)return Response.json({error:"Venda inválida.",fields:parsed.error.flatten().fieldErrors},{status:422});
    const input=parsed.data;
    const existing=await prisma.sale.findUnique({where:{tenantId_idempotencyKey:{tenantId,idempotencyKey:input.idempotencyKey}}});
    if(existing)return Response.json({sale:existing,replayed:true});
    const productIds=[...new Set(input.items.map(item=>item.productId))];
    const [settings,cash,products,availability]=await Promise.all([
      prisma.tenantSetting.findUniqueOrThrow({where:{tenantId}}),
      prisma.cashSession.findFirst({where:{tenantId,branchId,operatorId:userId,status:{in:["OPEN","REOPENED"]}},orderBy:{openedAt:"desc"}}),
      prisma.product.findMany({where:{tenantId,id:{in:productIds},active:true,deletedAt:null}}),
      prisma.productBranch.findMany({where:{tenantId,branchId,productId:{in:productIds},active:true},select:{productId:true}}),
    ]);
    if(!cash)return Response.json({error:"Abra o caixa antes de registrar uma venda."},{status:409});
    if(settings.customerRequiredOnSale&&!input.customerId)return Response.json({error:"Cliente obrigatório para esta empresa."},{status:422});
    if(input.customerId&&!await prisma.customer.findFirst({where:{id:input.customerId,tenantId,deletedAt:null}}))return Response.json({error:"Cliente inválido."},{status:403});
    if(products.length!==productIds.length||!settings.shareProductsAcrossBranches&&availability.length!==productIds.length)return Response.json({error:"Um produto não está disponível nesta loja."},{status:404});
    const accepted=new Set(settings.acceptedPaymentMethods.length?settings.acceptedPaymentMethods:["PIX","DINHEIRO","DEBITO","CREDITO"]);
    if(input.payments.some(payment=>!accepted.has(payment.method)))return Response.json({error:"Forma de pagamento não aceita por esta empresa."},{status:422});
    const productMap=new Map(products.map(product=>[product.id,product]));
    const lines=input.items.map(item=>{
      const product=productMap.get(item.productId)!;
      let qty;
      let base;
      if(product.bulkSale&&item.chargedAmount){
        if(!settings.bulkSaleEnabled)throw new Error("Venda a granel não está habilitada.");
        const bulk=bulkFromAmount(product.salePrice,item.chargedAmount);
        qty=bulk.quantity;
        base=bulk.chargedAmount;
      }else{
        if(!item.quantity)throw new Error("Quantidade obrigatória.");
        qty=quantity(item.quantity);
        base=money(qty.mul(product.salePrice));
      }
      const discount=money(item.discount);
      const total=money(base.minus(discount));
      if(qty.lte(0)||discount.lt(0)||total.lt(0))throw new Error("Valores de item inválidos.");
      return {product,quantity:qty,unitPrice:product.salePrice,discount,total,base,bulkChargedAmount:item.chargedAmount?money(item.chargedAmount):null};
    });
    const subtotal=money(lines.reduce((sum,line)=>sum.add(line.base),new Prisma.Decimal(0)));
    const discount=money(input.discount).add(lines.reduce((sum,line)=>sum.add(line.discount),new Prisma.Decimal(0)));
    const total=money(subtotal.minus(discount));
    if(total.lt(0))return Response.json({error:"O desconto não pode superar o subtotal."},{status:422});
    const paymentTotal=money(input.payments.reduce((sum,payment)=>sum.add(money(payment.amount)),new Prisma.Decimal(0)));
    if(!paymentTotal.equals(total))return Response.json({error:`Pagamentos devem totalizar exatamente ${total.toFixed(2)}.`},{status:422});
    const sale=await prisma.$transaction(async tx=>{
      for(const line of lines){
        const balance=await tx.stockBalance.upsert({where:{tenantId_branchId_productId:{tenantId,branchId,productId:line.product.id}},update:{},create:{tenantId,branchId,productId:line.product.id,quantity:0,averageCost:line.product.costPrice}});
        if(settings.allowNegativeStock){
          await tx.stockBalance.update({where:{id:balance.id},data:{quantity:{decrement:line.quantity}}});
        }else{
          const updated=await tx.stockBalance.updateMany({where:{id:balance.id,quantity:{gte:line.quantity}},data:{quantity:{decrement:line.quantity}}});
          if(updated.count!==1)throw new Error(`Estoque insuficiente: ${line.product.name}`);
        }
        const current=await tx.stockBalance.findUniqueOrThrow({where:{id:balance.id}});
        await tx.stockMovement.create({data:{tenantId,branchId,productId:line.product.id,userId,type:"SALE",quantity:line.quantity.negated(),unitCost:current.averageCost,balanceAfter:current.quantity,reason:"Venda"}});
      }
      const created=await tx.sale.create({data:{tenantId,branchId,cashSessionId:cash.id,customerId:input.customerId||null,createdById:userId,idempotencyKey:input.idempotencyKey,subtotal,discount,total}});
      await tx.saleItem.createMany({data:lines.map(line=>({tenantId,saleId:created.id,productId:line.product.id,description:line.product.name,quantity:line.quantity,unitPrice:line.unitPrice,discount:line.discount,total:line.total,bulkChargedAmount:line.bulkChargedAmount}))});
      await tx.salePayment.createMany({data:input.payments.map(payment=>({tenantId,saleId:created.id,method:payment.method,amount:money(payment.amount)}))});
      if(input.customerId)await tx.customer.update({where:{id:input.customerId},data:{lastPurchaseAt:new Date()}});
      await tx.auditLog.create({data:{actorType:"TENANT",tenantId,branchId,userId,action:"sale.create",entity:"Sale",entityId:created.id,metadata:{total:total.toString()}}});
      return created;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    return Response.json({sale},{status:201});
  }catch(error){
    if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2002")return Response.json({error:"Esta operação já foi processada."},{status:409});
    if(error instanceof Error&&(error.message.startsWith("Estoque insuficiente")||error.message.includes("obrigatória")||error.message.includes("inválidos")||error.message.includes("habilitada")))return Response.json({error:error.message},{status:409});
    return apiError(error);
  }
}
