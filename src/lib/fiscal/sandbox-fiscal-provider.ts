import { jsPDF } from "jspdf";

import type { FiscalProvider, FiscalProviderRequest } from "./fiscal-provider.interface";

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

// Provider de homologação/simulação: não toca a Secretaria da Fazenda real. Útil para
// desenvolvimento e testes, e é o padrão de segurança para qualquer tenant novo.
export class SandboxFiscalProvider implements FiscalProvider {
  async issue(input: FiscalProviderRequest) {
    const providerId = `TESTE-${input.documentId}`;
    const protocol = `HOMOLOGACAO-${Date.now()}`;
    const accessKey = `SEM-VALIDADE-FISCAL-${input.type}-${input.series}-${input.number}`;
    const itemsXml = input.sale.items.map((item, index) => `<item numero="${index + 1}"><descricao>${escapeXml(item.description)}</descricao><quantidade>${item.quantity}</quantidade><valorUnitario>${item.unitPrice.toFixed(2)}</valorUnitario><desconto>${item.discount.toFixed(2)}</desconto>${item.ncm ? `<ncm>${item.ncm}</ncm>` : ""}</item>`).join("");
    const xml = `<?xml version="1.0" encoding="UTF-8"?><documentoFiscalDeTeste ambiente="homologacao" semValidadeFiscal="true"><tipo>${input.type}</tipo><serie>${input.series}</serie><numero>${input.number}</numero><emitente><razaoSocial>${escapeXml(input.issuer.legalName)}</razaoSocial><cnpj>${input.issuer.cnpj}</cnpj></emitente><venda codigo="${escapeXml(input.sale.code)}"><cliente>${escapeXml(input.sale.customerName)}</cliente>${itemsXml}<total>${input.sale.total.toFixed(2)}</total></venda><protocolo>${protocol}</protocolo></documentoFiscalDeTeste>`;

    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    pdf.setFontSize(18);
    pdf.text("DOCUMENTO FISCAL DE HOMOLOGACAO", 105, 20, { align: "center" });
    pdf.setFontSize(11);
    pdf.text("SEM VALIDADE FISCAL", 105, 28, { align: "center" });
    pdf.text(`${input.type} - série ${input.series} - número ${input.number}`, 20, 42);
    pdf.text(`Emitente: ${input.issuer.legalName}`, 20, 50);
    pdf.text(`Venda: ${input.sale.code}`, 20, 58);
    pdf.text(`Cliente: ${input.sale.customerName}`, 20, 66);
    let y = 80;
    for (const item of input.sale.items) {
      pdf.text(`${item.description} - ${item.quantity} x R$ ${item.unitPrice.toFixed(2)}${item.discount > 0 ? ` - desconto R$ ${item.discount.toFixed(2)}` : ""}`, 20, y);
      y += 7;
    }
    pdf.setFontSize(14);
    pdf.text(`Total: R$ ${input.sale.total.toFixed(2)}`, 190, y + 8, { align: "right" });
    pdf.setFontSize(9);
    pdf.text(accessKey, 20, y + 20);

    return { status: "AUTHORIZED" as const, providerId, accessKey, protocol, xml, pdf: new Uint8Array(pdf.output("arraybuffer")) };
  }

  async cancel(providerId: string, reason: string) {
    void providerId;
    void reason;
    return { protocol: `CANCELAMENTO-HOMOLOGACAO-${Date.now()}` };
  }

  async query(providerId: string) {
    void providerId;
    return { status: "AUTHORIZED" as const };
  }
}
