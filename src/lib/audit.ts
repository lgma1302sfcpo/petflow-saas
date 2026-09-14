import "server-only";
import { prisma } from "@/lib/prisma";

type AuditInput = {
  tenantId?: string;
  branchId?: string;
  userId?: string;
  platformUserId?: string;
  actorType: "PLATFORM" | "TENANT" | "SYSTEM";
  action: string;
  entity: string;
  entityId?: string;
  reason?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export async function audit(input: AuditInput) {
  await prisma.auditLog.create({ data: input });
}
