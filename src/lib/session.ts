import "server-only";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import type { TenantContext } from "@/lib/tenant-scope";

export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.valid === false) redirect("/login?error=session-expired");
  return session;
}

export async function requirePlatformSession() {
  const session = await requireSession();
  if (session.user.kind !== "PLATFORM") redirect("/app");
  return session;
}

export async function requireTenantSession() {
  const session = await requireSession();
  if (session.user.kind !== "TENANT" || !session.user.tenantId) redirect("/platform");
  return session;
}

export function tenantContextFromSession(session: Awaited<ReturnType<typeof requireTenantSession>>): TenantContext {
  return {
    tenantId: session.user.tenantId!,
    userId: session.user.id,
    branchIds: session.user.branchIds,
  };
}
