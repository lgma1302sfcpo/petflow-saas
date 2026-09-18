import { cookies } from "next/headers";
import { OfflineSalesWorkspace } from "@/components/offline-sales-workspace";
import { prisma } from "@/lib/prisma";
import { requireTenantSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Page(){
  const session=await requireTenantSession();
  const requested=(await cookies()).get("petflow_branch")?.value;
  const branchId=requested&&session.user.branchIds.includes(requested)?requested:session.user.branchIds[0];
  const branch=branchId?await prisma.branch.findFirst({where:{id:branchId,tenantId:session.user.tenantId},select:{name:true}}):null;
  return <OfflineSalesWorkspace tenantId={session.user.tenantId!} branchId={branchId??""} branchName={branch?.name??"Loja"} userId={session.user.id}/>;
}
