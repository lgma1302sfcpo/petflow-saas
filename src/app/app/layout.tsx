import { AppShell } from "@/components/app-shell";
import { PwaRegister } from "@/components/pwa-register";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireTenantSession } from "@/lib/session";
import { resolveEnabledModules } from "@/lib/modules";

export const dynamic = "force-dynamic";
export default async function TenantLayout({ children }: { children: React.ReactNode }) {
  const session = await requireTenantSession();
  const [branches,settings,tenant]=await Promise.all([prisma.branch.findMany({where:{tenantId:session.user.tenantId,id:{in:session.user.branchIds},active:true,deletedAt:null},select:{id:true,name:true},orderBy:{name:"asc"}}),prisma.tenantSetting.findUnique({where:{tenantId:session.user.tenantId},select:{primaryColor:true}}),prisma.tenant.findUniqueOrThrow({where:{id:session.user.tenantId},include:{moduleOverrides:true,subscriptions:{include:{plan:true},orderBy:{createdAt:"desc"},take:1}}})]);
  const requested=(await cookies()).get("petflow_branch")?.value;
  const activeBranchId=branches.some(branch=>branch.id===requested)?requested:branches[0]?.id;
  const enabledModules=resolveEnabledModules(tenant.subscriptions[0]?.plan.enabledModules??[],tenant.moduleOverrides);
  const branchSettings=activeBranchId?await prisma.branchSetting.findFirst({where:{tenantId:session.user.tenantId,branchId:activeBranchId},select:{primaryColor:true}}):null;
  const primaryColor=branchSettings?.primaryColor??settings?.primaryColor??"#176b57";
  return <div style={{"--brand":primaryColor,"--brand-strong":primaryColor} as React.CSSProperties}><PwaRegister/><AppShell userName={session.user.name ?? "Usuário"} tenantName={session.user.tenantName} branches={branches} activeBranchId={activeBranchId} enabledModules={enabledModules}>{children}</AppShell></div>;
}
