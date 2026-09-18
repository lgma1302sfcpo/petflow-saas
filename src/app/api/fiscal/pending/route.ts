import { apiError,getApiContext } from "@/lib/api-context";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET() {
  try {
    const { tenantId, branchId } = await getApiContext(PERMISSIONS.FISCAL_ISSUE, "fiscal");
    const sales = await prisma.sale.findMany({
      where: { tenantId, branchId, status: "COMPLETED", fiscalPendingAt: { not: null } },
      orderBy: { fiscalPendingAt: "desc" },
      take: 100,
    });
    return Response.json({ sales: sales.map((sale) => ({ ...sale, total: Number(sale.total) })) });
  } catch (error) { return apiError(error); }
}
