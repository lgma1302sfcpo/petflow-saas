import { randomInt } from "crypto";

function pad(value: string | number, size: number) {
  return String(value).padStart(size, "0");
}

function saoPauloParts(date: Date) {
  const values = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(date);
  return Object.fromEntries(values.map((part) => [part.type, part.value]));
}

export function saoPauloTimestamp(date = new Date()) {
  const part = saoPauloParts(date);
  return `${part.year}-${part.month}-${part.day}T${part.hour}:${part.minute}:${part.second}-03:00`;
}

export function nfeCheckDigit(base43: string) {
  if (!/^\d{43}$/.test(base43)) throw new Error("A base da chave de acesso deve possuir 43 números.");
  let weight = 2;
  let total = 0;
  for (let index = base43.length - 1; index >= 0; index -= 1) {
    total += Number(base43[index]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const result = 11 - (total % 11);
  return result === 10 || result === 11 ? 0 : result;
}

export function buildNfeAccessKey(input: {
  issuedAt: Date; cnpj: string; model: 55 | 65; series: number; number: number; emissionType: 1 | 4 | 9; numericCode?: string;
}) {
  const cnpj = input.cnpj.replace(/\D/g, "");
  if (cnpj.length !== 14) throw new Error("O Cadastro Nacional da Pessoa Jurídica deve possuir 14 números.");
  if (!Number.isInteger(input.series) || input.series < 0 || input.series > 999) throw new Error("A série fiscal deve estar entre zero e 999.");
  if (!Number.isInteger(input.number) || input.number < 1 || input.number > 999_999_999) throw new Error("O número fiscal deve estar entre um e 999999999.");
  const date = saoPauloParts(input.issuedAt);
  const numericCode = input.numericCode ?? pad(randomInt(1, 100_000_000), 8);
  if (!/^\d{8}$/.test(numericCode)) throw new Error("O código numérico deve possuir oito números.");
  const base = ["35", `${date.year.slice(-2)}${date.month}`, cnpj, pad(input.model, 2), pad(input.series, 3), pad(input.number, 9), input.emissionType, numericCode].join("");
  const checkDigit = nfeCheckDigit(base);
  return { accessKey: `${base}${checkDigit}`, numericCode, checkDigit };
}
