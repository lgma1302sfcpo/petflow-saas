import { apiError,getApiContext } from "@/lib/api-context";
import { fiscalService } from "@/lib/fiscal/fiscal-service";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET() {
  try {
    const { tenantId } = await getApiContext(PERMISSIONS.FISCAL_MANAGE, "fiscal");
    const backup = await fiscalService.backup(tenantId);
    return Response.json(backup);
  } catch (error) { return apiError(error); }
}
