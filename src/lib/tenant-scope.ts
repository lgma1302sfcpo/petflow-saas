export type TenantContext = {
  tenantId: string;
  userId: string;
  branchIds: readonly string[];
  activeBranchId?: string;
};

export class TenantAccessError extends Error {
  constructor(message = "Acesso fora do escopo da empresa.") {
    super(message);
    this.name = "TenantAccessError";
  }
}

export function assertBranchAccess(context: TenantContext, branchId: string) {
  if (!context.branchIds.includes(branchId)) {
    throw new TenantAccessError("Usuário sem acesso à loja informada.");
  }
  return branchId;
}

export function tenantWhere<T extends Record<string, unknown>>(
  context: TenantContext,
  where?: T,
): T & { tenantId: string } {
  return { ...where, tenantId: context.tenantId } as T & { tenantId: string };
}

export function tenantBranchWhere<T extends Record<string, unknown>>(
  context: TenantContext,
  branchId: string,
  where?: T,
): T & { tenantId: string; branchId: string } {
  return {
    ...where,
    tenantId: context.tenantId,
    branchId: assertBranchAccess(context, branchId),
  } as T & { tenantId: string; branchId: string };
}
