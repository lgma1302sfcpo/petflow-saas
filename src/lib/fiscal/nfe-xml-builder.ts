import { createSign } from "crypto";

import { isValidCpfOrCnpj } from "./brazilian-documents";
import { FiscalError } from "./fiscal-error";
import { buildNfeAccessKey, saoPauloTimestamp } from "./nfe-access-key";
import type { FiscalProviderRequest } from "./fiscal-provider.interface";
import { sefazSpEndpoints } from "./sefaz-sp-endpoints";

const namespace = "http://www.portalfiscal.inf.br/nfe";

function escapeXml(value: string | number) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function digits(value?: string | null) { return value?.replace(/\D/g, "") ?? ""; }
function decimal(value: number, scale = 2) { return value.toFixed(scale); }
function cleanText(value: string, max: number) { return value.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 .,/\-]/g, " ").replace(/\s+/g, " ").trim().slice(0, max); }

function allocateMoney(total: number, weights: number[]) {
  const totalCents = Math.round(total * 100);
  if (totalCents === 0) return weights.map(() => 0);
  const weightTotal = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (weightTotal === 0) return weights.map((_, index) => index === 0 ? totalCents / 100 : 0);
  const rawShares = weights.map((weight) => totalCents * Math.max(0, weight) / weightTotal);
  const cents = rawShares.map(Math.floor);
  const remaining = totalCents - cents.reduce((sum, value) => sum + value, 0);
  const remainderOrder = rawShares.map((share, index) => ({ index, remainder: share - Math.floor(share) })).sort((first, second) => second.remainder - first.remainder);
  for (let index = 0; index < remaining; index += 1) cents[remainderOrder[index % remainderOrder.length].index] += 1;
  return cents.map((value) => value / 100);
}

// Códigos da tabela de "Forma de Pagamento" do leiaute NF-e/NFC-e, mapeados a partir dos
// métodos de pagamento aceitos pelo petshop-saas (ver TenantSetting.acceptedPaymentMethods).
function paymentCode(method: string) {
  return ({ DINHEIRO: "01", CREDITO: "03", DEBITO: "04", PIX: "17" } as Record<string, string>)[method] ?? "99";
}

function paymentsXml(request: FiscalProviderRequest, invoiceTotal: number, issuedAt: Date) {
  const payments = request.sale.payments?.length
    ? request.sale.payments
    : [{ method: request.sale.paymentMethod, amount: invoiceTotal }];
  const paymentDate = saoPauloTimestamp(issuedAt).slice(0, 10);
  return payments.map((payment) => {
    const card = ["CREDITO", "DEBITO", "PIX"].includes(payment.method) ? "<card><tpIntegra>2</tpIntegra></card>" : "";
    return `<detPag><tPag>${paymentCode(payment.method)}</tPag><vPag>${decimal(payment.amount)}</vPag><dPag>${paymentDate}</dPag>${card}</detPag>`;
  }).join("");
}

function taxRegimeCode(regime: string) {
  if (regime === "SIMPLES_NACIONAL") return "1";
  if (regime === "SIMPLES_EXCESS") return "2";
  if (regime === "NORMAL") return "3";
  if (regime === "MEI") return "4";
  throw new FiscalError("Regime tributário do emitente não reconhecido.", "FISCAL_TAX_REGIME_INVALID", 422);
}

function gtin(value?: string | null) {
  const normalized = digits(value);
  return [8, 12, 13, 14].includes(normalized.length) ? normalized : "SEM GTIN";
}

function taxXml() {
  return "<imposto><ICMS><ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS></imposto>";
}

