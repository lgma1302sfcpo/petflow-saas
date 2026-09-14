import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { planSchema } from "@/lib/schemas";

export async function PATCH(request:Request,context:RouteContext<"/api/platform/plans/[id]">){const session=await getServerSession(authOptions);if(session?.user.kind!=="PLATFORM")return NextResponse.json({error:"Não autorizado."},{status:401});const parsed=planSchema.partial().safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:"Plano inválido."},{status:422});const {id}=await context.params;const plan=await prisma.$transaction(async tx=>{const updated=await tx.plan.update({where:{id},data:parsed.data});await tx.auditLog.create({data:{actorType:"PLATFORM",platformUserId:session.user.id,action:"plan.update",entity:"Plan",entityId:id}});return updated});return NextResponse.json({plan})}
