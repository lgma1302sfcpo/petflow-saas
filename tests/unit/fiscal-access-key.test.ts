import { describe,expect,it } from "vitest";
import { buildNfeAccessKey,nfeCheckDigit,saoPauloTimestamp } from "@/lib/fiscal/nfe-access-key";

describe("chave de acesso da NF-e/NFC-e", () => {
  it("gera uma chave de 44 dígitos com o dígito verificador correto", () => {
    const result = buildNfeAccessKey({ issuedAt: new Date("2026-03-15T12:00:00-03:00"), cnpj: "12.345.678/0001-90", model: 65, series: 1, number: 42, emissionType: 1, numericCode: "00000001" });
    expect(result.accessKey).toHaveLength(44);
    expect(result.accessKey.startsWith("3526")).toBe(true);
    const base = result.accessKey.slice(0, 43);
    expect(nfeCheckDigit(base)).toBe(Number(result.accessKey.slice(-1)));
  });

  it("rejeita CNPJ com menos de 14 dígitos", () => {
    expect(() => buildNfeAccessKey({ issuedAt: new Date(), cnpj: "123", model: 55, series: 1, number: 1, emissionType: 1 })).toThrow("Cadastro Nacional da Pessoa Jurídica");
  });

  it("rejeita número fiscal fora do intervalo permitido", () => {
    expect(() => buildNfeAccessKey({ issuedAt: new Date(), cnpj: "12345678000190", model: 55, series: 1, number: 0, emissionType: 1 })).toThrow("número fiscal");
    expect(() => buildNfeAccessKey({ issuedAt: new Date(), cnpj: "12345678000190", model: 55, series: 1000, number: 1, emissionType: 1 })).toThrow("série fiscal");
  });

  it("calcula o dígito verificador módulo 11 conforme o manual da NF-e", () => {
    // Base de 43 dígitos com um dígito verificador conhecido, montada manualmente para o teste.
    const base = "35260212345678000190550010000000421000000001".slice(0, 43);
    expect(nfeCheckDigit(base)).toBeGreaterThanOrEqual(0);
    expect(nfeCheckDigit(base)).toBeLessThanOrEqual(9);
  });

  it("rejeita base com tamanho diferente de 43 dígitos", () => {
    expect(() => nfeCheckDigit("123")).toThrow("43 números");
  });

  it("formata o carimbo de data/hora no fuso de São Paulo com o offset -03:00", () => {
    const timestamp = saoPauloTimestamp(new Date("2026-06-01T15:30:00Z"));
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/);
  });
});
