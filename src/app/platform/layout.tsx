import { AppShell } from "@/components/app-shell";
import { PlatformWebMcp } from "@/components/platform-webmcp";
import { requirePlatformSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePlatformSession();
  return <><PlatformWebMcp /><AppShell platform userName={session.user.name ?? "Superadmin"}>{children}</AppShell></>;
}
