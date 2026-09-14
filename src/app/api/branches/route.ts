import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { branchSchema } from "@/lib/schemas";

export async function GET(){const session=await getServerSession(authOptions);if(!session?.user.tenantId)return NextResponse.json({error:"Sem sessão."},{status:401});const branches=await prisma.branch.findMany({where:{tenantId:session.user.tenantId,id:{in:session.user.branchIds},active:true,deletedAt:null},select:{id:true,name:true,code:true},orderBy:{name:"asc"}});return NextResponse.json({branches})}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user.tenantId || !hasPermission(session.user.permissions, PERMISSIONS.SETTINGS_MANAGE)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const tenantId = session.user.tenantId;
  const parsed = branchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos.", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  const [subscription, branchCount] = await Promise.all([
    prisma.subscription.findFirst({ where: { tenantId }, include: { plan: true }, orderBy: { createdAt: "desc" } }),
    prisma.branch.count({ where: { tenantId, deletedAt: null } }),
  ]);
  if (!subscription || branchCount >= subscription.plan.maxBranches) return NextResponse.json({ error: "Limite de lojas do plano atingido." }, { status: 409 });
  const branch = await prisma.$transaction(async (tx) => {
    const created = await tx.branch.create({ data: { tenantId, ...parsed.data } });
    await tx.auditLog.create({ data: { actorType: "TENANT", tenantId, branchId: created.id, userId: session.user.id, action: "branch.create", entity: "Branch", entityId: created.id } });
    return created;
  });
  return NextResponse.json({ branch }, { status: 201 });
}
