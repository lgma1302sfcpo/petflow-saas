import type { NextConfig } from "next";

const deploymentHost =
  process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
  process.env.VERCEL_URL?.trim();
const deploymentUrl = deploymentHost
  ? deploymentHost.startsWith("http://") || deploymentHost.startsWith("https://")
    ? deploymentHost
    : `https://${deploymentHost}`
  : "http://localhost:3000";

if (!process.env.NEXTAUTH_URL?.trim()) process.env.NEXTAUTH_URL = deploymentUrl;
if (!process.env.NEXT_PUBLIC_APP_URL?.trim()) process.env.NEXT_PUBLIC_APP_URL = deploymentUrl;

const nextConfig: NextConfig = {
  // Pacotes do motor fiscal com bindings nativos/WASM ou requires dinâmicos (assinatura XML,
  // validação XSD, geração de PDF/QR Code): mantidos fora do bundle do webpack/turbopack e
  // resolvidos via require() normal do Node em tempo de execução nas rotas de API.
  serverExternalPackages: ["libxml2-wasm", "node-forge", "xml-crypto", "@xmldom/xmldom", "jspdf", "qrcode"],
  // O client do Prisma é gerado fora de node_modules (src/generated/prisma), então o
  // rastreador de arquivos do Next não inclui o binário nativo do query engine por padrão.
  outputFileTracingIncludes: { "/*": ["./src/generated/prisma/**/*"] },
  async headers(){return [{source:"/:path*",headers:[{key:"X-Content-Type-Options",value:"nosniff"},{key:"X-Frame-Options",value:"DENY"},{key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},{key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=()"},{key:"Content-Security-Policy",value:"default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"}]}]}
};

export default nextConfig;
