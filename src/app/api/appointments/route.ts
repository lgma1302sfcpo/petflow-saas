import { apiError,getApiContext } from "@/lib/api-context";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { appointmentInput } from "@/modules/commerce/schemas";

async function slotAvailable(tenantId:string,branchId:string,professionalId:string,startsAt:Date,endsAt:Date,capacity:number){
  const [blocked,busy]=await Promise.all([
    prisma.appointment.count({where:{tenantId,branchId,professionalId,status:"BLOCKED",startsAt:{lt:endsAt},endsAt:{gt:startsAt}}}),
    prisma.appointment.count({where:{tenantId,branchId,professionalId,status:{notIn:["CANCELLED","NO_SHOW","BLOCKED"]},startsAt:{lt:endsAt},endsAt:{gt:startsAt}}}),
  ]);
  return blocked===0&&busy<capacity;
}

export async function GET(request:Request){try{const {tenantId,branchId}=await getApiContext(PERMISSIONS.GROOMING_MANAGE,"grooming");const params=new URL(request.url).searchParams;const from=params.get("from")?new Date(params.get("from")!):new Date();const to=params.get("to")?new Date(params.get("to")!):new Date(Date.now()+30*86_400_000);return Response.json({appointments:await prisma.appointment.findMany({where:{tenantId,branchId,startsAt:{gte:from,lte:to}},orderBy:{startsAt:"asc"}})})}catch(error){return apiError(error)}}

export async function POST(request:Request){
  try{
    const {tenantId,branchId,userId}=await getApiContext(PERMISSIONS.GROOMING_MANAGE,"grooming");
    const parsed=appointmentInput.safeParse(await request.json());
    if(!parsed.success)return Response.json({error:"Agendamento inválido.",fields:parsed.error.flatten().fieldErrors},{status:422});
    const [professional,service,customer,pet]=await Promise.all([
      prisma.professional.findFirst({where:{id:parsed.data.professionalId,tenantId,branchId,active:true}}),
      parsed.data.serviceId?prisma.groomingService.findFirst({where:{id:parsed.data.serviceId,tenantId,active:true}}):null,
      parsed.data.customerId?prisma.customer.findFirst({where:{id:parsed.data.customerId,tenantId,deletedAt:null}}):null,
      parsed.data.petId?prisma.pet.findFirst({where:{id:parsed.data.petId,tenantId,deletedAt:null}}):null,
    ]);
    if(!professional||parsed.data.serviceId&&!service)return Response.json({error:"Profissional ou serviço inválido."},{status:403});
    if(parsed.data.customerId&&!customer)return Response.json({error:"Cliente inválido."},{status:403});
    if(parsed.data.petId&&(!pet||parsed.data.customerId&&pet.customerId!==parsed.data.customerId))return Response.json({error:"Pet não pertence ao cliente informado."},{status:403});
    const duration=service?.durationMinutes??60;
    const startsAt=parsed.data.startsAt;
    const endsAt=new Date(startsAt.getTime()+duration*60_000);
    if(!await slotAvailable(tenantId,branchId,professional.id,startsAt,endsAt,professional.simultaneousCapacity)){
      let suggestion=new Date(startsAt);
      for(let i=0;i<7*24*4;i++){
        suggestion=new Date(suggestion.getTime()+15*60_000);
        const suggestionEnd=new Date(suggestion.getTime()+duration*60_000);
        if(await slotAvailable(tenantId,branchId,professional.id,suggestion,suggestionEnd,professional.simultaneousCapacity))return Response.json({error:"Horário lotado.",suggestedStart:suggestion.toISOString()},{status:409});
      }
      return Response.json({error:"Sem horário disponível nos próximos 7 dias."},{status:409});
    }
    const appointment=await prisma.$transaction(async tx=>{const created=await tx.appointment.create({data:{tenantId,branchId,professionalId:professional.id,serviceId:service?.id,customerId:parsed.data.customerId,petId:parsed.data.petId,startsAt,endsAt,price:service?.price??0,notes:parsed.data.notes,createdById:userId}});await tx.auditLog.create({data:{actorType:"TENANT",tenantId,branchId,userId,action:"appointment.create",entity:"Appointment",entityId:created.id}});return created});
    return Response.json({appointment},{status:201});
  }catch(error){return apiError(error)}
}
