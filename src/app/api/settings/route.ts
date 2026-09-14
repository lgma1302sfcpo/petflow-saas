import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { PERMISSIONS,hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { tenantSettingsSchema } from "@/lib/schemas";

export async function GET(){const session=await getServerSession(authOptions);if(!session?.user.tenantId)return NextResponse.json({error:"Sem sessão."},{status:401});return NextResponse.json({settings:await prisma.tenantSetting.findUnique({where:{tenantId:session.user.tenantId}})})}

export async function PATCH(request:Request){const session=await getServerSession(authOptions);if(!session?.user.tenantId||!hasPermission(session.user.permissions,PERMISSIONS.SETTINGS_MANAGE))return NextResponse.json({error:"Sem permissão."},{status:403});const tenantId=session.user.tenantId;const parsed=tenantSettingsSchema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:"Configuração inválida.",fields:parsed.error.flatten().fieldErrors},{status:422});const settings=await prisma.$transaction(async tx=>{const updated=await tx.tenantSetting.update({where:{tenantId},data:parsed.data});await tx.auditLog.create({data:{actorType:"TENANT",tenantId,userId:session.user.id,action:"settings.update",entity:"TenantSetting",entityId:tenantId}});return updated});return NextResponse.json({settings})}
