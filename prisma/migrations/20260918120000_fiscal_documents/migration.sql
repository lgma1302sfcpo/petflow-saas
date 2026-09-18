-- CreateEnum
CREATE TYPE "FiscalProviderType" AS ENUM ('SANDBOX', 'DIRECT_SEFAZ_SP', 'NOT_CONFIGURED');

-- CreateEnum
CREATE TYPE "FiscalDocumentType" AS ENUM ('NFE', 'NFCE');

-- CreateEnum
CREATE TYPE "FiscalDocumentStatus" AS ENUM ('PROCESSING', 'CONTINGENCY_PENDING', 'AUTHORIZED', 'REJECTED', 'CANCELLED', 'ERROR');

-- CreateEnum
CREATE TYPE "FiscalEventType" AS ENUM ('ISSUE', 'QUERY', 'CANCEL', 'VOID_NUMBER', 'EMAIL', 'RETRY');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "cest" TEXT,
ADD COLUMN     "cfop" TEXT,
ADD COLUMN     "fiscalApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fiscalItemType" TEXT NOT NULL DEFAULT 'GOOD',
ADD COLUMN     "issRate" DECIMAL(5,2),
ADD COLUMN     "ncm" TEXT,
ADD COLUMN     "serviceCode" TEXT;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "addressCity" TEXT,
ADD COLUMN     "addressCityCode" TEXT,
ADD COLUMN     "addressComplement" TEXT,
ADD COLUMN     "addressDistrict" TEXT,
ADD COLUMN     "addressNumber" TEXT,
ADD COLUMN     "addressState" TEXT,
ADD COLUMN     "addressStreet" TEXT,
ADD COLUMN     "addressZipCode" TEXT,
ADD COLUMN     "stateRegistration" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "fiscalPendingAt" TIMESTAMP(3),
ADD COLUMN     "fiscalPendingReason" TEXT;

-- AlterTable
ALTER TABLE "FiscalConfig" ADD COLUMN     "accountantApprovedAt" TIMESTAMP(3),
ADD COLUMN     "autoEmail" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "certificateName" TEXT,
ADD COLUMN     "certificatePasswordEncrypted" TEXT,
ADD COLUMN     "certificateType" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN     "city" TEXT,
ADD COLUMN     "cityCode" TEXT,
ADD COLUMN     "cnae" TEXT,
ADD COLUMN     "cnpj" TEXT,
ADD COLUMN     "complement" TEXT,
ADD COLUMN     "directTransmissionEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "enableNfce" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "enableNfe" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "municipalRegistration" TEXT,
ADD COLUMN     "number" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "providerType" "FiscalProviderType" NOT NULL DEFAULT 'SANDBOX',
ADD COLUMN     "state" TEXT,
ADD COLUMN     "stateRegistration" TEXT,
ADD COLUMN     "street" TEXT,
ADD COLUMN     "taxRegime" TEXT,
ADD COLUMN     "tradeName" TEXT,
ADD COLUMN     "zipCode" TEXT;

-- CreateTable
CREATE TABLE "FiscalSequence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "type" "FiscalDocumentType" NOT NULL,
    "environment" "FiscalEnvironment" NOT NULL,
    "series" INTEGER NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "type" "FiscalDocumentType" NOT NULL,
    "environment" "FiscalEnvironment" NOT NULL,
    "provider" "FiscalProviderType" NOT NULL,
    "series" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "FiscalDocumentStatus" NOT NULL DEFAULT 'PROCESSING',
    "accessKey" TEXT,
    "protocol" TEXT,
    "cancellationProtocol" TEXT,
    "providerId" TEXT,
    "rejectionCode" TEXT,
    "rejectionReason" TEXT,
    "xmlContent" TEXT,
    "cancellationXmlContent" TEXT,
    "pdfContent" BYTEA,
    "authorizedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fiscalDocumentId" TEXT,
    "userId" TEXT,
    "type" "FiscalEventType" NOT NULL,
    "success" BOOLEAN NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalNumberVoid" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "type" "FiscalDocumentType" NOT NULL,
    "environment" "FiscalEnvironment" NOT NULL,
    "provider" "FiscalProviderType" NOT NULL,
    "series" INTEGER NOT NULL,
    "numberFrom" INTEGER NOT NULL,
    "numberTo" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "protocol" TEXT,
    "rejectionCode" TEXT,
    "rejectionReason" TEXT,
    "xmlContent" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalNumberVoid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FiscalSequence_tenantId_branchId_type_idx" ON "FiscalSequence"("tenantId", "branchId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalSequence_tenantId_branchId_type_environment_series_key" ON "FiscalSequence"("tenantId", "branchId", "type", "environment", "series");

-- CreateIndex
CREATE INDEX "FiscalDocument_tenantId_createdAt_idx" ON "FiscalDocument"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "FiscalDocument_tenantId_status_idx" ON "FiscalDocument"("tenantId", "status");

-- CreateIndex
CREATE INDEX "FiscalDocument_tenantId_branchId_idx" ON "FiscalDocument"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalDocument_tenantId_saleId_type_key" ON "FiscalDocument"("tenantId", "saleId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalDocument_tenantId_type_environment_series_number_key" ON "FiscalDocument"("tenantId", "type", "environment", "series", "number");

-- CreateIndex
CREATE INDEX "FiscalEvent_tenantId_createdAt_idx" ON "FiscalEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "FiscalEvent_fiscalDocumentId_createdAt_idx" ON "FiscalEvent"("fiscalDocumentId", "createdAt");

-- CreateIndex
CREATE INDEX "FiscalNumberVoid_tenantId_createdAt_idx" ON "FiscalNumberVoid"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "FiscalNumberVoid_tenantId_type_environment_series_idx" ON "FiscalNumberVoid"("tenantId", "type", "environment", "series");

