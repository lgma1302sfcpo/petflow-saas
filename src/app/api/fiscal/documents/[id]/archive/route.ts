import { z } from "zod";
import { apiError,getApiContext } from "@/lib/api-context";
import { fiscalService } from "@/lib/fiscal/fiscal-service";
import { PERMISSIONS } from "@/lib/permissions";

const schema = z.object({ reason: z.string().trim().min(3).max(255) });

export async function POST(request: Request, context: RouteContext<"/api/fiscal/documents/[id]/archive">) {
  try {
    const { tenantId, branchId, userId } = await getApiContext(PERMISSIONS.FISCAL_ISSUE, "fiscal");
    const { id } = await context.params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Informe o motivo do arquivamento." }, { status: 422 });
    const result = await fiscalService.archiveDocument(tenantId, branchId, userId, id, parsed.data.reason);
    return Response.json(result);
  } catch (error) { return apiError(error); }
}
