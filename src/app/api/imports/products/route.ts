import { apiError,getApiContext } from "@/lib/api-context";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { productInput } from "@/modules/commerce/schemas";
function parseCsv(text:string){const lines=text.replace(/^\uFEFF/,"").split(/\r?\n/).filter(Boolean);if(!lines.length)return [];const split=(line:string)=>line.split(/[,;]/).map(v=>v.trim().replace(/^"|"$/g,""));const headers=split(lines[0]);return lines.slice(1).map(line=>Object.fromEntries(split(line).map((value,index)=>[headers[index],value])))}
export async function POST(request:Request){
  try{
    const {tenantId,branchId,userId}=await getApiContext(PERMISSIONS.PRODUCTS_VIEW_CREATE,"products");
    const body=await request.json() as {csv?:string;rows?:unknown[];commit?:boolean;idempotencyKey?:string};
    const raw=(Array.isArray(body.rows)?body.rows:parseCsv(body.csv??"")).map(row=>typeof row==="object"&&row!==null?row as Record<string,unknown>:{});
    if(raw.length>5000)return Response.json({error:"Limite de 5.000 linhas por importação."},{status:422});
    const validated=raw.map((row,index)=>{const parsed=productInput.safeParse({...row,salePrice:row.salePrice??"0",costPrice:row.costPrice??"0",minimumStock:row.minimumStock??"0",bulkSale:[true,"true","1","sim"].includes(row.bulkSale as never)});return parsed.success?{index:index+2,data:parsed.data,error:undefined}:{index:index+2,data:undefined,error:parsed.error.issues.map(issue=>issue.message).join("; ")}});
    const errors=validated.filter(item=>item.error);
    if(!body.commit)return Response.json({preview:validated.slice(0,100),totalRows:raw.length,validRows:raw.length-errors.length,errorRows:errors.length});
    if(!body.idempotencyKey)return Response.json({error:"idempotencyKey é obrigatório para confirmar."},{status:422});
    const existing=await prisma.importJob.findUnique({where:{tenantId_idempotencyKey:{tenantId,idempotencyKey:body.idempotencyKey}}});
    if(existing)return Response.json({job:existing,replayed:true});
    const job=await prisma.importJob.create({data:{tenantId,branchId,createdById:userId,idempotencyKey:body.idempotencyKey,type:"PRODUCTS",status:"PROCESSING",totalRows:raw.length,errorRows:errors.length,errors:errors.slice(0,500).map(item=>({line:item.index,error:item.error}))}});
    const valid=validated.filter(item=>item.data);
    let processed=0;
    for(let start=0;start<valid.length;start+=100){
      const batch=valid.slice(start,start+100);
      await prisma.$transaction(async tx=>{
        for(const item of batch){const d=item.data!;const product=await tx.product.upsert({where:{tenantId_internalCode:{tenantId,internalCode:d.internalCode}},update:{name:d.name,sku:d.sku||null,barcode:d.barcode||null,category:d.category||null,brand:d.brand||null,supplier:d.supplier||null,species:d.species||null,unit:d.unit,salePrice:d.salePrice,costPrice:d.costPrice,bulkSale:d.bulkSale,minimumStock:d.minimumStock,location:d.location||null,active:true,deletedAt:null},create:{tenantId,name:d.name,internalCode:d.internalCode,sku:d.sku||null,barcode:d.barcode||null,category:d.category||null,brand:d.brand||null,supplier:d.supplier||null,species:d.species||null,unit:d.unit,salePrice:d.salePrice,costPrice:d.costPrice,bulkSale:d.bulkSale,minimumStock:d.minimumStock,location:d.location||null}});await tx.productBranch.upsert({where:{productId_branchId:{productId:product.id,branchId}},update:{active:true},create:{tenantId,productId:product.id,branchId}});processed++}
        await tx.importJob.update({where:{id:job.id},data:{processedRows:processed}});
      });
    }
    const completed=await prisma.$transaction(async tx=>{const updated=await tx.importJob.update({where:{id:job.id},data:{status:errors.length?"COMPLETED_WITH_ERRORS":"COMPLETED",completedAt:new Date()}});await tx.auditLog.create({data:{actorType:"TENANT",tenantId,branchId,userId,action:"product.import",entity:"ImportJob",entityId:job.id,metadata:{processed,errors:errors.length}}});return updated});
    return Response.json({job:completed},{status:201});
  }catch(error){return apiError(error)}
}
