import { Activity,Building2,Clock3,ShieldCheck } from "lucide-react";
import { CreateTenantForm } from "@/components/create-tenant-form";
import { CreatePlanForm,PlatformControls } from "@/components/platform-controls";
import { PlatformManagement } from "@/components/platform-management";
import { PlatformSensitiveAccess } from "@/components/platform-sensitive-access";
import { prisma } from "@/lib/prisma";

export default async function PlatformPage(){
  const [tenants,plans,audits]=await Promise.all([
    prisma.tenant.findMany({include:{branches:true,users:true,subscriptions:{include:{plan:true},orderBy:{createdAt:"desc"},take:1}},orderBy:{createdAt:"desc"},take:8}),
    prisma.plan.findMany({where:{active:true},orderBy:{maxUsers:"asc"}}),
    prisma.auditLog.findMany({orderBy:{createdAt:"desc"},take:6}),
  ]);
  const active=tenants.filter(tenant=>tenant.status==="ACTIVE").length;
  return <>
    <div className="page-head"><div><span className="eyebrow">Visão da plataforma</span><h1 className="display">Operação sob controle.</h1><p>Empresas, planos, limites e trilha de auditoria em uma única visão.</p></div><span className="pill"><ShieldCheck size={14}/>Separação administrativa ativa</span></div>
    <section className="metrics"><Metric label="Empresas cadastradas" value={String(tenants.length)} note="base atual" icon={<Building2 size={17}/>}/><Metric label="Empresas ativas" value={String(active)} note="operações liberadas" icon={<Activity size={17}/>}/><Metric label="Em avaliação" value={String(tenants.filter(tenant=>tenant.status==="TRIAL").length)} note="teste de 14 dias" icon={<Clock3 size={17}/>}/><Metric label="Planos disponíveis" value={String(plans.length)} note="configuração central" icon={<ShieldCheck size={17}/>}/></section>
    <div className="grid-2"><section className="section-card card" id="empresas"><div className="section-title"><div><span className="eyebrow">Clientes</span><h2>Empresas recentes</h2></div></div><div className="table-wrap"><table><thead><tr><th>Empresa</th><th>Status</th><th>Plano</th><th>Lojas</th><th>Usuários</th><th>Teste até</th></tr></thead><tbody>{tenants.map(tenant=><tr key={tenant.id}><td><strong>{tenant.name}</strong><br/><small>{tenant.slug}</small></td><td><span className="status-dot"/>{tenant.status}</td><td>{tenant.subscriptions[0]?.plan.name??"—"}</td><td>{tenant.branches.length}</td><td>{tenant.users.length}</td><td>{tenant.trialEndsAt?new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo"}).format(tenant.trialEndsAt):"—"}</td></tr>)}</tbody></table></div><div id="auditoria" style={{marginTop:24}}><div className="section-title"><h2>Auditoria recente</h2></div><div className="quick-list">{audits.map(log=><div className="quick-item" key={log.id}><span className="quick-icon"><ShieldCheck size={17}/></span><div><strong>{log.action}</strong><span>{log.entity} · {new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short",timeZone:"America/Sao_Paulo"}).format(log.createdAt)}</span></div></div>)}</div></div></section>
      <div id="planos" style={{display:"grid",gap:18}}><CreateTenantForm plans={plans.map(({id,name})=>({id,name}))}/><PlatformControls tenants={tenants.map(({id,name,status})=>({id,name,status}))}/><CreatePlanForm/></div>
    </div>
    <PlatformManagement plans={plans.map(plan=>({id:plan.id,name:plan.name,slug:plan.slug,maxBranches:plan.maxBranches,maxUsers:plan.maxUsers,enabledModules:plan.enabledModules,active:plan.active}))} tenants={tenants.map(tenant=>({id:tenant.id,name:tenant.name,status:tenant.status,planId:tenant.subscriptions[0]?.planId}))}/>
    <PlatformSensitiveAccess tenants={tenants.map(tenant=>({id:tenant.id,name:tenant.name}))}/>
  </>;
}

function Metric({label,value,note,icon}:{label:string;value:string;note:string;icon:React.ReactNode}){return <div className="metric card"><div className="metric-top"><span>{label}</span>{icon}</div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></div>}
