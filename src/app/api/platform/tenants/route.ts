import { hash } from "bcryptjs";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { tenantSchema } from "@/lib/schemas";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user.kind !== "PLATFORM") return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const tenants = await prisma.tenant.findMany({
    include: { branches: true, users: true, subscriptions: { include: { plan: true }, orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ tenants });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user.kind !== "PLATFORM") return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const parsed = tenantSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos.", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
  const data = parsed.data;
  const passwordHash = await hash(data.adminPassword, 12);

  try {
    const tenant = await prisma.$transaction(async (tx) => {
      const plan = await tx.plan.findUniqueOrThrow({ where: { id: data.planId } });
      const created = await tx.tenant.create({
        data: {
          name: data.name,
          slug: data.slug,
          document: data.document,
          trialEndsAt: new Date(Date.now() + 14 * 86_400_000),
          settings: { create: { acceptedPaymentMethods: ["PIX", "DINHEIRO", "DEBITO", "CREDITO"], requiredCustomerFields: ["fullName", "phone"] } },
          subscriptions: { create: { planId: plan.id, trialEndsAt: new Date(Date.now() + 14 * 86_400_000) } },
          branches: { create: { name: "Matriz", code: "MATRIZ" } },
        },
        include: { branches: true },
      });
      const permissions = await tx.permission.findMany({ where: { key: { in: Object.values(PERMISSIONS) } } });
      const role = await tx.role.create({
        data: {
          tenantId: created.id,
          name: "Administrador",
          system: true,
          permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) },
        },
      });
      const user = await tx.user.create({
        data: {
          tenantId: created.id,
          roleId: role.id,
          name: data.adminName,
          username: data.adminUsername,
          passwordHash,
          branches: { create: created.branches.map((branch) => ({ branchId: branch.id })) },
        },
      });
      await tx.auditLog.create({
        data: { actorType: "PLATFORM", platformUserId: session.user.id, action: "tenant.create", entity: "Tenant", entityId: created.id, tenantId: created.id, metadata: { adminUserId: user.id, planId: plan.id } },
      });
      return created;
    });
    return NextResponse.json({ tenant }, { status: 201 });
  } catch (error) {
    console.error("tenant.create failed", error);
    return NextResponse.json({ error: "Não foi possível criar a empresa. Verifique slug, documento e plano." }, { status: 409 });
  }
}
