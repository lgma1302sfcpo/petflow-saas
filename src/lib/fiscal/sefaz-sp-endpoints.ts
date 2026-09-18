export type SefazEnvironment = "HOMOLOGATION" | "PRODUCTION";
export type SefazDocumentModel = "NFE" | "NFCE";

const hosts = {
  NFE: {
    HOMOLOGATION: "https://homologacao.nfe.fazenda.sp.gov.br/ws",
    PRODUCTION: "https://nfe.fazenda.sp.gov.br/ws"
  },
  NFCE: {
    HOMOLOGATION: "https://homologacao.nfce.fazenda.sp.gov.br/ws",
    PRODUCTION: "https://nfce.fazenda.sp.gov.br/ws"
  }
} as const;

export function sefazSpEndpoints(model: SefazDocumentModel, environment: SefazEnvironment) {
  const base = hosts[model][environment];
  return {
    authorization: `${base}/nfeautorizacao4.asmx`,
    authorizationReturn: `${base}/nferetautorizacao4.asmx`,
    protocolQuery: `${base}/nfeconsultaprotocolo4.asmx`,
    eventReception: `${base}/nferecepcaoevento4.asmx`,
    serviceStatus: `${base}/nfestatusservico4.asmx`,
    voidNumber: `${base}/nfeinutilizacao4.asmx`,
    qrCode: environment === "HOMOLOGATION"
      ? "https://www.homologacao.nfce.fazenda.sp.gov.br/qrcode"
      : "https://www.nfce.fazenda.sp.gov.br/qrcode",
    publicQuery: environment === "HOMOLOGATION"
      ? "https://www.homologacao.nfce.fazenda.sp.gov.br/consulta"
      : "https://www.nfce.fazenda.sp.gov.br/consulta"
  };
}

export const sefazSoapActions = {
  authorization: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeAutorizacaoLote",
  authorizationReturn: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRetAutorizacao4/nfeRetAutorizacaoLote",
  protocolQuery: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4/nfeConsultaNF",
  eventReception: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento",
  serviceStatus: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4/nfeStatusServicoNF",
  voidNumber: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeInutilizacao4/nfeInutilizacaoNF"
} as const;
