import { jsPDF } from "jspdf";
import QRCode from "qrcode";

import type { FiscalProviderRequest } from "./fiscal-provider.interface";

const paymentLabels: Record<string, string> = { DINHEIRO: "Dinheiro", PIX: "PIX", CREDITO: "Cartão de Crédito", DEBITO: "Cartão de Débito" };
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const quantity = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const dateTime = (value: Date) => value.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
const formattedKey = (value: string) => value.match(/.{1,4}/g)?.join(" ") ?? value;

function issuerDocument(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 14 ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : value;
}

export async function createDirectDanfe(input: { request: FiscalProviderRequest; accessKey: string; protocol?: string; qrCodeUrl?: string | null; pendingContingency?: boolean }) {
  const consumer = input.request.type === "NFCE";
  const payments = input.request.sale.payments?.length ? input.request.sale.payments : [{ method: input.request.sale.paymentMethod, amount: input.request.sale.total }];
  const height = consumer ? Math.max(225, 190 + input.request.sale.items.length * 8 + payments.length * 4 + (input.request.sale.notes ? 8 : 0)) : 297;
  const pdf = new jsPDF({ unit: "mm", format: consumer ? [80, height] : "a4" });
  const width = consumer ? 80 : 210;
  const left = consumer ? 4 : 14;
  const right = width - left;
  const contentWidth = right - left;
  let y = 6;

  function fitSingleLine(value: string, maxWidth: number) {
    if (pdf.getTextWidth(value) <= maxWidth) return value;
    let shortened = value;
    while (shortened.length > 1 && pdf.getTextWidth(`${shortened}...`) > maxWidth) shortened = shortened.slice(0, -1);
    return `${shortened}...`;
  }

  const headerLeft = left;
  const headerWidth = contentWidth;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(consumer ? 9 : 14);
  pdf.text(input.request.issuer.tradeName || input.request.issuer.legalName, headerLeft, y + 3, { maxWidth: headerWidth });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(consumer ? 5.8 : 9);
  pdf.text(input.request.issuer.legalName, headerLeft, y + 7, { maxWidth: headerWidth });
  pdf.text(`CNPJ: ${issuerDocument(input.request.issuer.cnpj)}`, headerLeft, y + 11);
  pdf.text(`IE: ${input.request.issuer.stateRegistration}`, headerLeft, y + 14);
  y += consumer ? 19 : 22;
  const address = `${input.request.issuer.street}, ${input.request.issuer.number}${input.request.issuer.complement ? `, ${input.request.issuer.complement}` : ""} - ${input.request.issuer.district} - ${input.request.issuer.city}/${input.request.issuer.state}`;
  pdf.setFontSize(5.8);
  const addressLines = pdf.splitTextToSize(address, contentWidth);
  pdf.text(addressLines, left, y);
  y += addressLines.length * 3;
  const contact = `CEP: ${input.request.issuer.zipCode}${input.request.issuer.phone ? `  Telefone: ${input.request.issuer.phone}` : ""}`;
  pdf.text(contact, left, y);
  y += 3;

  pdf.setDrawColor(185);
  pdf.line(left, y, right, y);
  y += 4;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.7);
  const title = input.request.type === "NFCE" ? "DANFE NFC-e - Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica" : "DANFE - Documento Auxiliar da Nota Fiscal Eletrônica";
  const titleLines = pdf.splitTextToSize(title, contentWidth);
  pdf.text(titleLines, width / 2, y, { align: "center" });
  y += titleLines.length * 3.5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(5.6);
  pdf.text("Não permite aproveitamento de crédito de ICMS", width / 2, y, { align: "center" });
  y += 4;
  if (input.request.environment === "HOMOLOGATION" || input.pendingContingency) {
    pdf.setFont("helvetica", "bold");
    pdf.text(input.pendingContingency ? "EMITIDA EM CONTINGÊNCIA - PENDENTE DE TRANSMISSÃO" : "EMISSÃO EM HOMOLOGAÇÃO - SEM VALIDADE FISCAL", width / 2, y, { align: "center" });
    y += 5;
  }

  pdf.line(left, y, right, y);
  y += 4;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(5.5);
  pdf.text("CÓD.", left, y);
  pdf.text("DESCRIÇÃO", left + 15, y);
  pdf.text("QTD.", right - 22, y, { align: "right" });
  pdf.text("TOTAL", right, y, { align: "right" });
  y += 3;
  pdf.line(left, y, right, y);
  y += 4;
  pdf.setFont("helvetica", "normal");
  for (const item of input.request.sale.items) {
    const descriptionLines = pdf.splitTextToSize(item.description, contentWidth - 41);
    pdf.text(fitSingleLine(item.code || "-", 13), left, y);
    pdf.text(descriptionLines, left + 15, y);
    pdf.text(`${quantity(item.quantity)} ${item.unit}`, right - 22, y, { align: "right" });
    pdf.text(money(item.quantity * item.unitPrice - item.discount), right, y, { align: "right" });
    y += descriptionLines.length * 3;
    pdf.setTextColor(90);
    pdf.text(`${quantity(item.quantity)} x ${money(item.unitPrice)}${item.discount > 0 ? ` - desc. ${money(item.discount)}` : ""}`, left + 15, y);
    pdf.setTextColor(0);
    y += 4;
  }

  pdf.line(left, y, right, y);
  y += 5;
  pdf.setFontSize(6.2);
  pdf.text("Quantidade total de itens", left, y);
  pdf.text(String(input.request.sale.items.length), right, y, { align: "right" });
  y += 4;
  if (input.request.sale.discount > 0) { pdf.text("Desconto", left, y); pdf.text(`- ${money(input.request.sale.discount)}`, right, y, { align: "right" }); y += 4; }
  if (input.request.sale.surcharge > 0) { pdf.text("Acréscimo", left, y); pdf.text(money(input.request.sale.surcharge), right, y, { align: "right" }); y += 4; }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("VALOR TOTAL", left, y);
  pdf.text(money(input.request.sale.total), right, y, { align: "right" });
  y += 6;

  pdf.setFontSize(6.2);
  pdf.text("FORMA DE PAGAMENTO", left, y);
  pdf.text("VALOR PAGO", right, y, { align: "right" });
  y += 4;
  pdf.setFont("helvetica", "normal");
  for (const payment of payments) {
    pdf.text(paymentLabels[payment.method] ?? payment.method, left, y);
    pdf.text(money(payment.amount), right, y, { align: "right" });
    y += 4;
  }
  pdf.line(left, y, right, y);
  y += 5;

  pdf.setFont("helvetica", "bold");
  pdf.text(input.pendingContingency ? "EMISSÃO EM CONTINGÊNCIA" : "EMISSÃO NORMAL", width / 2, y, { align: "center" });
  y += 4;
  pdf.setFont("helvetica", "normal");
  pdf.text(`Número: ${input.request.number}  Série: ${input.request.series}`, width / 2, y, { align: "center" });
  y += 4;
  pdf.text(`Emissão: ${dateTime(input.request.sale.soldAt)} - Via Consumidor`, width / 2, y, { align: "center" });
  y += 5;
  pdf.setFont("helvetica", "bold");
  pdf.text("CHAVE DE ACESSO", width / 2, y, { align: "center" });
  y += 4;
  pdf.setFont("helvetica", "normal");
  const keyLines = pdf.splitTextToSize(formattedKey(input.accessKey), contentWidth);
  pdf.text(keyLines, width / 2, y, { align: "center" });
  y += keyLines.length * 3.2 + 3;
  pdf.setFontSize(5.2);
  pdf.text("Consulte pela chave de acesso em www.nfce.fazenda.sp.gov.br", width / 2, y, { align: "center" });
  y += 4;
  pdf.setFontSize(6.2);
  pdf.setFont("helvetica", "bold");
  pdf.text("CONSUMIDOR", width / 2, y, { align: "center" });
  y += 4;
  pdf.setFont("helvetica", "normal");
  const customer = input.request.sale.customerDocument ? `${input.request.sale.customerName} - ${input.request.sale.customerDocument}` : "Consumidor não identificado";
  pdf.text(pdf.splitTextToSize(customer, contentWidth), width / 2, y, { align: "center" });
  y += 6;

  if (input.qrCodeUrl) {
    pdf.text("Consulta via leitor de QR Code", width / 2, y, { align: "center" });
    y += 3;
    const dataUrl = await QRCode.toDataURL(input.qrCodeUrl, { errorCorrectionLevel: "M", margin: 1, width: 320 });
    const qrSize = consumer ? 32 : 42;
    pdf.addImage(dataUrl, "PNG", (width - qrSize) / 2, y, qrSize, qrSize);
    y += qrSize + 4;
  }
  pdf.text(`Protocolo de autorização: ${input.protocol || "Pendente"}`, width / 2, y, { align: "center" });
  y += 5;
  pdf.line(left, y, right, y);
  y += 4;
  pdf.setFontSize(5.8);
  pdf.text(`Operador: ${input.request.sale.operatorName || "Não informado"}`, left, y);
  pdf.text(`Venda: ${input.request.sale.code}`, right, y, { align: "right" });
  y += 5;
  if (input.request.sale.notes) {
    const notes = pdf.splitTextToSize(`Observações: ${input.request.sale.notes}`, contentWidth);
    pdf.text(notes, left, y);
    y += notes.length * 3 + 2;
  }
  pdf.setFont("helvetica", "bold");
  pdf.text("OBRIGADO PELA COMPRA, VOLTE SEMPRE!", width / 2, y, { align: "center" });
  return new Uint8Array(pdf.output("arraybuffer"));
}
