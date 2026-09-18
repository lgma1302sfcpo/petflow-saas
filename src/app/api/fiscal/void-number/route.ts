import { z } from "zod";
import { apiError,getApiContext } from "@/lib/api-context";
import { fiscalService } from "@/lib/fiscal/fiscal-service";
import { PERMISSIONS } from "@/lib/permissions";

const schema = z.object({
  type: z.enum(["NFE", "NFCE"]),
  series: z.number().int().min(0).max(999),
  numberFrom: z.number().int().min(1).max(999_999_999),
  numberTo: z.number().int().min(1).max(999_999_999),
  reason: z.string().trim().min(15).max(255),
}).refine((value) => value.numberTo >= value.numberFrom, { message: "O número final deve ser maior ou igual ao inicial." });

export async function POST(request: Request) {
  try {
    const { tenantId, branchId, userId } = await getApiContext(PERMISSIONS.FISCAL_MANAGE, "fiscal");
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Inutilização inválida.", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
    const result = await fiscalService.voidNumber(tenantId, branchId, userId, parsed.data);
    return Response.json(result);
  } catch (error) { return apiError(error); }
}
