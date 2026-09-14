import "server-only";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { authOptions } from "@/lib/auth";
import { resolveEnabledModules,type ModuleKey } from "@/lib/modules";
import { hasPermission,type PermissionKey } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { consumeAttempt } from "@/lib/rate-limit";

export class ApiAccessError extends Error { constructor(public status:number,message:string){super(message)} }

export async function getApiContext(permission?:PermissionKey,module?:ModuleKey){const session=await getServerSession(authOptions);if(!session?.user.tenantId||session.user.valid===false)throw new ApiAccessError(401,"Sessão inválida.");if(permission&&!hasPermission(session.user.permissions,permission))throw new ApiAccessError(403,"Sem permissão para esta ação.");const requested=(await cookies()).get("petflow_branch")?.value;const branchId=requested&&session.user.branchIds.includes(requested)?requested:session.user.branchIds[0];if(!branchId)throw new ApiAccessError(403,"Nenhuma loja autorizada.");if(!await prisma.branch.findFirst({where:{id:branchId,tenantId:session.user.tenantId,active:true,deletedAt:null},select:{id:true}}))throw new ApiAccessError(403,"Loja inválida.");if(module){const tenant=await prisma.tenant.findUniqueOrThrow({where:{id:session.user.tenantId},include:{moduleOverrides:true,subscriptions:{include:{plan:true},orderBy:{createdAt:"desc"},take:1}}});const enabled=resolveEnabledModules(tenant.subscriptions[0]?.plan.enabledModules??[],tenant.moduleOverrides);if(!enabled.includes(module))throw new ApiAccessError(403,"Módulo não habilitado para esta empresa.")}return {session,tenantId:session.user.tenantId,branchId,userId:session.user.id}}

export function apiError(error:unknown){if(error instanceof ApiAccessError)return Response.json({error:error.message},{status:error.status});console.error(error);return Response.json({error:"Não foi possível concluir a operação."},{status:500})}

export function enforceApiRateLimit(key:string,limit=60,windowMs=60_000){if(!consumeAttempt(key,limit,windowMs).allowed)throw new ApiAccessError(429,"Muitas operações em pouco tempo. Aguarde e tente novamente.")}
