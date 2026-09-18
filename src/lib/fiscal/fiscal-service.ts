import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import { DirectSefazSpProvider } from "./direct-sefaz-sp-provider";
import { FiscalError } from "./fiscal-error";
import { decryptFiscalSecret, encryptFiscalSecret } from "./fiscal-secrets";
import type { FiscalProvider, FiscalProviderRequest } from "./fiscal-provider.interface";
import { extractA1Certificate } from "./nfe-certificate";
import { SandboxFiscalProvider } from "./sandbox-fiscal-provider";

type FiscalDocumentType = "NFE" | "NFCE";
type FiscalEnvironment = "HOMOLOGATION" | "PRODUCTION";

export type ConfigurationInput = {
  legalName?: string; tradeName?: string; cnpj?: string; stateRegistration?: string; municipalRegistration?: string;
  taxRegime?: string; cnae?: string; street?: string; number?: string; complement?: string; district?: string;
  city?: string; cityCode?: string; state?: string; zipCode?: string; phone?: string; email?: string;
  environment: FiscalEnvironment;
  providerType: "SANDBOX" | "DIRECT_SEFAZ_SP" | "NOT_CONFIGURED";
  provider?: string;
  certificateBase64?: string;
  certificatePassword?: string;
  certificateName?: string;
  enableNfe?: boolean;
  enableNfce?: boolean;
  autoEmail?: boolean;
  directTransmissionEnabled?: boolean;
};

export type IssueInput = { saleId: string; type: FiscalDocumentType; series: number; contingency?: boolean; contingencyReason?: string };
export type CancelInput = { reason: string };
export type VoidInput = { type: FiscalDocumentType; series: number; numberFrom: number; numberTo: number; reason: string };
export type AdjustSequenceInput = { type: FiscalDocumentType; series: number; nextNumber: number };

function number(value: Prisma.Decimal | number) {
  return Number(value);
}

function safeConfiguration(configuration: Awaited<ReturnType<typeof prisma.fiscalConfig.findUnique>>) {
  if (!configuration) return null;
  const { encryptedCertificate, certificatePasswordEncrypted, ...safe } = configuration;
  let certificateUsable = false;
  if (encryptedCertificate && certificatePasswordEncrypted) {
    try {
      const certificateBase64 = decryptFiscalSecret(encryptedCertificate);
      const certificatePassword = decryptFiscalSecret(certificatePasswordEncrypted);
      extractA1Certificate(Buffer.from(certificateBase64, "base64"), certificatePassword);
      certificateUsable = true;
    } catch {
      certificateUsable = false;
    }
  }
  return {
    ...safe,
    hasCertificate: Boolean(encryptedCertificate),
    hasCertificatePassword: Boolean(certificatePasswordEncrypted),
    certificateUsable
  };
}

async function requireConfiguration(tenantId: string) {
  const configuration = await prisma.fiscalConfig.findUnique({ where: { tenantId } });
  if (!configuration) throw new FiscalError("Configuração fiscal não encontrada.", "FISCAL_CONFIGURATION_MISSING", 422);
  return configuration;
}

async function requireDocument(tenantId: string, id: string) {
  const document = await prisma.fiscalDocument.findFirst({ where: { id, tenantId } });
  if (!document) throw new FiscalError("Documento fiscal não encontrado.", "FISCAL_DOCUMENT_NOT_FOUND", 404);
  return document;
}

async function recordEvent(tenantId: string, fiscalDocumentId: string | null, userId: string | null, type: "ISSUE" | "QUERY" | "CANCEL" | "VOID_NUMBER" | "EMAIL" | "RETRY", success: boolean, message: string, details?: Record<string, unknown>) {
  await prisma.fiscalEvent.create({ data: { tenantId, fiscalDocumentId, userId, type, success, message, details: details as Prisma.InputJsonValue | undefined } });
}

function provider(configuration: NonNullable<Awaited<ReturnType<typeof prisma.fiscalConfig.findUnique>>>, environmentOverride?: FiscalEnvironment): FiscalProvider {
  if (configuration.providerType === "SANDBOX") return new SandboxFiscalProvider();
  if (configuration.providerType === "DIRECT_SEFAZ_SP") {
    if (!configuration.cnpj || !configuration.encryptedCertificate || !configuration.certificatePasswordEncrypted) {
      throw new FiscalError("O certificado A1 e o CNPJ são obrigatórios para a conexão direta.", "FISCAL_A1_REQUIRED", 422);
    }
    const certificateBase64 = decryptFiscalSecret(configuration.encryptedCertificate);
    const password = decryptFiscalSecret(configuration.certificatePasswordEncrypted);
    const pfx = Buffer.from(certificateBase64, "base64");
    if (!pfx.length) throw new FiscalError("O arquivo do certificado A1 está vazio.", "FISCAL_CERTIFICATE_INVALID", 422);
    return new DirectSefazSpProvider({ pfx, password, cnpj: configuration.cnpj, environment: environmentOverride ?? configuration.environment });
  }
  throw new FiscalError("Forma de transmissão fiscal não configurada.", "FISCAL_PROVIDER_NOT_READY", 503);
}

