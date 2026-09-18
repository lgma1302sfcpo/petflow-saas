import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

import { FiscalError } from "./fiscal-error";

function key() {
  const secret = process.env.FISCAL_ENCRYPTION_KEY;
  if (!secret || secret.length < 24) {
    throw new FiscalError("Configure FISCAL_ENCRYPTION_KEY com uma chave segura antes de salvar credenciais fiscais.", "FISCAL_ENCRYPTION_NOT_CONFIGURED", 503);
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptFiscalSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptFiscalSecret(value: string) {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
}
