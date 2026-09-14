import { apiError,getApiContext } from "@/lib/api-context";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { petInput } from "@/modules/commerce/schemas";

export async function GET(request:Request){try{const {tenantId}=await getApiContext(PERMISSIONS.CUSTOMERS_VIEW_CREATE,"customers");const customerId=new URL(request.url).searchParams.get("customerId");return Response.json({pets:await prisma.pet.findMany({where:{tenantId,customerId:customerId||undefined,deletedAt:null},orderBy:{name:"asc"},take:200})})}catch(error){return apiError(error)}}

export async function POST(request:Request){try{const {tenantId,branchId,userId}=await getApiContext(PERMISSIONS.CUSTOMERS_VIEW_CREATE,"customers");const parsed=petInput.safeParse(await request.json());if(!parsed.success)return Response.json({error:"Pet inválido.",fields:parsed.error.flatten().fieldErrors},{status:422});if(!await prisma.customer.findFirst({where:{id:parsed.data.customerId,tenantId,deletedAt:null}}))return Response.json({error:"Cliente fora da empresa."},{status:403});const pet=await prisma.$transaction(async tx=>{const created=await tx.pet.create({data:{tenantId,...parsed.data}});await tx.auditLog.create({data:{actorType:"TENANT",tenantId,branchId,userId,action:"pet.create",entity:"Pet",entityId:created.id}});return created});return Response.json({pet},{status:201})}catch(error){return apiError(error)}}
