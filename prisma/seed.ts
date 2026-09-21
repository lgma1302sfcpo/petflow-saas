import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { MODULES } from "../src/lib/modules";
import { PERMISSIONS } from "../src/lib/permissions";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL não configurada.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const permissionDefinitions = [
  [PERMISSIONS.SALES_VIEW_CREATE, "sales", "Visualizar e cadastrar vendas"],
  [PERMISSIONS.SALES_VIEW_CANCEL, "sales", "Visualizar e cancelar vendas"],
  [PERMISSIONS.CASH_VIEW_OPERATE, "cash", "Visualizar e operar caixa"],
  [PERMISSIONS.STOCK_VIEW_MOVE, "stock", "Visualizar e movimentar estoque"],
  [PERMISSIONS.PRODUCTS_VIEW_CREATE, "products", "Visualizar e cadastrar produtos"],
  [PERMISSIONS.CUSTOMERS_VIEW_CREATE, "customers", "Visualizar e cadastrar clientes"],
  [PERMISSIONS.REPORTS_VIEW, "reports", "Visualizar relatórios"],
  [PERMISSIONS.FINANCE_VIEW, "finance", "Visualizar financeiro"],
  [PERMISSIONS.GROOMING_MANAGE, "grooming", "Gerenciar banho e tosa"],
  [PERMISSIONS.USERS_MANAGE, "users", "Administrar usuários"],
  [PERMISSIONS.SETTINGS_MANAGE, "settings", "Administrar configurações"],
  [PERMISSIONS.FISCAL_MANAGE, "fiscal", "Administrar configuração fiscal"],
  [PERMISSIONS.FISCAL_ISSUE, "fiscal", "Emitir e gerenciar documentos fiscais"],
] as const;

