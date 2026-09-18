import { readFile } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";

import { FiscalError } from "./fiscal-error";

const schemaPath = join(process.cwd(), "resources", "fiscal", "schemas", "pl-010e-v1.02", "PL_010e_v1.02", "NFe", "nfe_v4.00.xsd");

export async function validateNfeXml(xml: string) {
  const [{ XmlDocument, XsdValidator }, { xmlRegisterFsInputProviders }] = await Promise.all([
    import("libxml2-wasm"),
    import("libxml2-wasm/lib/nodejs.mjs")
  ]);
  xmlRegisterFsInputProviders();
  const schemaContent = await readFile(schemaPath);
  const schemaDocument = XmlDocument.fromBuffer(schemaContent, { url: pathToFileURL(schemaPath).href });
  const document = XmlDocument.fromString(xml);
  let validator: InstanceType<typeof XsdValidator> | undefined;
  try {
    validator = XsdValidator.fromDoc(schemaDocument);
    validator.validate(document);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new FiscalError(`O XML foi bloqueado antes da transmissão porque não passou no esquema oficial ${"PL_010e_v1.02"}: ${details}`, "FISCAL_XML_SCHEMA_INVALID", 422);
  } finally {
    validator?.dispose();
    document.dispose();
    schemaDocument.dispose();
  }
}
