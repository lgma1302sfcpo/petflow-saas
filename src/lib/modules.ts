export const MODULES = [
  "dashboard",
  "products",
  "stock",
  "customers",
  "sales",
  "cash",
  "grooming",
  "finance",
  "reports",
  "fiscal",
] as const;

export type ModuleKey = (typeof MODULES)[number];

export function resolveEnabledModules(
  planModules: readonly string[],
  overrides: ReadonlyArray<{ moduleKey: string; enabled: boolean }>,
) {
  const enabled = new Set(planModules);
  for (const override of overrides) {
    if (override.enabled) enabled.add(override.moduleKey);
    else enabled.delete(override.moduleKey);
  }
  return [...enabled];
}
