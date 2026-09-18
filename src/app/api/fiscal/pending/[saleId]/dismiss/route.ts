import { z } from "zod";
import { apiError,getApiContext } from "@/lib/api-context";
import { fiscalService } from "@/lib/fiscal/fiscal-service";
import { PERMISSIONS } from "@/lib/permissions";

const schema = z.object({ reason: z.string().trim().min(3).max(255) });

export async function POST(request: Request, context: RouteContext<"/api/fiscal/pending/[saleId]/dismiss">) {
  try {
    const { tenantId, branchId, userId } = await getApiContext(PERMISSIONS.FISCAL_ISSUE, "fiscal");
    const { saleId } = await context.params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Informe o motivo da dispensa." }, { status: 422 });
    const result = await fiscalService.dismissPendingSale(tenantId, branchId, userId, saleId, parsed.data.reason);
    return Response.json(result);
  } catch (error) { return apiError(error); }
}
