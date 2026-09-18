import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const schema=z.object({key:z.string().trim().min(2).max(100),value:z.union([z.string(),z.number(),z.boolean(),z.null()]),reason:z.string().trim().min(5).max(300)});

export async function PATCH(request:Request,context:RouteContext<"/api/platform/tenants/[id]/feature-flags">){
  const session=await getServerSession(authOptions);
  if(session?.user.kind!=="PLATFORM")return NextResponse.json({error:"Não autorizado."},{status:401});
  const parsed=schema.safeParse(await request.json());
  if(!parsed.success)return NextResponse.json({error:"Funcionalidade personalizada inválida."},{status:422});
  const {id:tenantId}=await context.params;
  const settings=await prisma.$transaction(async tx=>{
    await tx.tenant.findUniqueOrThrow({where:{id:tenantId}});
    const current=await tx.tenantSetting.findUnique({where:{tenantId}});
    const customFeatures={...(current?.customFeatures as Record<string,unknown>??{})};
    if(parsed.data.value===null)delete customFeatures[parsed.data.key];
    else customFeatures[parsed.data.key]=parsed.data.value;
    const asJson=customFeatures as Prisma.InputJsonValue;
    const saved=await tx.tenantSetting.upsert({where:{tenantId},update:{customFeatures:asJson},create:{tenantId,customFeatures:asJson}});
    await tx.auditLog.create({data:{actorType:"PLATFORM",platformUserId:session.user.id,tenantId,action:"tenant.feature-flag.update",entity:"TenantSetting",entityId:saved.tenantId,reason:parsed.data.reason,metadata:{key:parsed.data.key,value:parsed.data.value}}});
    return saved;
  });
  return NextResponse.json({settings});
}