async function buildProviderRequest(configuration: NonNullable<Awaited<ReturnType<typeof prisma.fiscalConfig.findUnique>>>, saleId: string, tenantId: string, document: { id: string; type: FiscalDocumentType; series: number; number: number; environment: FiscalEnvironment }, contingency?: { reason: string }) {
  const sale = await prisma.sale.findFirst({ where: { id: saleId, tenantId } });
  if (!sale) throw new FiscalError("Venda não encontrada.", "SALE_NOT_FOUND", 404);
  const [items, payments, customer, operator] = await Promise.all([
    prisma.saleItem.findMany({ where: { tenantId, saleId } }),
    prisma.salePayment.findMany({ where: { tenantId, saleId } }),
    sale.customerId ? prisma.customer.findFirst({ where: { id: sale.customerId, tenantId } }) : Promise.resolve(null),
    prisma.user.findFirst({ where: { id: sale.createdById, tenantId }, select: { name: true } })
  ]);
  const productIds = [...new Set(items.map((item) => item.productId))];
  const products = await prisma.product.findMany({ where: { tenantId, id: { in: productIds } } });
  const productMap = new Map(products.map((product) => [product.id, product]));

  const request: FiscalProviderRequest = {
    documentId: document.id,
    type: document.type,
    series: document.series,
    number: document.number,
    environment: document.environment,
    contingency: contingency ? { mode: "OFFLINE", startedAt: new Date(), reason: contingency.reason } : undefined,
    issuer: {
      legalName: configuration.legalName!, tradeName: configuration.tradeName, cnpj: configuration.cnpj!, stateRegistration: configuration.stateRegistration!, taxRegime: configuration.taxRegime!,
      street: configuration.street!, number: configuration.number!, complement: configuration.complement, district: configuration.district!, city: configuration.city!, cityCode: configuration.cityCode!, state: configuration.state!, zipCode: configuration.zipCode!, phone: configuration.phone
    },
    sale: {
      code: sale.id, total: number(sale.total), soldAt: sale.createdAt, operatorName: operator?.name, notes: null,
      customerName: customer?.fullName ?? "Consumidor final", customerDocument: customer?.document,
      customerStateRegistration: customer?.stateRegistration, customerStreet: customer?.addressStreet, customerNumber: customer?.addressNumber,
      customerComplement: customer?.addressComplement, customerDistrict: customer?.addressDistrict, customerCity: customer?.addressCity,
      customerCityCode: customer?.addressCityCode, customerState: customer?.addressState, customerZipCode: customer?.addressZipCode,
      paymentMethod: payments[0]?.method ?? "OUTROS", payments: payments.map((payment) => ({ method: payment.method, amount: number(payment.amount) })),
      discount: number(sale.discount), surcharge: 0,
      items: items.map((item) => {
        const product = productMap.get(item.productId);
        return {
          code: product?.internalCode || product?.sku || product?.barcode || "SEM-CODIGO", barcode: product?.barcode, description: item.description,
          quantity: number(item.quantity), unitPrice: number(item.unitPrice), discount: number(item.discount), unit: product?.unit || "UN",
          ncm: product?.ncm, cest: product?.cest, originCode: "0", cfop: product?.cfop, icmsCode: "102"
        };
      })
    }
  };
  return { request, sale, items, productMap };
}

