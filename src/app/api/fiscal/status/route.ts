import { apiError,getApiContext } from "@/lib/api-context";
import { fiscalService } from "@/lib/fiscal/fiscal-service";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET(request: Request) {
  try {
    const { tenantId } = await getApiContext(PERMISSIONS.FISCAL_ISSUE, "fiscal");
    const type = new URL(request.url).searchParams.get("type");
    if (type !== "NFE" && type !== "NFCE") return Response.json({ error: "Informe o tipo de documento (NFE ou NFCE)." }, { status: 422 });
    const status = await fiscalService.serviceStatus(tenantId, type);
    return Response.json({ status });
  } catch (error) { return apiError(error); }
}
