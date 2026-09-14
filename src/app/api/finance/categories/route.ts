import { z } from "zod";
import { apiError,getApiContext } from "@/lib/api-context";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
const schema=z.object({name:z.string().trim().min(2).max(100),type:z.enum(["PAYABLE","RECEIVABLE"])});
export async function GET(){try{const {tenantId}=await getApiContext(PERMISSIONS.FINANCE_VIEW,"finance");return Response.json({categories:await prisma.financialCategory.findMany({where:{tenantId,active:true},orderBy:{name:"asc"}})})}catch(error){return apiError(error)}}
export async function POST(request:Request){try{const {tenantId,branchId,userId}=await getApiContext(PERMISSIONS.FINANCE_VIEW,"finance");const parsed=schema.safeParse(await request.json());if(!parsed.success)return Response.json({error:"Categoria inválida."},{status:422});const category=await prisma.$transaction(async tx=>{const created=await tx.financialCategory.upsert({where:{tenantId_name_type:{tenantId,name:parsed.data.name,type:parsed.data.type}},update:{active:true},create:{tenantId,...parsed.data}});await tx.auditLog.create({data:{actorType:"TENANT",tenantId,branchId,userId,action:"finance.category.create",entity:"FinancialCategory",entityId:created.id}});return created});return Response.json({category},{status:201})}catch(error){return apiError(error)}}