function validateForIssue(configuration: NonNullable<Awaited<ReturnType<typeof prisma.fiscalConfig.findUnique>>>, customer: Awaited<ReturnType<typeof prisma.customer.findFirst>>, items: Array<{ description: string }>, productMap: Map<string, Awaited<ReturnType<typeof prisma.product.findMany>>[number]>, itemProductIds: string[], type: FiscalDocumentType) {
  const missing = [!configuration.legalName && "razão social", !configuration.cnpj && "CNPJ", !configuration.stateRegistration && "Inscrição Estadual", !configuration.street && "logradouro", !configuration.number && "número do endereço", !configuration.district && "bairro", !configuration.city && "município", !configuration.cityCode && "código do município", !configuration.state && "estado", !configuration.zipCode && "CEP", !configuration.taxRegime && "regime tributário"].filter(Boolean);
  if (missing.length) throw new FiscalError(`Configuração fiscal incompleta: ${missing.join(", ")}.`, "FISCAL_CONFIGURATION_INCOMPLETE", 422);
  if ((type === "NFE" && !configuration.enableNfe) || (type === "NFCE" && !configuration.enableNfce)) throw new FiscalError("Este tipo de documento não está habilitado.", "FISCAL_DOCUMENT_TYPE_DISABLED", 422);
  if (configuration.providerType === "DIRECT_SEFAZ_SP") {
    if (configuration.state !== "SP") throw new FiscalError("A integração direta implementada atende somente empresas inscritas em São Paulo.", "FISCAL_DIRECT_STATE_UNSUPPORTED", 422);
    if (configuration.certificateType !== "A1" || !configuration.encryptedCertificate || !configuration.certificatePasswordEncrypted) throw new FiscalError("Envie o certificado digital A1 e informe a senha antes de transmitir diretamente.", "FISCAL_A1_REQUIRED", 422);
    if (configuration.taxRegime !== "SIMPLES_NACIONAL" && configuration.taxRegime !== "MEI") throw new FiscalError("O cálculo direto atual está limitado ao Simples Nacional/MEI.", "FISCAL_TAX_REGIME_NOT_IMPLEMENTED", 422);
  }
  if (type === "NFE") {
    const customerMissing = [!customer?.document && "documento", !customer?.addressStreet && "logradouro", !customer?.addressNumber && "número", !customer?.addressDistrict && "bairro", !customer?.addressCity && "município", !customer?.addressCityCode && "código do município", !customer?.addressState && "estado", !customer?.addressZipCode && "CEP"].filter(Boolean);
    if (customerMissing.length) throw new FiscalError(`Cadastro fiscal do cliente incompleto para Nota Fiscal Eletrônica: ${customerMissing.join(", ")}.`, "FISCAL_CUSTOMER_INCOMPLETE", 422);
  }
  for (const item of items) {
    void item;
  }
  for (const productId of itemProductIds) {
    const product = productMap.get(productId);
    if (!product) throw new FiscalError("Um item da venda não está vinculado a um produto cadastrado.", "FISCAL_ITEM_WITHOUT_PRODUCT", 422);
    const productMissing = [!product.ncm && "NCM", !product.cfop && "CFOP", !product.unit && "unidade de medida"].filter(Boolean);
    if (productMissing.length) throw new FiscalError(`${product.name}: preencher ${productMissing.join(", ")}.`, "FISCAL_PRODUCT_DATA_MISSING", 422);
  }
}

