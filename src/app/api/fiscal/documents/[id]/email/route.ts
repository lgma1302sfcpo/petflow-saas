import { apiError,getApiContext } from "@/lib/api-context";
import { fiscalService } from "@/lib/fiscal/fiscal-service";
import { PERMISSIONS } from "@/lib/permissions";

export async function POST(_: Request, context: RouteContext<"/api/fiscal/documents/[id]/email">) {
  try {
    const { tenantId, userId } = await getApiContext(PERMISSIONS.FISCAL_ISSUE, "fiscal");
    const { id } = await context.params;
    await fiscalService.emailDocument(tenantId, userId, id);
    return Response.json({ sent: true });
  } catch (error) { return apiError(error); }
}
