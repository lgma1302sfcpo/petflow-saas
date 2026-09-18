import { describe,expect,it } from "vitest";
import { buildNfeXml } from "@/lib/fiscal/nfe-xml-builder";
import type { FiscalProviderRequest } from "@/lib/fiscal/fiscal-provider.interface";

function baseRequest(overrides: Partial<FiscalProviderRequest> = {}): FiscalProviderRequest {
  return {
    documentId: "doc-1",
    type: "NFCE",
    series: 1,
    number: 10,
    environment: "HOMOLOGATION",
    issuer: {
      legalName: "Pet & Companhia LTDA", tradeName: "Pet & Companhia", cnpj: "12345678000190", stateRegistration: "123456789",
      taxRegime: "SIMPLES_NACIONAL", street: "Rua das Flores", number: "100", district: "Centro", city: "São Paulo",
      cityCode: "3550308", state: "SP", zipCode: "01000000"
    },
    sale: {
      code: "sale-1", total: 100, soldAt: new Date("2026-03-01T10:00:00-03:00"), customerName: "Consumidor final",
      paymentMethod: "DINHEIRO", discount: 0, surcharge: 0,
      items: [{ code: "PROD-1", description: "Ração Premium", quantity: 2, unitPrice: 50, discount: 0, unit: "UN", ncm: "23091000", cfop: "5102" }]
    },
    ...overrides
  };
}

describe("montagem do XML da NF-e/NFC-e", () => {
  it("monta um XML de NFC-e válido com a chave de acesso embutida", () => {
    const result = buildNfeXml(baseRequest(), "chave-privada-nao-usada-sem-contingencia");
    expect(result.accessKey).toHaveLength(44);
    expect(result.xml).toContain(`Id="NFe${result.accessKey}"`);
    expect(result.xml).toContain("<mod>65</mod>");
    expect(result.xml).toContain("<vNF>100.00</vNF>");
    expect(result.xml).toContain("<vICMSUFDest>0.00</vICMSUFDest><vICMSUFRemet>0.00</vICMSUFRemet>");
  });

  it("usa o modelo 55 para NF-e", () => {
    const result = buildNfeXml(baseRequest({ type: "NFE", sale: { ...baseRequest().sale, customerDocument: "12345678909", customerStreet: "Rua A", customerNumber: "1", customerDistrict: "Bairro", customerCity: "São Paulo", customerCityCode: "3550308", customerState: "SP", customerZipCode: "01000000" } }), "chave");
    expect(result.xml).toContain("<mod>55</mod>");
    expect(result.xml).toContain("<CNPJ>12345678000190</CNPJ>");
  });

  it("rejeita item sem NCM ou CFOP", () => {
    const request = baseRequest({ sale: { ...baseRequest().sale, items: [{ code: "P1", description: "Sem NCM", quantity: 1, unitPrice: 10, discount: 0, unit: "UN" }] } });
    expect(() => buildNfeXml(request, "chave")).toThrow("NCM e CFOP");
  });

  it("exige destinatário identificado para NF-e", () => {
    const request = baseRequest({ type: "NFE" });
    expect(() => buildNfeXml(request, "chave")).toThrow("destinatário identificado");
  });

  it("rejeita regime tributário desconhecido", () => {
    const request = baseRequest({ issuer: { ...baseRequest().issuer, taxRegime: "DESCONHECIDO" } });
    expect(() => buildNfeXml(request, "chave")).toThrow("Regime tributário");
  });
});