export const fiscalService = {
  async getOverview(tenantId: string, branchId: string) {
    const [configuration, sequences, documents, numberVoids, sales] = await Promise.all([
      prisma.fiscalConfig.findUnique({ where: { tenantId } }),
      prisma.fiscalSequence.findMany({ where: { tenantId, branchId }, orderBy: [{ type: "asc" }, { series: "asc" }] }),
      prisma.fiscalDocument.findMany({ where: { tenantId, branchId, archivedAt: null }, orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.fiscalNumberVoid.findMany({ where: { tenantId, branchId }, orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.sale.findMany({ where: { tenantId, branchId, status: "COMPLETED" }, orderBy: { createdAt: "desc" }, take: 100 })
    ]);
    const documentSaleIds = [...new Set(documents.map((document) => document.saleId))];
    const relatedSales = documentSaleIds.length ? await prisma.sale.findMany({ where: { tenantId, id: { in: documentSaleIds } } }) : [];
    const salesById = new Map(relatedSales.map((sale) => [sale.id, sale]));
    return {
      configuration: safeConfiguration(configuration),
      sequences,
      numberVoids: numberVoids.map((item) => ({ ...item, xmlContent: undefined, hasXml: Boolean(item.xmlContent) })),
      documents: documents.map((document) => ({
        ...document,
        pdfContent: undefined,
        xmlContent: undefined,
        hasXml: Boolean(document.xmlContent),
        hasPdf: Boolean(document.pdfContent),
        saleTotal: salesById.has(document.saleId) ? number(salesById.get(document.saleId)!.total) : null
      })),
      sales: sales.map((sale) => ({ id: sale.id, total: number(sale.total), createdAt: sale.createdAt, fiscalPendingAt: sale.fiscalPendingAt, fiscalPendingReason: sale.fiscalPendingReason }))
    };
  },

  async saveConfiguration(tenantId: string, branchId: string, userId: string, input: ConfigurationInput) {
    const current = await prisma.fiscalConfig.findUnique({ where: { tenantId } });
    const secretData: Record<string, string> = {};
    if (input.certificateBase64) secretData.encryptedCertificate = encryptFiscalSecret(input.certificateBase64);
    if (input.certificatePassword) secretData.certificatePasswordEncrypted = encryptFiscalSecret(input.certificatePassword);
    let certificateExpiresAt: Date | null | undefined;
    const shouldValidateCertificate = input.providerType === "DIRECT_SEFAZ_SP" && (Boolean(input.certificateBase64) || Boolean(input.certificatePassword));
    if (shouldValidateCertificate) {
      const certificateBase64 = input.certificateBase64 ?? (current?.encryptedCertificate ? decryptFiscalSecret(current.encryptedCertificate) : undefined);
      const certificatePassword = input.certificatePassword ?? (current?.certificatePasswordEncrypted ? decryptFiscalSecret(current.certificatePasswordEncrypted) : undefined);
      if (!certificateBase64 || !certificatePassword) throw new FiscalError("Envie o arquivo A1 e informe a senha para validar o certificado.", "FISCAL_CERTIFICATE_PAIR_REQUIRED", 422);
      let parsed;
      try {
        parsed = extractA1Certificate(Buffer.from(certificateBase64, "base64"), certificatePassword);
      } catch {
        throw new FiscalError("O certificado A1 armazenado não pode ser aberto com a senha armazenada. Selecione novamente o arquivo e digite novamente a senha.", "FISCAL_STORED_CERTIFICATE_INVALID", 422);
      }
      certificateExpiresAt = parsed.validTo;
    }

    const common = {
      legalName: input.legalName, tradeName: input.tradeName, cnpj: input.cnpj, stateRegistration: input.stateRegistration,
      municipalRegistration: input.municipalRegistration, taxRegime: input.taxRegime || null, cnae: input.cnae,
      street: input.street, number: input.number, complement: input.complement, district: input.district, city: input.city,
      cityCode: input.cityCode, state: input.state || null, zipCode: input.zipCode, phone: input.phone, email: input.email || null,
      environment: input.environment, providerType: input.providerType, provider: input.provider,
      certificateType: input.providerType === "DIRECT_SEFAZ_SP" ? "A1" : "NONE",
      certificateExpiresAt, certificateName: input.certificateName,
      enableNfe: input.enableNfe ?? false, enableNfce: input.enableNfce ?? false, autoEmail: input.autoEmail ?? false,
      directTransmissionEnabled: input.directTransmissionEnabled ?? false,
      ...secretData
    };

    const saved = await prisma.$transaction(async (tx) => {
      const configuration = await tx.fiscalConfig.upsert({ where: { tenantId }, create: { tenantId, ...common }, update: common });
      await tx.auditLog.create({ data: { actorType: "TENANT", tenantId, branchId, userId, action: "fiscal.config.update", entity: "FiscalConfig", entityId: configuration.id, metadata: { environment: configuration.environment, providerType: configuration.providerType } } });
      return configuration;
    });
    return safeConfiguration(saved);
  },

  async issue(tenantId: string, branchId: string, userId: string, input: IssueInput) {
    const configuration = await requireConfiguration(tenantId);
    if (configuration.environment === "PRODUCTION" && (configuration.providerType !== "DIRECT_SEFAZ_SP" || !configuration.directTransmissionEnabled)) {
      throw new FiscalError("A produção permanece bloqueada até selecionar a transmissão direta e confirmar conscientemente a liberação.", "FISCAL_PRODUCTION_BLOCKED", 422);
    }
    if (configuration.providerType === "SANDBOX" && configuration.environment !== "HOMOLOGATION") throw new FiscalError("O simulador interno funciona somente em homologação.", "FISCAL_SANDBOX_ENVIRONMENT_INVALID", 422);
    if (input.contingency && configuration.providerType !== "DIRECT_SEFAZ_SP") throw new FiscalError("A contingência offline exige a transmissão direta para a Secretaria da Fazenda.", "FISCAL_CONTINGENCY_DIRECT_REQUIRED", 422);
    if (configuration.providerType !== "SANDBOX" && configuration.providerType !== "DIRECT_SEFAZ_SP") throw new FiscalError("Selecione o simulador ou a transmissão direta para a Secretaria da Fazenda de São Paulo.", "FISCAL_PROVIDER_NOT_READY", 422);

    const sale = await prisma.sale.findFirst({ where: { id: input.saleId, tenantId, branchId, status: "COMPLETED" } });
    if (!sale) throw new FiscalError("Venda concluída não encontrada.", "SALE_NOT_FOUND", 404);
    const items = await prisma.saleItem.findMany({ where: { tenantId, saleId: sale.id } });
    const productIds = [...new Set(items.map((item) => item.productId))];
    const products = await prisma.product.findMany({ where: { tenantId, id: { in: productIds } } });
    const productMap = new Map(products.map((product) => [product.id, product]));
    const customer = sale.customerId ? await prisma.customer.findFirst({ where: { id: sale.customerId, tenantId } }) : null;
    validateForIssue(configuration, customer, items, productMap, productIds, input.type);

    const existing = await prisma.fiscalDocument.findUnique({ where: { tenantId_saleId_type: { tenantId, saleId: sale.id, type: input.type } } });
    if (existing?.status === "AUTHORIZED" || existing?.status === "PROCESSING" || existing?.status === "CONTINGENCY_PENDING") {
      throw new FiscalError("Esta venda já possui uma emissão deste tipo. Consulte o documento existente para evitar duplicidade.", "DUPLICATE_FISCAL_DOCUMENT", 409);
    }

    const sequenceKey = { tenantId_branchId_type_environment_series: { tenantId, branchId, type: input.type, environment: configuration.environment, series: input.series } };
    const activeSequence = await prisma.fiscalSequence.findUnique({ where: sequenceKey });
    const sequenceMovedPastDocument = Boolean(existing && activeSequence && activeSequence.nextNumber > existing.number + 1);
    const requiresNewNumber = Boolean(existing && (existing.environment !== configuration.environment || existing.series !== input.series || existing.provider !== configuration.providerType || sequenceMovedPastDocument));

    const document = requiresNewNumber ? await prisma.$transaction(async (tx) => {
      const sequence = await tx.fiscalSequence.upsert({ where: sequenceKey, create: { tenantId, branchId, type: input.type, environment: configuration.environment, series: input.series, nextNumber: 2 }, update: { nextNumber: { increment: 1 } } });
      return tx.fiscalDocument.update({
        where: { id: existing!.id },
        data: { environment: configuration.environment, provider: configuration.providerType, series: input.series, number: sequence.nextNumber - 1, status: "PROCESSING", providerId: null, accessKey: null, protocol: null, rejectionCode: null, rejectionReason: null, xmlContent: null, pdfContent: null, authorizedAt: null, cancelledAt: null, cancellationProtocol: null, cancellationXmlContent: null, archivedAt: null }
      });
    }) : existing ? await prisma.fiscalDocument.update({ where: { id: existing.id }, data: { status: "PROCESSING", rejectionCode: null, rejectionReason: null, archivedAt: null } })
      : await prisma.$transaction(async (tx) => {
        const sequence = await tx.fiscalSequence.upsert({ where: sequenceKey, create: { tenantId, branchId, type: input.type, environment: configuration.environment, series: input.series, nextNumber: 2 }, update: { nextNumber: { increment: 1 } } });
        return tx.fiscalDocument.create({ data: { tenantId, branchId, saleId: sale.id, type: input.type, environment: configuration.environment, provider: configuration.providerType, series: input.series, number: sequence.nextNumber - 1, createdById: userId } });
      });

    await recordEvent(tenantId, document.id, userId, "ISSUE", true, input.contingency ? "Documento gerado em contingência offline e mantido pendente de transmissão." : configuration.providerType === "SANDBOX" ? "Emissão enviada ao simulador interno de homologação." : "Emissão enviada diretamente para a Secretaria da Fazenda de São Paulo.");
    try {
      const activeProvider = provider(configuration);
      const { request } = await buildProviderRequest(configuration, sale.id, tenantId, document, input.contingency ? { reason: input.contingencyReason ?? "" } : undefined);
      const result = await activeProvider.issue(request);
      const updated = await prisma.fiscalDocument.update({
        where: { id: document.id },
        data: { status: result.status, providerId: result.providerId, accessKey: result.accessKey, protocol: result.protocol, rejectionCode: result.rejectionCode, rejectionReason: result.rejectionReason, xmlContent: result.xml, pdfContent: result.pdf ? Buffer.from(result.pdf) : undefined, authorizedAt: result.status === "AUTHORIZED" ? new Date() : null }
      });
      if (result.status === "AUTHORIZED" || result.status === "CONTINGENCY_PENDING") {
        await prisma.sale.update({ where: { id: sale.id }, data: { fiscalPendingAt: null, fiscalPendingReason: null } });
      }
      const successful = result.status === "AUTHORIZED" || result.status === "CONTINGENCY_PENDING";
      const message = result.status === "AUTHORIZED"
        ? configuration.environment === "HOMOLOGATION" ? "Documento autorizado pela Secretaria da Fazenda em homologação, sem validade fiscal." : "Documento autorizado pela Secretaria da Fazenda em produção."
        : result.status === "CONTINGENCY_PENDING" ? "Documento assinado em contingência offline e pendente de transmissão para a Secretaria da Fazenda." : result.rejectionReason ?? "Documento rejeitado.";
      await recordEvent(tenantId, document.id, userId, "ISSUE", successful, message);
      return updated;
    } catch (error) {
      await prisma.fiscalDocument.update({ where: { id: document.id }, data: { status: "ERROR", rejectionReason: error instanceof Error ? error.message : "Falha inesperada no provedor." } });
      await recordEvent(tenantId, document.id, userId, "ISSUE", false, error instanceof Error ? error.message : "Falha inesperada no provedor.");
      throw error;
    }
  },

  async query(tenantId: string, userId: string, id: string) {
    const document = await requireDocument(tenantId, id);
    if (!document.providerId) throw new FiscalError("O documento ainda não possui identificador no provedor.", "FISCAL_PROVIDER_ID_MISSING", 422);
    const configuration = await requireConfiguration(tenantId);
    const activeProvider = provider(configuration, document.environment);
    const result = await activeProvider.query(document.providerId);
    await recordEvent(tenantId, id, userId, "QUERY", result.status !== "REJECTED", `Consulta concluída: ${result.status}. ${result.rejectionReason ?? ""}`.trim());
    return prisma.fiscalDocument.update({ where: { id }, data: { status: result.status, protocol: result.protocol || undefined, rejectionCode: result.rejectionCode || null, rejectionReason: result.rejectionReason || null } });
  },

  async archiveDocument(tenantId: string, branchId: string, userId: string, id: string, reason: string) {
    const document = await prisma.fiscalDocument.findFirst({ where: { id, tenantId } });
    if (!document) throw new FiscalError("Documento fiscal não encontrado.", "FISCAL_DOCUMENT_NOT_FOUND", 404);
    if (document.status !== "ERROR" && document.status !== "REJECTED") throw new FiscalError("Somente notas com erro ou rejeitadas podem ser removidas da lista.", "FISCAL_DOCUMENT_NOT_ARCHIVABLE", 422);
    const updated = await prisma.$transaction(async (tx) => {
      const archived = await tx.fiscalDocument.update({ where: { id }, data: { archivedAt: new Date() } });
      await tx.auditLog.create({ data: { actorType: "TENANT", tenantId, branchId, userId, action: "fiscal.document.archived", entity: "FiscalDocument", entityId: id, metadata: { status: document.status, type: document.type, series: document.series, number: document.number, reason } } });
      return archived;
    });
    return { id: updated.id, archived: true };
  },

  async cancel(tenantId: string, branchId: string, userId: string, id: string, input: CancelInput) {
    const document = await requireDocument(tenantId, id);
    if (document.status !== "AUTHORIZED" || !document.providerId) throw new FiscalError("Somente um documento autorizado pode ser cancelado.", "FISCAL_DOCUMENT_NOT_AUTHORIZED", 422);
    const configuration = await requireConfiguration(tenantId);
    try {
      const activeProvider = provider(configuration, document.environment);
      const result = await activeProvider.cancel(document.providerId, input.reason, document.protocol ?? undefined);
      const updated = await prisma.fiscalDocument.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancellationProtocol: result.protocol, cancellationXmlContent: result.xml } });
      await recordEvent(tenantId, id, userId, "CANCEL", true, `Cancelamento autorizado ${document.environment === "HOMOLOGATION" ? "em homologação" : "em produção"}. Protocolo: ${result.protocol}. Motivo: ${input.reason}`);
      await prisma.auditLog.create({ data: { actorType: "TENANT", tenantId, branchId, userId, action: "fiscal.document.cancelled", entity: "FiscalDocument", entityId: id, metadata: { reason: input.reason, protocol: result.protocol, environment: document.environment } } });
      return updated;
    } catch (error) {
      await recordEvent(tenantId, id, userId, "CANCEL", false, error instanceof Error ? error.message : "Não foi possível cancelar o documento na Secretaria da Fazenda.", { reason: input.reason, environment: document.environment });
      throw error;
    }
  },

  async adjustSequence(tenantId: string, branchId: string, userId: string, input: AdjustSequenceInput) {
    const configuration = await requireConfiguration(tenantId);
    const latestLocalDocument = await prisma.fiscalDocument.aggregate({ where: { tenantId, branchId, type: input.type, environment: configuration.environment, series: input.series }, _max: { number: true } });
    if (latestLocalDocument._max.number && input.nextNumber <= latestLocalDocument._max.number) {
      throw new FiscalError(`A próxima numeração deve ser maior que ${latestLocalDocument._max.number}, que já foi utilizada neste sistema.`, "FISCAL_SEQUENCE_TOO_LOW", 422);
    }
    const key = { tenantId_branchId_type_environment_series: { tenantId, branchId, type: input.type, environment: configuration.environment, series: input.series } };
    const sequence = await prisma.fiscalSequence.upsert({ where: key, create: { tenantId, branchId, type: input.type, environment: configuration.environment, series: input.series, nextNumber: input.nextNumber }, update: { nextNumber: input.nextNumber } });
    await prisma.auditLog.create({ data: { actorType: "TENANT", tenantId, branchId, userId, action: "fiscal.sequence.adjusted", entity: "FiscalSequence", entityId: sequence.id, metadata: { type: input.type, environment: configuration.environment, series: input.series, nextNumber: input.nextNumber } } });
    return sequence;
  },

  async dismissPendingSale(tenantId: string, branchId: string, userId: string, saleId: string, reason: string) {
    const sale = await prisma.sale.findFirst({ where: { id: saleId, tenantId, branchId }, select: { id: true, fiscalPendingAt: true, fiscalPendingReason: true } });
    if (!sale) throw new FiscalError("Venda não encontrada nesta loja.", "SALE_NOT_FOUND", 404);
    if (!sale.fiscalPendingAt) throw new FiscalError("Esta venda não possui uma pendência fiscal ativa.", "FISCAL_PENDING_NOT_FOUND", 422);
    await prisma.$transaction([
      prisma.sale.update({ where: { id: sale.id }, data: { fiscalPendingAt: null, fiscalPendingReason: null } }),
      prisma.auditLog.create({ data: { actorType: "TENANT", tenantId, branchId, userId, action: "fiscal.pending.dismissed", entity: "Sale", entityId: sale.id, metadata: { reason, previousReason: sale.fiscalPendingReason } } })
    ]);
    return { saleId: sale.id, dismissed: true };
  },

  async voidNumber(tenantId: string, branchId: string, userId: string, input: VoidInput) {
    const configuration = await requireConfiguration(tenantId);
    const used = await prisma.fiscalDocument.count({ where: { tenantId, branchId, type: input.type, environment: configuration.environment, series: input.series, number: { gte: input.numberFrom, lte: input.numberTo } } });
    if (used) throw new FiscalError("O intervalo possui um número já usado por um documento fiscal.", "FISCAL_VOID_RANGE_USED", 409);
    const activeProvider = provider(configuration);
    const result = configuration.providerType === "SANDBOX"
      ? { status: "VOIDED" as const, protocol: `INUTILIZACAO-HOMOLOGACAO-${Date.now()}`, xml: `<?xml version="1.0" encoding="UTF-8"?><inutilizacaoDeTeste semValidadeFiscal="true"><inicio>${input.numberFrom}</inicio><fim>${input.numberTo}</fim></inutilizacaoDeTeste>` }
      : activeProvider.voidNumber ? await activeProvider.voidNumber({ type: input.type, environment: configuration.environment, cnpj: configuration.cnpj!, stateCode: "35", year: new Date().getFullYear(), series: input.series, numberFrom: input.numberFrom, numberTo: input.numberTo, reason: input.reason })
        : { status: "REJECTED" as const, rejectionCode: "NOT_IMPLEMENTED", rejectionReason: "A forma de transmissão selecionada não oferece inutilização." };
    const record = await prisma.fiscalNumberVoid.create({ data: { tenantId, branchId, type: input.type, environment: configuration.environment, provider: configuration.providerType, series: input.series, numberFrom: input.numberFrom, numberTo: input.numberTo, reason: input.reason, status: result.status, protocol: result.protocol, rejectionCode: result.rejectionCode, rejectionReason: result.rejectionReason, xmlContent: result.xml, createdById: userId } });
    if (result.status === "REJECTED") {
      await recordEvent(tenantId, null, userId, "VOID_NUMBER", false, `Inutilização rejeitada: ${result.rejectionReason ?? result.rejectionCode}.`, { ...input, recordId: record.id });
      throw new FiscalError(`Inutilização rejeitada: ${result.rejectionReason ?? "sem motivo informado"}.`, "FISCAL_VOID_REJECTED", 422, result);
    }
    const key = { tenantId_branchId_type_environment_series: { tenantId, branchId, type: input.type, environment: configuration.environment, series: input.series } };
    const current = await prisma.fiscalSequence.findUnique({ where: key });
    const sequence = await prisma.fiscalSequence.upsert({ where: key, create: { tenantId, branchId, type: input.type, environment: configuration.environment, series: input.series, nextNumber: input.numberTo + 1 }, update: { nextNumber: Math.max(current?.nextNumber ?? 1, input.numberTo + 1) } });
    await recordEvent(tenantId, null, userId, "VOID_NUMBER", true, `Numeração ${input.numberFrom} a ${input.numberTo} inutilizada ${configuration.providerType === "SANDBOX" ? "no simulador" : "pela Secretaria da Fazenda"}.`, { ...input, protocol: result.protocol, recordId: record.id });
    return { sequence, record };
  },

  async serviceStatus(tenantId: string, type: "NFE" | "NFCE") {
    const configuration = await requireConfiguration(tenantId);
    if (configuration.providerType !== "DIRECT_SEFAZ_SP") throw new FiscalError("Selecione a transmissão direta e configure o certificado A1 para consultar a Secretaria da Fazenda.", "FISCAL_DIRECT_PROVIDER_REQUIRED", 422);
    const activeProvider = provider(configuration);
    if (!activeProvider.serviceStatus) throw new FiscalError("Consulta de disponibilidade não suportada.", "FISCAL_STATUS_UNAVAILABLE", 422);
    return activeProvider.serviceStatus(type, configuration.environment);
  },

  async transmitContingency(tenantId: string, userId: string, id: string) {
    const document = await prisma.fiscalDocument.findFirst({ where: { id, tenantId } });
    if (!document || document.status !== "CONTINGENCY_PENDING" || !document.xmlContent || !document.providerId) throw new FiscalError("Documento de contingência pendente não encontrado.", "FISCAL_CONTINGENCY_NOT_PENDING", 422);
    const configuration = await requireConfiguration(tenantId);
    if (document.provider !== "DIRECT_SEFAZ_SP" || configuration.providerType !== "DIRECT_SEFAZ_SP") throw new FiscalError("A retransmissão da contingência exige a conexão direta configurada.", "FISCAL_DIRECT_PROVIDER_REQUIRED", 422);
    const activeProvider = provider(configuration);
    if (!activeProvider.transmitPending) throw new FiscalError("A forma de transmissão não aceita documentos pendentes.", "FISCAL_CONTINGENCY_TRANSMISSION_UNAVAILABLE", 422);
    const { request } = await buildProviderRequest(configuration, document.saleId, tenantId, document);
    try {
      const result = await activeProvider.transmitPending(request, document.xmlContent, document.providerId);
      const authorized = result.status === "AUTHORIZED";
      const updated = await prisma.fiscalDocument.update({ where: { id }, data: authorized ? {
        status: "AUTHORIZED", protocol: result.protocol, accessKey: result.accessKey, xmlContent: result.xml, pdfContent: result.pdf ? Buffer.from(result.pdf) : undefined, authorizedAt: new Date(), rejectionCode: null, rejectionReason: null
      } : {
        status: "CONTINGENCY_PENDING", rejectionCode: result.rejectionCode, rejectionReason: result.rejectionReason
      } });
      await recordEvent(tenantId, id, userId, "RETRY", authorized, authorized ? "Documento de contingência autorizado pela Secretaria da Fazenda." : `Documento de contingência ainda pendente: ${result.rejectionReason ?? result.rejectionCode}.`);
      return updated;
    } catch (error) {
      await recordEvent(tenantId, id, userId, "RETRY", false, error instanceof Error ? error.message : "Falha ao transmitir o documento de contingência.");
      throw error;
    }
  },

  async emailDocument(tenantId: string, userId: string, id: string): Promise<never> {
    await requireDocument(tenantId, id);
    await recordEvent(tenantId, id, userId, "EMAIL", false, "O envio de documentos fiscais por e-mail ainda não está configurado neste projeto.");
    throw new FiscalError("O serviço de e-mail não está configurado.", "EMAIL_NOT_CONFIGURED", 503);
  },

  async artifact(tenantId: string, id: string, format: "xml" | "pdf") {
    const document = await prisma.fiscalDocument.findFirst({ where: { id, tenantId } });
    if (!document) throw new FiscalError("Documento fiscal não encontrado.", "FISCAL_DOCUMENT_NOT_FOUND", 404);
    const content = format === "xml" ? document.xmlContent : document.pdfContent;
    if (!content) throw new FiscalError("O arquivo ainda não está disponível.", "FISCAL_ARTIFACT_NOT_FOUND", 404);
    return { content, filename: `${document.type}-${document.series}-${document.number}.${format}` };
  },

  async backup(tenantId: string) {
    const [configuration, sequences, documents, events, numberVoids] = await Promise.all([
      prisma.fiscalConfig.findUnique({ where: { tenantId } }),
      prisma.fiscalSequence.findMany({ where: { tenantId } }),
      prisma.fiscalDocument.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
      prisma.fiscalEvent.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
      prisma.fiscalNumberVoid.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } })
    ]);
    return {
      generatedAt: new Date().toISOString(),
      formatVersion: 1,
      configuration: safeConfiguration(configuration),
      sequences,
      documents: documents.map((document) => ({ ...document, pdfContent: document.pdfContent ? Buffer.from(document.pdfContent).toString("base64") : null })),
      events,
      numberVoids
    };
  }
};
