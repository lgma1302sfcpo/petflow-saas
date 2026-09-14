import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { planSchema } from "@/lib/schemas";

export async function POST(request:Request){const session=await getServerSession(authOptions);if(session?.user.kind!=="PLATFORM")return NextResponse.json({error:"Não autorizado."},{status:401});const parsed=planSchema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:"Plano inválido.",fields:parsed.error.flatten().fieldErrors},{status:422});const plan=await prisma.$transaction(async tx=>{const created=await tx.plan.create({data:parsed.data});await tx.auditLog.create({data:{actorType:"PLATFORM",platformUserId:session.user.id,action:"plan.create",entity:"Plan",entityId:created.id}});return created});return NextResponse.json({plan},{status:201})}
