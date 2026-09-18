import { FiscalError } from "./fiscal-error";
import type { FiscalProvider, FiscalProviderRequest, FiscalServiceStatus, FiscalVoidRequest } from "./fiscal-provider.interface";
import { createDirectDanfe } from "./direct-danfe";
import { extractA1Certificate } from "./nfe-certificate";
import { signFiscalXml, signNfeXml } from "./nfe-signer";
import { buildNfeXml } from "./nfe-xml-builder";
import { validateNfeXml } from "./nfe-xsd-validator";
import { postSefazSoap } from "./sefaz-soap-client";
import { sefazSoapActions, sefazSpEndpoints } from "./sefaz-sp-endpoints";
import { childText, cleanFiscalText, elements, firstElement, firstText, parseFiscalXml, serializeXml, soapFaultMessage, stripXmlDeclaration } from "./sefaz-xml";

const namespace = "http://www.portalfiscal.inf.br/nfe";
const authorizationCodes = new Set(["100", "150"]);
const cancellationCodes = new Set(["135", "136", "155"]);

function escapeXml(value: string | number) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function environmentCode(environment: "HOMOLOGATION" | "PRODUCTION") {
  return environment === "PRODUCTION" ? "1" : "2";
}

function modelNumber(type: "NFE" | "NFCE") {
  return type === "NFE" ? "55" : "65";
}

function providerIdentifier(type: "NFE" | "NFCE", accessKey: string) {
  return `${type}:${accessKey}`;
}

function parseProviderIdentifier(value: string) {
  const [type, accessKey] = value.split(":");
  if ((type !== "NFE" && type !== "NFCE") || !/^\d{44}$/.test(accessKey ?? "")) {
    throw new FiscalError("Identificador do documento direto inválido.", "FISCAL_DIRECT_ID_INVALID", 422);
  }
  return { type, accessKey } as { type: "NFE" | "NFCE"; accessKey: string };
}

function loteId() {
  return Date.now().toString().slice(-15).padStart(15, "0");
}

function responseRoot(xml: string, localName: string) {
  const fault = soapFaultMessage(xml);
  if (fault) throw new FiscalError(`A Secretaria da Fazenda recusou a requisicao SOAP: ${fault}`, "SEFAZ_SOAP_FAULT", 502);
  let document = parseFiscalXml(xml);
  let root = firstElement(document, localName);
  if (!root) {
    const embedded = firstText(document, "nfeResultMsg");
    if (embedded.includes("<")) {
      document = parseFiscalXml(embedded);
      root = firstElement(document, localName);
    }
  }
  if (!root) throw new FiscalError(`Retorno da Secretaria da Fazenda sem ${localName}.`, "SEFAZ_UNEXPECTED_RESPONSE", 502);
  return root;
}

