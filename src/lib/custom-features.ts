/**
 * Reads per-tenant custom feature flags stored in `TenantSetting.customFeatures`.
 * The platform admin sets these from /platform (one tenant at a time, with an
 * audited reason) whenever a specific pet shop contracts a behavior that
 * shouldn't apply to every tenant. Application code that needs to branch for
 * a single client checks a flag here instead of hardcoding the tenant id.
 *
 * Example: `if (hasCustomFeature(settings.customFeatures, "sales.skip-cash-session")) {...}`
 */
export type CustomFeatureValue = string | number | boolean | null;
export type CustomFeatures = Record<string, CustomFeatureValue>;

function asRecord(customFeatures: unknown): CustomFeatures {
  return customFeatures && typeof customFeatures === "object" && !Array.isArray(customFeatures) ? (customFeatures as CustomFeatures) : {};
}

export function hasCustomFeature(customFeatures: unknown, key: string): boolean {
  return Boolean(asRecord(customFeatures)[key]);
}

export function getCustomFeature<T extends CustomFeatureValue>(customFeatures: unknown, key: string, fallback: T): T {
  const value = asRecord(customFeatures)[key];
  return value === undefined ? fallback : (value as T);
}
