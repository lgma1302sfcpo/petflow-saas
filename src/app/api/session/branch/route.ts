import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { assertBranchAccess } from "@/lib/tenant-scope";

const schema=z.object({branchId:z.string().cuid()});
export async function POST(request:Request){const session=await getServerSession(authOptions);if(!session?.user.tenantId)return NextResponse.json({error:"Não autorizado."},{status:401});const parsed=schema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:"Loja inválida."},{status:422});try{assertBranchAccess({tenantId:session.user.tenantId,userId:session.user.id,branchIds:session.user.branchIds},parsed.data.branchId)}catch{return NextResponse.json({error:"Loja fora do seu acesso."},{status:403})}(await cookies()).set("petflow_branch",parsed.data.branchId,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:8*60*60});return NextResponse.json({branchId:parsed.data.branchId})}
