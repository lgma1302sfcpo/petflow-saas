import { z } from "zod";
import { apiError,getApiContext } from "@/lib/api-context";
import { money } from "@/lib/money";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
const schema=z.object({name:z.string().trim().min(2).max(120),durationMinutes:z.coerce.number().int().min(10).max(720),price:z.union([z.string(),z.number()]),commissionPercent:z.coerce.number().min(0).max(100).default(0)});
export async function GET(){try{const {tenantId}=await getApiContext(PERMISSIONS.GROOMING_MANAGE,"grooming");return Response.json({services:await prisma.groomingService.findMany({where:{tenantId,active:true},orderBy:{name:"asc"}})})}catch(error){return apiError(error)}}
export async function POST(request:Request){try{const {tenantId,branchId,userId}=await getApiContext(PERMISSIONS.GROOMING_MANAGE,"grooming");const parsed=schema.safeParse(await request.json());if(!parsed.success)return Response.json({error:"Serviço inválido."},{status:422});const service=await prisma.$transaction(async tx=>{const created=await tx.groomingService.create({data:{tenantId,...parsed.data,price:money(parsed.data.price)}});await tx.auditLog.create({data:{actorType:"TENANT",tenantId,branchId,userId,action:"grooming.service.create",entity:"GroomingService",entityId:created.id}});return created});return Response.json({service},{status:201})}catch(error){return apiError(error)}}
