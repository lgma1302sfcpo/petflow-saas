import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { MODULES } from "@/lib/modules";
import { prisma } from "@/lib/prisma";

const schema=z.object({moduleKey:z.enum(MODULES),enabled:z.boolean(),reason:z.string().trim().min(5).max(300)});
export async function PATCH(request:Request,context:RouteContext<"/api/platform/tenants/[id]/modules">){const session=await getServerSession(authOptions);if(session?.user.kind!=="PLATFORM")return NextResponse.json({error:"Não autorizado."},{status:401});const parsed=schema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:"Módulo ou motivo inválido."},{status:422});const {id:tenantId}=await context.params;const moduleOverride=await prisma.$transaction(async tx=>{await tx.tenant.findUniqueOrThrow({where:{id:tenantId}});const saved=await tx.tenantModule.upsert({where:{tenantId_moduleKey:{tenantId,moduleKey:parsed.data.moduleKey}},update:{enabled:parsed.data.enabled,reason:parsed.data.reason},create:{tenantId,...parsed.data}});await tx.auditLog.create({data:{actorType:"PLATFORM",platformUserId:session.user.id,tenantId,action:"tenant.module.update",entity:"TenantModule",entityId:saved.id,reason:parsed.data.reason,metadata:{module:parsed.data.moduleKey,enabled:parsed.data.enabled}}});return saved});return NextResponse.json({module:moduleOverride})}
