import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({ status: z.enum(["TRIAL", "ACTIVE", "SUSPENDED", "CANCELLED"]), reason: z.string().trim().min(5).max(300) });

export async function PATCH(request: Request, context: RouteContext<"/api/platform/tenants/[id]/status">) {
  const session = await getServerSession(authOptions);
  if (session?.user.kind !== "PLATFORM") return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Status ou motivo inválido." }, { status: 422 });
  const { id } = await context.params;
  const tenant = await prisma.$transaction(async (tx) => {
    const updated = await tx.tenant.update({
      where: { id },
      data: {
        status: parsed.data.status,
        suspendedAt: parsed.data.status === "SUSPENDED" ? new Date() : null,
        cancelledAt: parsed.data.status === "CANCELLED" ? new Date() : null,
      },
    });
    await tx.auditLog.create({ data: { actorType: "PLATFORM", platformUserId: session.user.id, tenantId: id, action: "tenant.status.update", entity: "Tenant", entityId: id, reason: parsed.data.reason, metadata: { status: parsed.data.status } } });
    return updated;
  });
  return NextResponse.json({ tenant });
}
