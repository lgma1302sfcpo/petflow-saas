import { z } from "zod";
import { apiError,getApiContext } from "@/lib/api-context";
import { fiscalService } from "@/lib/fiscal/fiscal-service";
import { PERMISSIONS } from "@/lib/permissions";

const schema = z.object({
  legalName: z.string().trim().max(120).optional(),
  tradeName: z.string().trim().max(120).optional(),
  cnpj: z.string().trim().max(20).optional(),
  stateRegistration: z.string().trim().max(20).optional(),
  municipalRegistration: z.string().trim().max(20).optional(),
  taxRegime: z.string().trim().max(30).optional(),
  cnae: z.string().trim().max(20).optional(),
  street: z.string().trim().max(120).optional(),
  number: z.string().trim().max(20).optional(),
  complement: z.string().trim().max(60).optional(),
  district: z.string().trim().max(60).optional(),
  city: z.string().trim().max(60).optional(),
  cityCode: z.string().trim().max(10).optional(),
  state: z.string().trim().length(2).optional(),
  zipCode: z.string().trim().max(9).optional(),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().email().max(120).optional().or(z.literal("")),
  environment: z.enum(["HOMOLOGATION", "PRODUCTION"]),
  providerType: z.enum(["SANDBOX", "DIRECT_SEFAZ_SP", "NOT_CONFIGURED"]),
  provider: z.string().trim().max(80).optional(),
  certificateBase64: z.string().trim().optional(),
  certificatePassword: z.string().trim().max(120).optional(),
  certificateName: z.string().trim().max(120).optional(),
  enableNfe: z.boolean().optional(),
  enableNfce: z.boolean().optional(),
  autoEmail: z.boolean().optional(),
  directTransmissionEnabled: z.boolean().optional(),
});

export async function GET() {
  try {
    const { tenantId, branchId } = await getApiContext(PERMISSIONS.FISCAL_MANAGE, "fiscal");
    const overview = await fiscalService.getOverview(tenantId, branchId);
    return Response.json(overview);
  } catch (error) { return apiError(error); }
}

export async function PUT(request: Request) {
  try {
    const { tenantId, branchId, userId } = await getApiContext(PERMISSIONS.FISCAL_MANAGE, "fiscal");
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Configuração fiscal inválida.", fields: parsed.error.flatten().fieldErrors }, { status: 422 });
    if (parsed.data.environment === "PRODUCTION" && !parsed.data.directTransmissionEnabled) {
      return Response.json({ error: "A produção só pode ser habilitada junto com a transmissão direta e o certificado válido configurados explicitamente." }, { status: 422 });
    }
    const config = await fiscalService.saveConfiguration(tenantId, branchId, userId, parsed.data);
    return Response.json({ config });
  } catch (error) { return apiError(error); }
}
