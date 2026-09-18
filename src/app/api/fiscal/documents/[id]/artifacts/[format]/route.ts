import { apiError,getApiContext } from "@/lib/api-context";
import { fiscalService } from "@/lib/fiscal/fiscal-service";
import { PERMISSIONS } from "@/lib/permissions";

export async function GET(_: Request, context: RouteContext<"/api/fiscal/documents/[id]/artifacts/[format]">) {
  try {
    const { tenantId } = await getApiContext(PERMISSIONS.FISCAL_ISSUE, "fiscal");
    const { id, format } = await context.params;
    if (format !== "xml" && format !== "pdf") return Response.json({ error: "Formato inválido." }, { status: 422 });
    const artifact = await fiscalService.artifact(tenantId, id, format);
    const body = format === "xml" ? artifact.content as string : new Uint8Array(artifact.content as Uint8Array);
    return new Response(body, {
      headers: {
        "content-type": format === "xml" ? "application/xml; charset=utf-8" : "application/pdf",
        "content-disposition": `attachment; filename="${artifact.filename}"`,
      },
    });
  } catch (error) { return apiError(error); }
}
