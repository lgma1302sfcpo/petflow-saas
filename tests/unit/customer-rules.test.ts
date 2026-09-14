import { describe,expect,it } from "vitest";
import { missingRequiredCustomerFields,requiredCustomerFieldsMessage } from "@/lib/customer-rules";
describe("campos obrigatórios configuráveis do cliente",()=>{
  it("aceita todos os campos definidos pela empresa",()=>expect(missingRequiredCustomerFields(["fullName","phone"],{fullName:"Ana",phone:"11999999999"})).toEqual([]));
  it("detecta texto vazio e valor ausente",()=>expect(missingRequiredCustomerFields(["fullName","phone","document"],{fullName:" ",phone:"11999999999"})).toEqual(["fullName","document"]));
  it("gera mensagem amigável em português",()=>expect(requiredCustomerFieldsMessage(["address","birthDate"])).toContain("endereço, data de nascimento"));
});