function destinationXml(request: FiscalProviderRequest) {
  const document = digits(request.sale.customerDocument);
  if (!document) {
    if (request.type === "NFE") throw new FiscalError("A Nota Fiscal Eletrônica exige um destinatário identificado e com endereço fiscal completo.", "FISCAL_CUSTOMER_REQUIRED", 422);
    return "";
  }
  const tag = document.length === 14 ? "CNPJ" : document.length === 11 ? "CPF" : null;
  if (!tag || !isValidCpfOrCnpj(document)) throw new FiscalError("O documento do cliente deve ser um Cadastro de Pessoa Fisica ou Cadastro Nacional da Pessoa Juridica valido.", "FISCAL_CUSTOMER_DOCUMENT_INVALID", 422);
  const name = request.environment === "HOMOLOGATION" ? "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL" : cleanText(request.sale.customerName, 60);
  const addressValues = [request.sale.customerStreet, request.sale.customerNumber, request.sale.customerDistrict, request.sale.customerCity, request.sale.customerCityCode, request.sale.customerState, request.sale.customerZipCode];
  if (request.type === "NFE" && addressValues.some((value) => !value)) {
    throw new FiscalError("A Nota Fiscal Eletrônica exige logradouro, número, bairro, município, código do município, estado e Código de Endereçamento Postal do cliente.", "FISCAL_CUSTOMER_ADDRESS_INCOMPLETE", 422);
  }
  const address = addressValues.every(Boolean) ? `<enderDest><xLgr>${escapeXml(cleanText(request.sale.customerStreet!, 60))}</xLgr><nro>${escapeXml(cleanText(request.sale.customerNumber!, 60))}</nro>${request.sale.customerComplement ? `<xCpl>${escapeXml(cleanText(request.sale.customerComplement, 60))}</xCpl>` : ""}<xBairro>${escapeXml(cleanText(request.sale.customerDistrict!, 60))}</xBairro><cMun>${digits(request.sale.customerCityCode)}</cMun><xMun>${escapeXml(cleanText(request.sale.customerCity!, 60))}</xMun><UF>${request.sale.customerState}</UF><CEP>${digits(request.sale.customerZipCode)}</CEP><cPais>1058</cPais><xPais>Brasil</xPais></enderDest>` : "";
  const stateRegistration = digits(request.sale.customerStateRegistration);
  return `<dest><${tag}>${document}</${tag}><xNome>${escapeXml(name)}</xNome>${address}<indIEDest>${stateRegistration ? "1" : "9"}</indIEDest>${stateRegistration ? `<IE>${stateRegistration}</IE>` : ""}</dest>`;
}

function offlineQrSignature(payload: string, privateKeyPem: string) {
  const signer = createSign("RSA-SHA1");
  signer.update(payload, "utf8");
  signer.end();
  return signer.sign(privateKeyPem).toString("base64");
}