async function main() {
  const permissions = await Promise.all(permissionDefinitions.map(([key,module,name]) => prisma.permission.upsert({ where:{key}, update:{module,name}, create:{key,module,name} })));
  const plans = [
    { slug:"basico", name:"Básico", maxBranches:1, maxUsers:3, enabledModules:["dashboard","products","stock","customers","sales","cash"] },
    { slug:"profissional", name:"Profissional", maxBranches:3, maxUsers:12, enabledModules:MODULES.filter((module)=>module!=="fiscal") },
    { slug:"completo", name:"Completo", maxBranches:10, maxUsers:50, enabledModules:[...MODULES] },
  ];
  const savedPlans=await Promise.all(plans.map(plan=>prisma.plan.upsert({where:{slug:plan.slug},update:{...plan,enabledFeatures:[]},create:{...plan,enabledFeatures:[]}})));
  const platformPassword=await hash(process.env.SEED_SUPERADMIN_PASSWORD??"Dev@123456",12);
  await prisma.platformUser.upsert({where:{username:process.env.SEED_SUPERADMIN_USERNAME??"plataforma"},update:{passwordHash:platformPassword,active:true},create:{name:"Administrador da Plataforma",username:process.env.SEED_SUPERADMIN_USERNAME??"plataforma",passwordHash:platformPassword}});

  if(process.env.SEED_DEMO_TENANT==="false")return;

  const tenant=await prisma.tenant.upsert({where:{slug:"pet-demo"},update:{status:"ACTIVE"},create:{name:"Pet & Companhia",slug:"pet-demo",document:"12345678000190",status:"ACTIVE",trialEndsAt:new Date(Date.now()+30*86_400_000),settings:{create:{brandName:"Pet & Companhia",primaryColor:"#176b57",acceptedPaymentMethods:["PIX","DINHEIRO","DEBITO","CREDITO"],requiredCustomerFields:["fullName","phone"],bulkSaleEnabled:true}},subscriptions:{create:{planId:savedPlans[1].id,status:"ACTIVE",currentPeriodEnd:new Date(Date.now()+30*86_400_000)}}}});
  await prisma.tenantSetting.upsert({where:{tenantId:tenant.id},update:{requiredCustomerFields:["fullName","phone"]},create:{tenantId:tenant.id,brandName:"Pet & Companhia",primaryColor:"#176b57",acceptedPaymentMethods:["PIX","DINHEIRO","DEBITO","CREDITO"],requiredCustomerFields:["fullName","phone"],bulkSaleEnabled:true}});
  if(!(await prisma.subscription.findFirst({where:{tenantId:tenant.id}}))) await prisma.subscription.create({data:{tenantId:tenant.id,planId:savedPlans[1].id,status:"ACTIVE"}});
  const matriz=await prisma.branch.upsert({where:{tenantId_code:{tenantId:tenant.id,code:"MATRIZ"}},update:{active:true},create:{tenantId:tenant.id,name:"Loja Centro",code:"MATRIZ"}});
  const bairro=await prisma.branch.upsert({where:{tenantId_code:{tenantId:tenant.id,code:"BAIRRO"}},update:{active:true},create:{tenantId:tenant.id,name:"Loja Bairro",code:"BAIRRO"}});
  const role=await prisma.role.upsert({where:{tenantId_name:{tenantId:tenant.id,name:"Administrador"}},update:{system:true},create:{tenantId:tenant.id,name:"Administrador",description:"Acesso administrativo completo",system:true}});
  await Promise.all(permissions.map(permission=>prisma.rolePermission.upsert({where:{roleId_permissionId:{roleId:role.id,permissionId:permission.id}},update:{},create:{roleId:role.id,permissionId:permission.id}})));
  const adminPassword=await hash(process.env.SEED_TENANT_ADMIN_PASSWORD??"Demo@123456",12);
  const user=await prisma.user.upsert({where:{tenantId_username:{tenantId:tenant.id,username:process.env.SEED_TENANT_ADMIN_USERNAME??"admin.demo"}},update:{passwordHash:adminPassword,status:"ACTIVE",roleId:role.id},create:{tenantId:tenant.id,roleId:role.id,name:"Marina Oliveira",username:process.env.SEED_TENANT_ADMIN_USERNAME??"admin.demo",passwordHash:adminPassword}});
  for(const branch of [matriz,bairro]) await prisma.userBranch.upsert({where:{userId_branchId:{userId:user.id,branchId:branch.id}},update:{tenantId:tenant.id},create:{tenantId:tenant.id,userId:user.id,branchId:branch.id}});
  const products=await Promise.all([
    prisma.product.upsert({where:{tenantId_internalCode:{tenantId:tenant.id,internalCode:"RACAO-001"}},update:{active:true},create:{tenantId:tenant.id,name:"Ração Premium Cães",internalCode:"RACAO-001",category:"Alimentação",unit:"KG",salePrice:37.9,costPrice:24.5,bulkSale:true,minimumStock:5}}),
    prisma.product.upsert({where:{tenantId_internalCode:{tenantId:tenant.id,internalCode:"SHAMP-001"}},update:{active:true},create:{tenantId:tenant.id,name:"Shampoo Neutro 500 ml",internalCode:"SHAMP-001",category:"Higiene",unit:"UN",salePrice:29.9,costPrice:16.2,minimumStock:3}}),
  ]);
  for(const product of products){for(const branch of [matriz,bairro])await prisma.productBranch.upsert({where:{productId_branchId:{productId:product.id,branchId:branch.id}},update:{active:true},create:{tenantId:tenant.id,productId:product.id,branchId:branch.id}});await prisma.stockBalance.upsert({where:{tenantId_branchId_productId:{tenantId:tenant.id,branchId:matriz.id,productId:product.id}},update:{},create:{tenantId:tenant.id,branchId:matriz.id,productId:product.id,quantity:20,averageCost:product.costPrice}})}
  if(!await prisma.customer.findFirst({where:{tenantId:tenant.id,phone:"11999990000"}})){const customer=await prisma.customer.create({data:{tenantId:tenant.id,branchId:matriz.id,fullName:"Cliente Demonstração",phone:"11999990000"}});await prisma.pet.create({data:{tenantId:tenant.id,customerId:customer.id,name:"Thor",type:"DOG",breed:"Golden Retriever"}})}
  if(!await prisma.professional.findFirst({where:{tenantId:tenant.id,branchId:matriz.id,name:"Ana Tosadora"}}))await prisma.professional.create({data:{tenantId:tenant.id,branchId:matriz.id,name:"Ana Tosadora",commissionPercent:10,simultaneousCapacity:1}});
  if(!await prisma.groomingService.findFirst({where:{tenantId:tenant.id,name:"Banho completo"}}))await prisma.groomingService.create({data:{tenantId:tenant.id,name:"Banho completo",durationMinutes:60,price:65,commissionPercent:10}});
  await prisma.auditLog.create({data:{actorType:"SYSTEM",tenantId:tenant.id,action:"seed.complete",entity:"Tenant",entityId:tenant.id,metadata:{environment:"development"}}});
}

main().finally(()=>prisma.$disconnect());
