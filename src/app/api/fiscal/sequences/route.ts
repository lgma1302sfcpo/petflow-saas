import { z } from "zod";
import { apiError,getApiContext } from "@/lib/api-context";
import { fiscalService } from "@/lib/fiscal/fiscal-service";
import { PERMISSIONS } from "@/lib/permissions";

const schema = z.object({
  type: z.enum(["NFE", "NFCE"]),
  series: z.number().int().min(0).max(999),
  nextNumber: z.number().int().min(1).max(999_999_999),
});

export async function PUT(request: Request) {
  try {
    const { tenantId, branchId, userId } = await getApiContext(PERMISSIONS.FISCAL_MANAGE, "fiscal");
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Numeração inválida.", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
    const sequence = await fiscalService.adjustSequence(tenantId, branchId, userId, parsed.data);
    return Response.json({ sequence });
  } catch (error) { return apiError(error); }
}
