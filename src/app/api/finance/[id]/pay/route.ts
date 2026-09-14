import { z } from "zod";
import { apiError,getApiContext } from "@/lib/api-context";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
const schema=z.object({paymentMethod:z.string().trim().min(2).max(30)});
export async function PATCH(request:Request,context:RouteContext<"/api/finance/[id]/pay">){try{const {tenantId,branchId,userId}=await getApiContext(PERMISSIONS.FINANCE_VIEW,"finance");const parsed=schema.safeParse(await request.json());if(!parsed.success)return Response.json({error:"Forma de pagamento obrigatória."},{status:422});const {id}=await context.params;if(!await prisma.financialEntry.findFirst({where:{id,tenantId,branchId,status:"OPEN"}}))return Response.json({error:"Lançamento não encontrado."},{status:404});const entry=await prisma.$transaction(async tx=>{const updated=await tx.financialEntry.update({where:{id},data:{status:"PAID",paidAt:new Date(),paymentMethod:parsed.data.paymentMethod}});await tx.auditLog.create({data:{actorType:"TENANT",tenantId,branchId,userId,action:"finance.entry.pay",entity:"FinancialEntry",entityId:id}});return updated});return Response.json({entry})}catch(error){return apiError(error)}}
