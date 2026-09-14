import { hash } from "bcryptjs";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { employeeSchema } from "@/lib/schemas";

export async function GET(){const session=await getServerSession(authOptions);if(!session?.user.tenantId||!hasPermission(session.user.permissions,PERMISSIONS.USERS_MANAGE))return NextResponse.json({error:"Sem permissão."},{status:403});const users=await prisma.user.findMany({where:{tenantId:session.user.tenantId,deletedAt:null},select:{id:true,name:true,username:true,status:true,roleId:true,branches:{select:{branchId:true}}},orderBy:{name:"asc"}});return NextResponse.json({users:users.map(user=>({...user,branchIds:user.branches.map(branch=>branch.branchId)}))})}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user.tenantId || !hasPermission(session.user.permissions, PERMISSIONS.USERS_MANAGE)) {
    return NextResponse.json({ error: "Sem permissão para administrar usuários." }, { status: 403 });
  }
  const tenantId = session.user.tenantId;
  const parsed = employeeSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos.", fields: parsed.error.flatten().fieldErrors }, { status: 422 });

  const [role, branches, subscription, userCount] = await Promise.all([
    prisma.role.findFirst({ where: { id: parsed.data.roleId, tenantId } }),
    prisma.branch.findMany({ where: { id: { in: parsed.data.branchIds }, tenantId, deletedAt: null } }),
    prisma.subscription.findFirst({ where: { tenantId }, include: { plan: true }, orderBy: { createdAt: "desc" } }),
    prisma.user.count({ where: { tenantId, deletedAt: null } }),
  ]);
  if (!role || branches.length !== parsed.data.branchIds.length) return NextResponse.json({ error: "Cargo ou loja fora da empresa." }, { status: 403 });
  if (!subscription || userCount >= subscription.plan.maxUsers) return NextResponse.json({ error: "Limite de usuários do plano atingido." }, { status: 409 });

  const passwordHash = await hash(parsed.data.password, 12);
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        tenantId,
        roleId: role.id,
        name: parsed.data.name,
        username: parsed.data.username,
        passwordHash,
        branches: { create: branches.map((branch) => ({ tenantId, branchId: branch.id })) },
      },
      select: { id: true, name: true, username: true, status: true },
    });
    await tx.auditLog.create({ data: { actorType: "TENANT", tenantId, userId: session.user.id, action: "user.create", entity: "User", entityId: created.id } });
    return created;
  });
  return NextResponse.json({ user }, { status: 201 });
}
