import { describe,expect,it } from "vitest";
import { TenantAccessError,assertBranchAccess,tenantBranchWhere,tenantWhere,type TenantContext } from "@/lib/tenant-scope";

const context:TenantContext={tenantId:"tenant-a",userId:"user-a",branchIds:["branch-a","branch-b"]};
describe("escopo multiempresa",()=>{
  it("sempre substitui um tenantId malicioso pelo tenant da sessão",()=>expect(tenantWhere(context,{tenantId:"tenant-b",active:true})).toEqual({tenantId:"tenant-a",active:true}));
  it("aceita somente lojas vinculadas à sessão",()=>expect(tenantBranchWhere(context,"branch-a",{deletedAt:null})).toEqual({tenantId:"tenant-a",branchId:"branch-a",deletedAt:null}));
  it("rejeita loja de outra empresa",()=>expect(()=>assertBranchAccess(context,"branch-from-tenant-b")).toThrow(TenantAccessError));
});
