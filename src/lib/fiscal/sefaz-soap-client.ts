import { request as httpsRequest } from "https";

import { FiscalError } from "./fiscal-error";
import { sefazTrustStore } from "./sefaz-trust-store";

const retryableStatus = new Set([429, 502, 503, 504]);
const retryableCodes = new Set(["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH"]);

function soapEnvelope(action: string, payload: string) {
  const namespace = action.slice(0, action.lastIndexOf("/"));
  return `<?xml version="1.0" encoding="UTF-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="${namespace}">${payload}</nfeDadosMsg></soap12:Body></soap12:Envelope>`;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function sendOnce(input: { url: string; action: string; payload: string; pfx: Buffer; passphrase: string; timeoutMs: number }) {
  const body = soapEnvelope(input.action, input.payload);
  const endpoint = new URL(input.url);
  return new Promise<string>((resolve, reject) => {
    const operation = httpsRequest({
      protocol: endpoint.protocol,
      hostname: endpoint.hostname,
      port: endpoint.port || 443,
      path: `${endpoint.pathname}${endpoint.search}`,
      method: "POST",
      pfx: input.pfx,
      passphrase: input.passphrase,
      ca: sefazTrustStore(),
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
      headers: {
        "content-type": `application/soap+xml; charset=utf-8; action="${input.action}"`,
        "content-length": Buffer.byteLength(body),
        accept: "application/soap+xml, application/xml, text/xml"
      }
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 5 * 1024 * 1024) {
          operation.destroy(Object.assign(new Error("Resposta fiscal acima do limite de cinco megabytes."), { code: "RESPONSE_TOO_LARGE" }));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        const responseBody = Buffer.concat(chunks).toString("utf8");
        const status = response.statusCode ?? 500;
        if (status < 200 || status >= 300) {
          reject(Object.assign(new Error(`A Secretaria da Fazenda respondeu com HTTP ${status}.`), { status, responseBody }));
          return;
        }
        resolve(responseBody);
      });
    });
    operation.setTimeout(input.timeoutMs, () => operation.destroy(Object.assign(new Error("Tempo de resposta da Secretaria da Fazenda excedido."), { code: "ETIMEDOUT" })));
    operation.on("error", reject);
    operation.end(body);
  });
}

export async function postSefazSoap(input: { url: string; action: string; payload: string; pfx: Buffer; passphrase: string; timeoutMs?: number; attempts?: number }) {
  const attempts = Math.min(Math.max(input.attempts ?? 3, 1), 3);
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await sendOnce({ ...input, timeoutMs: input.timeoutMs ?? 30_000 });
    } catch (error) {
      lastError = error;
      const value = error as { code?: string; status?: number };
      const retryable = retryableCodes.has(value.code ?? "") || retryableStatus.has(value.status ?? 0);
      if (!retryable || attempt === attempts) break;
      await delay(attempt === 1 ? 300 : 900);
    }
  }
  const original = lastError instanceof Error ? lastError.message : "Falha de comunicação com a Secretaria da Fazenda.";
  throw new FiscalError(`Não foi possível comunicar com a Secretaria da Fazenda de São Paulo. ${original}`, "SEFAZ_COMMUNICATION_FAILED", 503);
}
