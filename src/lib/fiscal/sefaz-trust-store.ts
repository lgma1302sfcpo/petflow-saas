import { readFileSync } from "fs";
import { join } from "path";
import { rootCertificates } from "tls";

let cachedAuthorities: string[] | undefined;

export function sefazTrustStore() {
  if (!cachedAuthorities) {
    const icpBrasilChain = readFileSync(
      join(process.cwd(), "resources", "fiscal", "ca", "sefaz-sp-icp-brasil.pem"),
      "utf8"
    );
    cachedAuthorities = [...rootCertificates, icpBrasilChain];
  }
  return cachedAuthorities;
}
