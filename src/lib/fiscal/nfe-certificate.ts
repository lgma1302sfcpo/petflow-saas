import forge from "node-forge";

import { FiscalError } from "./fiscal-error";

export function extractA1Certificate(pfx: Buffer, password: string) {
  try {
    const binary = pfx.toString("binary");
    const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(binary), false, password);
    const keyBags = [
      ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
      ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? [])
    ];
    const certificateBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
    const privateKey = keyBags.find((bag) => bag.key)?.key;
    const certificate = certificateBags.find((bag) => bag.cert)?.cert;
    if (!privateKey || !certificate) throw new Error("Chave privada ou certificado ausente.");
    return {
      privateKeyPem: forge.pki.privateKeyToPem(privateKey),
      certificatePem: forge.pki.certificateToPem(certificate),
      certificateDerBase64: forge.util.encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes()),
      validFrom: certificate.validity.notBefore,
      validTo: certificate.validity.notAfter
    };
  } catch {
    throw new FiscalError("Não foi possível abrir o certificado A1. Confira o arquivo e a senha.", "FISCAL_CERTIFICATE_INVALID", 422);
  }
}
