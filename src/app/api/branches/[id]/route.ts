import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { PERMISSIONS,hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const schema=z.object({name:z.string().trim().min(2).max(100).optional(),code:z.string().trim().min(2).max(24).regex(/^[A-Z0-9_-]+$/i).optional(),active:z.boolean().optional()});
export async function PATCH(request:Request,context:RouteContext<"/api/branches/[id]">){const session=await getServerSession(authOptions);if(!session?.user.tenantId||!hasPermission(session.user.permissions,PERMISSIONS.SETTINGS_MANAGE))return NextResponse.json({error:"Sem permissão."},{status:403});const parsed=schema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:"Dados inválidos."},{status:422});const tenantId=session.user.tenantId;const {id}=await context.params;if(!await prisma.branch.findFirst({where:{id,tenantId,deletedAt:null}}))return NextResponse.json({error:"Loja não encontrada."},{status:404});if(parsed.data.active===false&&await prisma.branch.count({where:{tenantId,active:true,deletedAt:null}})<=1)return NextResponse.json({error:"A empresa precisa manter ao menos uma loja ativa."},{status:409});const branch=await prisma.$transaction(async tx=>{const updated=await tx.branch.update({where:{id},data:parsed.data});await tx.auditLog.create({data:{actorType:"TENANT",tenantId,branchId:id,userId:session.user.id,action:"branch.update",entity:"Branch",entityId:id}});return updated});return NextResponse.json({branch})}
