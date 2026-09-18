import { z } from "zod";
import { apiError,getApiContext } from "@/lib/api-context";
import { fiscalService } from "@/lib/fiscal/fiscal-service";
import { PERMISSIONS } from "@/lib/permissions";

const schema = z.object({
  saleId: z.string().min(1),
  type: z.enum(["NFE", "NFCE"]),
  series: z.number().int().min(0).max(999),
  contingency: z.boolean().optional(),
  contingencyReason: z.string().trim().max(255).optional(),
});

export async function POST(request: Request) {
  try {
    const { tenantId, branchId, userId } = await getApiContext(PERMISSIONS.FISCAL_ISSUE, "fiscal");
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Emissão fiscal inválida.", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
    if (parsed.data.contingency && !parsed.data.contingencyReason) return Response.json({ error: "Informe o motivo da contingência." }, { status: 422 });
    const document = await fiscalService.issue(tenantId, branchId, userId, parsed.data);
    return Response.json({ document });
  } catch (error) { return apiError(error); }
}