export function buildNfeXml(request: FiscalProviderRequest, privateKeyPem: string) {
  if (request.type !== "NFE" && request.type !== "NFCE") throw new FiscalError("A Secretaria da Fazenda estadual aceita somente Nota Fiscal Eletrônica e Nota Fiscal de Consumidor Eletrônica.", "FISCAL_DOCUMENT_MODEL_UNSUPPORTED", 422);
  const isConsumer = request.type === "NFCE";
  const model = isConsumer ? 65 : 55;
  const environmentCode = request.environment === "PRODUCTION" ? "1" : "2";
  const emissionType = request.contingency?.mode === "OFFLINE" ? 9 : 1;
  const issuedAt = request.contingency?.startedAt ?? new Date();
  const key = buildNfeAccessKey({ issuedAt, cnpj: request.issuer.cnpj, model, series: request.series, number: request.number, emissionType });
  const timestamp = saoPauloTimestamp(issuedAt);
  const rawItemValues = request.sale.items.map((item) => item.quantity * item.unitPrice);
  const productsTotal = Math.round(rawItemValues.reduce((sum, value) => sum + value, 0) * 100) / 100;
  const itemGrossValues = allocateMoney(productsTotal, rawItemValues);
  const invoiceTotal = Math.round((productsTotal - request.sale.discount + request.sale.surcharge) * 100) / 100;
  const endpoint = sefazSpEndpoints(request.type, request.environment);
  const destinationState = request.sale.customerState || request.issuer.state;
  const destinationIndicator = destinationState === request.issuer.state ? "1" : "2";
  const allocatedDiscounts = allocateMoney(request.sale.discount, itemGrossValues);
  const allocatedSurcharges = allocateMoney(request.sale.surcharge, itemGrossValues);

  const itemXml = request.sale.items.map((item, index) => {
    if (!item.ncm || !item.cfop) throw new FiscalError(`NCM e CFOP sao obrigatorios para ${item.description}.`, "FISCAL_PRODUCT_DATA_MISSING", 422);
    const itemTotal = itemGrossValues[index];
    const itemDiscount = allocatedDiscounts[index];
    const itemSurcharge = allocatedSurcharges[index];
    const description = request.environment === "HOMOLOGATION" ? "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL" : cleanText(item.description, 120);
    const itemGtin = gtin(item.barcode);
    return `<det nItem="${index + 1}"><prod><cProd>${escapeXml(item.code || String(index + 1))}</cProd><cEAN>${itemGtin}</cEAN><xProd>${escapeXml(description)}</xProd><NCM>${digits(item.ncm)}</NCM>${item.cest ? `<CEST>${digits(item.cest)}</CEST>` : ""}<CFOP>${digits(item.cfop)}</CFOP><uCom>${escapeXml(item.unit.slice(0, 6))}</uCom><qCom>${decimal(item.quantity, 4)}</qCom><vUnCom>${decimal(item.unitPrice, 10)}</vUnCom><vProd>${decimal(itemTotal)}</vProd><cEANTrib>${itemGtin}</cEANTrib><uTrib>${escapeXml(item.unit.slice(0, 6))}</uTrib><qTrib>${decimal(item.quantity, 4)}</qTrib><vUnTrib>${decimal(item.unitPrice, 10)}</vUnTrib>${itemDiscount > 0 ? `<vDesc>${decimal(itemDiscount)}</vDesc>` : ""}${itemSurcharge > 0 ? `<vOutro>${decimal(itemSurcharge)}</vOutro>` : ""}<indTot>1</indTot></prod>${taxXml()}</det>`;
  }).join("");

  let supplementary = "";
  if (isConsumer) {
    const qrPayload = request.contingency
      ? [key.accessKey, "3", environmentCode, String(Number(timestamp.slice(8, 10))).padStart(2, "0"), decimal(invoiceTotal), "", ""].join("|")
      : [key.accessKey, "3", environmentCode].join("|");
    const qrValue = request.contingency ? `${qrPayload}|${offlineQrSignature(qrPayload, privateKeyPem)}` : qrPayload;
    supplementary = `<infNFeSupl><qrCode><![CDATA[${endpoint.qrCode}?p=${qrValue}]]></qrCode><urlChave>${endpoint.publicQuery}</urlChave></infNFeSupl>`;
  }

  const contingencyXml = request.contingency ? `<dhCont>${saoPauloTimestamp(request.contingency.startedAt)}</dhCont><xJust>${escapeXml(cleanText(request.contingency.reason, 256))}</xJust>` : "";
  const paymentDetails = paymentsXml(request, invoiceTotal, issuedAt);
  const qrPayload = isConsumer ? (request.contingency
    ? [key.accessKey, "3", environmentCode, String(Number(timestamp.slice(8, 10))).padStart(2, "0"), decimal(invoiceTotal), "", ""].join("|")
    : [key.accessKey, "3", environmentCode].join("|")) : null;
  const qrCodeUrl = qrPayload ? `${endpoint.qrCode}?p=${request.contingency ? `${qrPayload}|${offlineQrSignature(qrPayload, privateKeyPem)}` : qrPayload}` : null;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><NFe xmlns="${namespace}"><infNFe Id="NFe${key.accessKey}" versao="4.00"><ide><cUF>35</cUF><cNF>${key.numericCode}</cNF><natOp>Venda de mercadoria adquirida de terceiros</natOp><mod>${model}</mod><serie>${request.series}</serie><nNF>${request.number}</nNF><dhEmi>${timestamp}</dhEmi><tpNF>1</tpNF><idDest>${destinationIndicator}</idDest><cMunFG>${digits(request.issuer.cityCode)}</cMunFG><tpImp>${isConsumer ? 4 : 1}</tpImp><tpEmis>${emissionType}</tpEmis><cDV>${key.checkDigit}</cDV><tpAmb>${environmentCode}</tpAmb><finNFe>1</finNFe><indFinal>1</indFinal><indPres>1</indPres><procEmi>0</procEmi><verProc>PETFLOW-1.0</verProc>${contingencyXml}</ide><emit><CNPJ>${digits(request.issuer.cnpj)}</CNPJ><xNome>${escapeXml(cleanText(request.issuer.legalName, 60))}</xNome>${request.issuer.tradeName ? `<xFant>${escapeXml(cleanText(request.issuer.tradeName, 60))}</xFant>` : ""}<enderEmit><xLgr>${escapeXml(cleanText(request.issuer.street, 60))}</xLgr><nro>${escapeXml(cleanText(request.issuer.number, 60))}</nro>${request.issuer.complement ? `<xCpl>${escapeXml(cleanText(request.issuer.complement, 60))}</xCpl>` : ""}<xBairro>${escapeXml(cleanText(request.issuer.district, 60))}</xBairro><cMun>${digits(request.issuer.cityCode)}</cMun><xMun>${escapeXml(cleanText(request.issuer.city, 60))}</xMun><UF>${request.issuer.state}</UF><CEP>${digits(request.issuer.zipCode)}</CEP><cPais>1058</cPais><xPais>Brasil</xPais>${request.issuer.phone ? `<fone>${digits(request.issuer.phone)}</fone>` : ""}</enderEmit><IE>${digits(request.issuer.stateRegistration)}</IE><CRT>${taxRegimeCode(request.issuer.taxRegime)}</CRT></emit>${destinationXml(request)}${itemXml}<total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson><vFCPUFDest>0.00</vFCPUFDest><vICMSUFDest>0.00</vICMSUFDest><vICMSUFRemet>0.00</vICMSUFRemet><vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet><vProd>${decimal(productsTotal)}</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>${decimal(request.sale.discount)}</vDesc><vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>${decimal(request.sale.surcharge)}</vOutro><vNF>${decimal(invoiceTotal)}</vNF></ICMSTot></total><transp><modFrete>9</modFrete></transp><pag>${paymentDetails}</pag></infNFe>${supplementary}</NFe>`;
  return { xml, accessKey: key.accessKey, qrCodeUrl, issuedAt, emissionType };
}
