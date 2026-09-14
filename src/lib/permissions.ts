export const PERMISSIONS = {
  SALES_VIEW_CREATE: "sales:view-create",
  SALES_VIEW_CANCEL: "sales:view-cancel",
  CASH_VIEW_OPERATE: "cash:view-operate",
  STOCK_VIEW_MOVE: "stock:view-move",
  PRODUCTS_VIEW_CREATE: "products:view-create",
  CUSTOMERS_VIEW_CREATE: "customers:view-create",
  REPORTS_VIEW: "reports:view",
  FINANCE_VIEW: "finance:view",
  GROOMING_MANAGE: "grooming:manage",
  USERS_MANAGE: "users:manage",
  SETTINGS_MANAGE: "settings:manage",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export function hasPermission(granted: readonly string[], required: PermissionKey) {
  return granted.includes(required);
}

export function requirePermission(granted: readonly string[], required: PermissionKey) {
  if (!hasPermission(granted, required)) {
    throw new Error("FORBIDDEN_PERMISSION");
  }
}
