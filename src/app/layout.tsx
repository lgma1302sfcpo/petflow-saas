import type { Metadata } from "next";
import { QueryProvider } from "@/components/query-provider";
import "./globals.css";

const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
const deploymentUrl = process.env.VERCEL_URL?.trim();
const appUrl = configuredAppUrl || (deploymentUrl ? `https://${deploymentUrl}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: "PetFlow", template: "%s | PetFlow" },
  description: "Gestão multiempresa para pet shops, simples na loja e segura na plataforma.",
  openGraph: { title:"PetFlow", description:"Cada loja no ritmo certo.", images:["/og.png"], locale:"pt_BR", type:"website" },
  twitter: { card:"summary_large_image", title:"PetFlow", description:"Cada loja no ritmo certo.", images:["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body><QueryProvider>{children}</QueryProvider></body></html>;
}
