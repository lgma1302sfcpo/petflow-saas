import { apiError,getApiContext } from "@/lib/api-context";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
export async function GET(request:Request){try{const {tenantId,branchId}=await getApiContext(PERMISSIONS.SETTINGS_MANAGE);const params=new URL(request.url).searchParams;const action=params.get("action")?.trim();const entity=params.get("entity")?.trim();const logs=await prisma.auditLog.findMany({where:{tenantId,branchId,action:action?{contains:action,mode:"insensitive"}:undefined,entity:entity||undefined},orderBy:{createdAt:"desc"},take:Math.min(500,Math.max(1,Number(params.get("limit")??100)))});return Response.json({logs})}catch(error){return apiError(error)}}
