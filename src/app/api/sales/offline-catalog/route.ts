import { apiError,getApiContext } from "@/lib/api-context";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(){
  try{
    const {tenantId,branchId,userId}=await getApiContext(PERMISSIONS.SALES_VIEW_CREATE,"sales");
    const [settings,products,cash]=await Promise.all([
      prisma.tenantSetting.findUniqueOrThrow({where:{tenantId}}),
      prisma.product.findMany({where:{tenantId,active:true,deletedAt:null},orderBy:{name:"asc"},take:500}),
      prisma.cashSession.findFirst({where:{tenantId,branchId,operatorId:userId,status:{in:["OPEN","REOPENED"]}},orderBy:{openedAt:"desc"}}),
    ]);
    const availability=settings.shareProductsAcrossBranches?null:new Set((await prisma.productBranch.findMany({where:{tenantId,branchId,active:true,productId:{in:products.map(product=>product.id)}},select:{productId:true}})).map(item=>item.productId));
    const available=products.filter(product=>!availability||availability.has(product.id));
    return Response.json({cashSessionId:cash?.id??null,products:available.map(({id,name,internalCode,sku,barcode,salePrice,bulkSale,unit})=>({id,name,internalCode,sku,barcode,salePrice:salePrice.toString(),bulkSale,unit}))});
  }catch(error){return apiError(error)}
}
