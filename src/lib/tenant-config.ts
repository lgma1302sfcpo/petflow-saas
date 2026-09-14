type Primitive=string|number|boolean|null;type FeatureMap=Record<string,Primitive>;
export function mergeTenantFeatures(tenant:unknown,branch:unknown):FeatureMap{const safe=(value:unknown):FeatureMap=>value&&typeof value==="object"&&!Array.isArray(value)?value as FeatureMap:{};return {...safe(tenant),...safe(branch)}}
export function featureEnabled(features:FeatureMap,key:string,fallback=false){const value=features[key];return typeof value==="boolean"?value:fallback}
