import { describe,expect,it } from "vitest";
import { resolveEnabledModules } from "@/lib/modules";
import { PERMISSIONS,hasPermission,requirePermission } from "@/lib/permissions";

describe("módulos e permissões",()=>{
  it("combina plano com overrides da empresa",()=>expect(resolveEnabledModules(["dashboard","sales"],[{moduleKey:"sales",enabled:false},{moduleKey:"grooming",enabled:true}]).sort()).toEqual(["dashboard","grooming"]));
  it("aplica RBAC no backend",()=>{expect(hasPermission([PERMISSIONS.USERS_MANAGE],PERMISSIONS.USERS_MANAGE)).toBe(true);expect(()=>requirePermission([],PERMISSIONS.USERS_MANAGE)).toThrow("FORBIDDEN_PERMISSION")});
});
