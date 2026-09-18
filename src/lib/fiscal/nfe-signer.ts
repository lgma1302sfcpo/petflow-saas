import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";

import { FiscalError } from "./fiscal-error";

const canonicalization = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const rsaSha1 = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";
const sha1 = "http://www.w3.org/2000/09/xmldsig#sha1";
const enveloped = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";

export function signFiscalXml(xml: string, targetLocalName: "infNFe" | "infEvento" | "infInut", parentLocalName: "NFe" | "evento" | "inutNFe", privateKeyPem: string, certificatePem: string) {
  const signer = new SignedXml({
    privateKey: privateKeyPem,
    publicCert: certificatePem,
    canonicalizationAlgorithm: canonicalization,
    signatureAlgorithm: rsaSha1,
    getKeyInfoContent: SignedXml.getKeyInfoContent
  });
  signer.addReference({
    xpath: `//*[local-name(.)='${targetLocalName}']`,
    transforms: [enveloped, canonicalization],
    digestAlgorithm: sha1
  });
  signer.computeSignature(xml, { location: { reference: `//*[local-name(.)='${parentLocalName}']`, action: "append" } });
  return signer.getSignedXml();
}

export function signNfeXml(xml: string, privateKeyPem: string, certificatePem: string) {
  return signFiscalXml(xml, "infNFe", "NFe", privateKeyPem, certificatePem);
}

export function verifyNfeSignature(xml: string, certificatePem: string) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const signature = document.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature").item(0);
  if (!signature) throw new FiscalError("O XML não possui assinatura digital.", "FISCAL_SIGNATURE_MISSING", 422);
  const verifier = new SignedXml({ publicCert: certificatePem, getCertFromKeyInfo: () => null });
  verifier.loadSignature(new XMLSerializer().serializeToString(signature));
  return verifier.checkSignature(xml);
}
