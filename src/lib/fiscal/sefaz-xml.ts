import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import type { Document as XmlDocument, Element as XmlElement, Node as XmlNode } from "@xmldom/xmldom";

import { FiscalError } from "./fiscal-error";

export function parseFiscalXml(xml: string) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = Array.from(document.getElementsByTagName("parsererror"))[0];
  if (parserError) throw new FiscalError("A Secretaria da Fazenda retornou um XML inválido.", "SEFAZ_INVALID_XML", 502);
  return document;
}

export function elements(node: XmlDocument | XmlElement, localName: string) {
  const list = node.getElementsByTagNameNS("*", localName);
  return Array.from({ length: list.length }, (_, index) => list.item(index)).filter((item): item is XmlElement => Boolean(item));
}

export function firstElement(node: XmlDocument | XmlElement, localName: string) {
  return elements(node, localName)[0] ?? null;
}

export function childElement(node: XmlElement, localName: string) {
  return Array.from({ length: node.childNodes.length }, (_, index) => node.childNodes.item(index))
    .find((item): item is XmlElement => item?.nodeType === 1 && (item as XmlElement).localName === localName) ?? null;
}

export function childText(node: XmlElement, localName: string) {
  return childElement(node, localName)?.textContent?.trim() ?? "";
}

export function firstText(node: XmlDocument | XmlElement, localName: string) {
  return firstElement(node, localName)?.textContent?.trim() ?? "";
}

export function serializeXml(node: XmlNode) {
  return new XMLSerializer().serializeToString(node);
}

export function stripXmlDeclaration(xml: string) {
  return xml.replace(/^\s*<\?xml[^>]*>\s*/i, "");
}

export function cleanFiscalText(value: string, max = 255) {
  return value.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 .,/\-]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function soapFaultMessage(xml: string) {
  const document = parseFiscalXml(xml);
  const fault = firstElement(document, "Fault");
  if (!fault) return null;
  return firstText(fault, "Text") || firstText(fault, "faultstring") || "Falha SOAP informada pela Secretaria da Fazenda.";
}