function rejectResult(code: string, reason: string, xml?: string) {
  return {
    status: "REJECTED" as const,
    rejectionCode: code || "SEM_CODIGO",
    rejectionReason: reason || "Documento rejeitado sem motivo descritivo.",
    xml
  };
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// Fala diretamente com a SEFAZ-SP (sem gateway terceirizado): monta o XML, assina com o
// certificado A1, valida contra o XSD oficial e transmite via SOAP.
export class DirectSefazSpProvider implements FiscalProvider {
  private readonly certificate: ReturnType<typeof extractA1Certificate>;

  constructor(private readonly options: { pfx: Buffer; password: string; cnpj: string; environment: "HOMOLOGATION" | "PRODUCTION" }) {
    this.certificate = extractA1Certificate(options.pfx, options.password);
    const now = Date.now();
    if (this.certificate.validFrom.getTime() > now) throw new FiscalError("O certificado A1 ainda não está válido.", "FISCAL_CERTIFICATE_NOT_YET_VALID", 422);
    if (this.certificate.validTo.getTime() <= now) throw new FiscalError("O certificado A1 esta vencido.", "FISCAL_CERTIFICATE_EXPIRED", 422);
  }

  async issue(input: FiscalProviderRequest) {
    if (input.environment !== this.options.environment) throw new FiscalError("O ambiente do documento diverge da conexão fiscal.", "FISCAL_ENVIRONMENT_MISMATCH", 422);
    const built = buildNfeXml(input, this.certificate.privateKeyPem);
    const signedNfe = signNfeXml(built.xml, this.certificate.privateKeyPem, this.certificate.certificatePem);
    await validateNfeXml(signedNfe);
    const id = providerIdentifier(input.type, built.accessKey);

    if (input.contingency) {
      const pdf = await createDirectDanfe({ request: input, accessKey: built.accessKey, qrCodeUrl: built.qrCodeUrl, pendingContingency: true });
      return { status: "CONTINGENCY_PENDING" as const, providerId: id, accessKey: built.accessKey, xml: signedNfe, pdf };
    }

    return this.authorizeSigned(input, signedNfe, id, built.accessKey, built.qrCodeUrl);
  }

  async transmitPending(input: FiscalProviderRequest, signedXml: string, providerId: string) {
    const parsed = parseProviderIdentifier(providerId);
    if (parsed.type !== input.type) throw new FiscalError("O tipo do documento pendente diverge do XML armazenado.", "FISCAL_DIRECT_ID_INVALID", 422);
    const embeddedKey = firstElement(parseFiscalXml(signedXml), "infNFe")?.getAttribute("Id")?.replace(/^NFe/, "");
    if (embeddedKey !== parsed.accessKey) throw new FiscalError("A chave do XML pendente não corresponde ao documento armazenado.", "FISCAL_PENDING_XML_MISMATCH", 422);
    await validateNfeXml(signedXml);
    const qrCodeUrl = firstText(parseFiscalXml(signedXml), "qrCode") || null;
    return this.authorizeSigned(input, signedXml, providerId, parsed.accessKey, qrCodeUrl);
  }

  async query(providerId: string) {
    const { type, accessKey } = parseProviderIdentifier(providerId);
    const endpoints = sefazSpEndpoints(type, this.options.environment);
    const payload = `<consSitNFe xmlns="${namespace}" versao="4.00"><tpAmb>${environmentCode(this.options.environment)}</tpAmb><xServ>CONSULTAR</xServ><chNFe>${accessKey}</chNFe></consSitNFe>`;
    const raw = await postSefazSoap({ url: endpoints.protocolQuery, action: sefazSoapActions.protocolQuery, payload, pfx: this.options.pfx, passphrase: this.options.password });
    const root = responseRoot(raw, "retConsSitNFe");
    const code = childText(root, "cStat");
    const reason = childText(root, "xMotivo");
    const cancellation = elements(root, "infEvento").some((event) => childText(event, "tpEvento") === "110111" && cancellationCodes.has(childText(event, "cStat")));
    if (cancellation || ["101", "151", "155"].includes(code)) return { status: "CANCELLED" as const, protocol: firstText(root, "nProt"), xml: serializeXml(root) };
    if (authorizationCodes.has(code)) return { status: "AUTHORIZED" as const, protocol: firstText(root, "nProt"), xml: serializeXml(root) };
    return { status: "REJECTED" as const, rejectionCode: code, rejectionReason: reason, xml: serializeXml(root) };
  }

  async cancel(providerId: string, reason: string, authorizationProtocol?: string) {
    const { type, accessKey } = parseProviderIdentifier(providerId);
    if (!authorizationProtocol) throw new FiscalError("Protocolo de autorização ausente; consulte a nota antes de cancelar.", "FISCAL_AUTHORIZATION_PROTOCOL_MISSING", 422);
    const sequence = "01";
    const event = `<evento xmlns="${namespace}" versao="1.00"><infEvento Id="ID110111${accessKey}${sequence}"><cOrgao>35</cOrgao><tpAmb>${environmentCode(this.options.environment)}</tpAmb><CNPJ>${this.options.cnpj.replace(/\D/g, "")}</CNPJ><chNFe>${accessKey}</chNFe><dhEvento>${new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T")}-03:00</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>Cancelamento</descEvento><nProt>${escapeXml(authorizationProtocol)}</nProt><xJust>${escapeXml(cleanFiscalText(reason, 255))}</xJust></detEvento></infEvento></evento>`;
    const signedEvent = signFiscalXml(event, "infEvento", "evento", this.certificate.privateKeyPem, this.certificate.certificatePem);
    const payload = `<envEvento xmlns="${namespace}" versao="1.00"><idLote>${loteId()}</idLote>${stripXmlDeclaration(signedEvent)}</envEvento>`;
    const endpoints = sefazSpEndpoints(type, this.options.environment);
    const raw = await postSefazSoap({ url: endpoints.eventReception, action: sefazSoapActions.eventReception, payload, pfx: this.options.pfx, passphrase: this.options.password });
    const root = responseRoot(raw, "retEnvEvento");
    const eventResponse = firstElement(root, "retEvento");
    const info = eventResponse ? firstElement(eventResponse, "infEvento") : null;
    const code = info ? childText(info, "cStat") : childText(root, "cStat");
    const message = info ? childText(info, "xMotivo") : childText(root, "xMotivo");
    if (!cancellationCodes.has(code)) throw new FiscalError(`Cancelamento rejeitado pela Secretaria da Fazenda (${code || "sem código"}): ${message || "sem motivo"}.`, "SEFAZ_CANCELLATION_REJECTED", 422, { code, message });
    return { protocol: info ? childText(info, "nProt") : "", xml: serializeXml(root) };
  }

  async voidNumber(input: FiscalVoidRequest) {
    if (input.environment !== this.options.environment) throw new FiscalError("O ambiente da inutilização diverge da conexão fiscal.", "FISCAL_ENVIRONMENT_MISMATCH", 422);
    const year = String(input.year).slice(-2);
    const cnpj = input.cnpj.replace(/\D/g, "");
    const model = modelNumber(input.type);
    const series = String(input.series).padStart(3, "0");
    const from = String(input.numberFrom).padStart(9, "0");
    const to = String(input.numberTo).padStart(9, "0");
    const id = `ID35${year}${cnpj}${model}${series}${from}${to}`;
    const xml = `<inutNFe xmlns="${namespace}" versao="4.00"><infInut Id="${id}"><tpAmb>${environmentCode(input.environment)}</tpAmb><xServ>INUTILIZAR</xServ><cUF>35</cUF><ano>${year}</ano><CNPJ>${cnpj}</CNPJ><mod>${model}</mod><serie>${input.series}</serie><nNFIni>${input.numberFrom}</nNFIni><nNFFin>${input.numberTo}</nNFFin><xJust>${escapeXml(cleanFiscalText(input.reason, 255))}</xJust></infInut></inutNFe>`;
    const signed = signFiscalXml(xml, "infInut", "inutNFe", this.certificate.privateKeyPem, this.certificate.certificatePem);
    const endpoints = sefazSpEndpoints(input.type, input.environment);
    const raw = await postSefazSoap({ url: endpoints.voidNumber, action: sefazSoapActions.voidNumber, payload: stripXmlDeclaration(signed), pfx: this.options.pfx, passphrase: this.options.password });
    const root = responseRoot(raw, "retInutNFe");
    const info = firstElement(root, "infInut") ?? root;
    const code = childText(info, "cStat");
    const message = childText(info, "xMotivo");
    if (code !== "102") return { status: "REJECTED" as const, rejectionCode: code, rejectionReason: message, xml: serializeXml(root) };
    return { status: "VOIDED" as const, protocol: childText(info, "nProt"), xml: serializeXml(root) };
  }

  async serviceStatus(type: "NFE" | "NFCE", environment: "HOMOLOGATION" | "PRODUCTION"): Promise<FiscalServiceStatus> {
    const endpoints = sefazSpEndpoints(type, environment);
    const payload = `<consStatServ xmlns="${namespace}" versao="4.00"><tpAmb>${environmentCode(environment)}</tpAmb><cUF>35</cUF><xServ>STATUS</xServ></consStatServ>`;
    const raw = await postSefazSoap({ url: endpoints.serviceStatus, action: sefazSoapActions.serviceStatus, payload, pfx: this.options.pfx, passphrase: this.options.password, attempts: 2 });
    const root = responseRoot(raw, "retConsStatServ");
    const code = childText(root, "cStat");
    return { available: code === "107", code, message: childText(root, "xMotivo"), checkedAt: childText(root, "dhRecbto") || new Date().toISOString(), averageTime: childText(root, "tMed") || undefined };
  }

  private async authorizeSigned(input: FiscalProviderRequest, signedNfe: string, id: string, accessKey: string, qrCodeUrl: string | null) {
    const endpoints = sefazSpEndpoints(input.type, input.environment);
    const envelope = `<enviNFe xmlns="${namespace}" versao="4.00"><idLote>${loteId()}</idLote><indSinc>1</indSinc>${stripXmlDeclaration(signedNfe)}</enviNFe>`;
    let rawResponse = await postSefazSoap({ url: endpoints.authorization, action: sefazSoapActions.authorization, payload: envelope, pfx: this.options.pfx, passphrase: this.options.password });
    let root = responseRoot(rawResponse, "retEnviNFe");
    let batchCode = childText(root, "cStat");
    if (batchCode === "103") {
      const receipt = firstText(root, "nRec");
      if (!receipt) return { ...rejectResult(batchCode, childText(root, "xMotivo"), signedNfe), providerId: id, accessKey };
      const receiptRequest = `<consReciNFe xmlns="${namespace}" versao="4.00"><tpAmb>${environmentCode(input.environment)}</tpAmb><nRec>${receipt}</nRec></consReciNFe>`;
      for (const pause of [0, 500, 1_200]) {
        if (pause) await delay(pause);
        rawResponse = await postSefazSoap({ url: endpoints.authorizationReturn, action: sefazSoapActions.authorizationReturn, payload: receiptRequest, pfx: this.options.pfx, passphrase: this.options.password });
        root = responseRoot(rawResponse, "retConsReciNFe");
        batchCode = childText(root, "cStat");
        if (batchCode !== "105") break;
      }
    }
    if (batchCode !== "104") return { ...rejectResult(batchCode, childText(root, "xMotivo"), signedNfe), providerId: id, accessKey };
    const protocolNode = firstElement(root, "protNFe");
    const protocolInfo = protocolNode ? firstElement(protocolNode, "infProt") : null;
    const code = protocolInfo ? childText(protocolInfo, "cStat") : "";
    const reason = protocolInfo ? childText(protocolInfo, "xMotivo") : "Protocolo de autorização ausente.";
    if (!protocolNode || !protocolInfo || !authorizationCodes.has(code)) return { ...rejectResult(code || batchCode, reason, signedNfe), providerId: id, accessKey };
    const protocol = childText(protocolInfo, "nProt");
    const processedXml = `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="${namespace}" versao="4.00">${stripXmlDeclaration(signedNfe)}${serializeXml(protocolNode)}</nfeProc>`;
    const pdf = await createDirectDanfe({ request: input, accessKey, protocol, qrCodeUrl });
    return { status: "AUTHORIZED" as const, providerId: id, accessKey, protocol, xml: processedXml, pdf };
  }
}
