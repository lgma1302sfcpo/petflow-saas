import { z } from "zod";
import { apiError,getApiContext } from "@/lib/api-context";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
const schema=z.object({environment:z.enum(["HOMOLOGATION","PRODUCTION"]),provider:z.string().trim().max(80).optional()});
export async function GET(){try{const {tenantId}=await getApiContext(PERMISSIONS.SETTINGS_MANAGE,"fiscal");return Response.json({config:await prisma.fiscalConfig.findUnique({where:{tenantId}}),issuanceAvailable:false,message:"Emissão fiscal exige integração e certificado configurados."})}catch(error){return apiError(error)}}
export async function PUT(request:Request){try{const {tenantId,branchId,userId}=await getApiContext(PERMISSIONS.SETTINGS_MANAGE,"fiscal");const parsed=schema.safeParse(await request.json());if(!parsed.success)return Response.json({error:"Configuração fiscal inválida."},{status:422});const config=await prisma.$transaction(async tx=>{const saved=await tx.fiscalConfig.upsert({where:{tenantId},update:parsed.data,create:{tenantId,...parsed.data}});await tx.auditLog.create({data:{actorType:"TENANT",tenantId,branchId,userId,action:"fiscal.config.update",entity:"FiscalConfig",entityId:saved.id,metadata:{environment:saved.environment}}});return saved});return Response.json({config})}catch(error){return apiError(error)}}
