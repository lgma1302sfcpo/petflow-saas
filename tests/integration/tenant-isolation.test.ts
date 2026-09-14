import { describe,expect,it } from "vitest";
import { tenantBranchWhere,tenantWhere,type TenantContext } from "@/lib/tenant-scope";

type Row={id:string;tenantId:string;branchId:string;name:string};
const rows:Row[]=[{id:"1",tenantId:"tenant-a",branchId:"a-1",name:"Registro A"},{id:"2",tenantId:"tenant-b",branchId:"b-1",name:"Registro B"}];
function findMany(where:Partial<Row>){return rows.filter(row=>Object.entries(where).every(([key,value])=>row[key as keyof Row]===value))}

describe("integração do contrato de repositório com o escopo",()=>{
  const sessionA:TenantContext={tenantId:"tenant-a",userId:"user-a",branchIds:["a-1"]};
  it("uma busca ampla retorna somente dados da empresa autenticada",()=>expect(findMany(tenantWhere(sessionA))).toEqual([rows[0]]));
  it("uma tentativa de injetar outro tenant continua isolada",()=>expect(findMany(tenantWhere(sessionA,{tenantId:"tenant-b"}))).toEqual([rows[0]]));
  it("uma tentativa de consultar filial externa é interrompida antes do repositório",()=>expect(()=>findMany(tenantBranchWhere(sessionA,"b-1"))).toThrow("Usuário sem acesso"));
});
