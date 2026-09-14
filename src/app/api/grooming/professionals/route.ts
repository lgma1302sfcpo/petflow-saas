import { z } from "zod";
import { apiError,getApiContext } from "@/lib/api-context";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
const schema=z.object({name:z.string().trim().min(2).max(120),commissionPercent:z.coerce.number().min(0).max(100).default(0),simultaneousCapacity:z.coerce.number().int().min(1).max(20).default(1)});
export async function GET(){try{const {tenantId,branchId}=await getApiContext(PERMISSIONS.GROOMING_MANAGE,"grooming");return Response.json({professionals:await prisma.professional.findMany({where:{tenantId,branchId,active:true},orderBy:{name:"asc"}})})}catch(error){return apiError(error)}}
export async function POST(request:Request){try{const {tenantId,branchId,userId}=await getApiContext(PERMISSIONS.GROOMING_MANAGE,"grooming");const parsed=schema.safeParse(await request.json());if(!parsed.success)return Response.json({error:"Profissional inválido."},{status:422});const professional=await prisma.$transaction(async tx=>{const created=await tx.professional.create({data:{tenantId,branchId,...parsed.data}});await tx.auditLog.create({data:{actorType:"TENANT",tenantId,branchId,userId,action:"professional.create",entity:"Professional",entityId:created.id}});return created});return Response.json({professional},{status:201})}catch(error){return apiError(error)}}
