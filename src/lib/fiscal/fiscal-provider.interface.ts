export type FiscalProviderRequest = {
  documentId: string;
  type: "NFE" | "NFCE";
  series: number;
  number: number;
  environment: "HOMOLOGATION" | "PRODUCTION";
  contingency?: { mode: "OFFLINE"; startedAt: Date; reason: string };
  issuer: {
    legalName: string; tradeName?: string | null; cnpj: string; stateRegistration: string;
    taxRegime: string; street: string; number: string; complement?: string | null; district: string;
    city: string; cityCode: string; state: string; zipCode: string; phone?: string | null;
  };
  sale: {
    code: string;
    total: number;
    soldAt: Date;
    operatorName?: string | null;
    notes?: string | null;
    customerName: string;
    customerDocument?: string | null;
    customerStateRegistration?: string | null;
    customerStreet?: string | null;
    customerNumber?: string | null;
    customerComplement?: string | null;
    customerDistrict?: string | null;
    customerCity?: string | null;
    customerCityCode?: string | null;
    customerState?: string | null;
    customerZipCode?: string | null;
    paymentMethod: string;
    payments?: Array<{ method: string; amount: number }>;
    discount: number;
    surcharge: number;
    items: Array<{
      code: string; barcode?: string | null; description: string; quantity: number; unitPrice: number; discount: number; unit: string;
      ncm?: string | null; cest?: string | null; originCode?: string | null; cfop?: string | null;
      icmsCode?: string | null;
    }>;
  };
};

export type FiscalProviderResult = {
  status: "AUTHORIZED" | "REJECTED" | "CONTINGENCY_PENDING";
  providerId?: string;
  accessKey?: string;
  protocol?: string;
  rejectionCode?: string;
  rejectionReason?: string;
  xml?: string;
  pdf?: Uint8Array;
};

export type FiscalVoidRequest = {
  type: "NFE" | "NFCE";
  environment: "HOMOLOGATION" | "PRODUCTION";
  cnpj: string;
  stateCode: "35";
  year: number;
  series: number;
  numberFrom: number;
  numberTo: number;
  reason: string;
};

export type FiscalServiceStatus = {
  available: boolean;
  code: string;
  message: string;
  checkedAt: string;
  averageTime?: string;
};

export interface FiscalProvider {
  issue(input: FiscalProviderRequest): Promise<FiscalProviderResult>;
  cancel(providerId: string, reason: string, authorizationProtocol?: string): Promise<{ protocol: string; xml?: string }>;
  query(providerId: string): Promise<{ status: "AUTHORIZED" | "CANCELLED" | "REJECTED"; protocol?: string; rejectionCode?: string; rejectionReason?: string; xml?: string }>;
  voidNumber?(input: FiscalVoidRequest): Promise<{ status: "VOIDED" | "REJECTED"; protocol?: string; rejectionCode?: string; rejectionReason?: string; xml?: string }>;
  serviceStatus?(type: "NFE" | "NFCE", environment: "HOMOLOGATION" | "PRODUCTION"): Promise<FiscalServiceStatus>;
  transmitPending?(input: FiscalProviderRequest, signedXml: string, providerId: string): Promise<FiscalProviderResult>;
}
