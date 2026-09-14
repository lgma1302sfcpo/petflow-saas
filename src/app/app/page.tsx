import { Boxes,Settings2,ShieldCheck,Store,Users } from "lucide-react";
import { CreateEmployeeForm } from "@/components/create-employee-form";
import { AdvancedSettings } from "@/components/advanced-settings";
import { BranchSettings } from "@/components/branch-settings";
import { BrandSettings } from "@/components/brand-settings";
import { CreateBranchForm,CreateRoleForm,TenantSettingsForm } from "@/components/tenant-controls";
import { resolveEnabledModules } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { requireTenantSession } from "@/lib/session";

export default async function TenantPage(){
  const session=await requireTenantSession(); const tenantId=session.user.tenantId!;
  const tenant=await prisma.tenant.findUniqueOrThrow({where:{id:tenantId},include:{branches:{where:{deletedAt:null},orderBy:{name:"asc"}},users:{where:{deletedAt:null},include:{role:true},orderBy:{name:"asc"}},roles:{orderBy:{name:"asc"}},settings:true,moduleOverrides:true,subscriptions:{include:{plan:true},orderBy:{createdAt:"desc"},take:1}}});
  const plan=tenant.subscriptions[0]?.plan; const modules=resolveEnabledModules(plan?.enabledModules??[],tenant.moduleOverrides);
  return <>
    <div className="page-head"><div><span className="eyebrow">Fundação da empresa</span><h1 className="display">Olá, {session.user.name?.split(" ")[0]}.</h1><p>Equipe, lojas e regras de acesso prontas para a operação.</p></div><span className="pill"><ShieldCheck size={14}/>{plan?.name??"Sem plano"}</span></div>
    <section className="metrics"><Metric label="Lojas" value={`${tenant.branches.length}/${plan?.maxBranches??0}`} note="limite do plano" icon={<Store size={17}/>}/><Metric label="Usuários" value={`${tenant.users.length}/${plan?.maxUsers??0}`} note="acessos ativos" icon={<Users size={17}/>}/><Metric label="Módulos" value={String(modules.length)} note="recursos habilitados" icon={<Boxes size={17}/>}/><Metric label="Status" value={tenant.status} note="assinatura operacional" icon={<ShieldCheck size={17}/>}/></section>
    <div className="grid-2"><section className="section-card card"><div className="section-title"><div><span className="eyebrow">Estrutura</span><h2>Lojas e equipe</h2></div></div><div className="table-wrap" id="lojas"><table><thead><tr><th>Loja</th><th>Código</th><th>Status</th></tr></thead><tbody>{tenant.branches.map(branch=><tr key={branch.id}><td><strong>{branch.name}</strong></td><td>{branch.code}</td><td><span className="status-dot"/>Ativa</td></tr>)}</tbody></table></div><div className="table-wrap" style={{marginTop:25}}><table><thead><tr><th>Funcionário</th><th>Usuário</th><th>Cargo</th><th>Status</th></tr></thead><tbody>{tenant.users.map(user=><tr key={user.id}><td><strong>{user.name}</strong></td><td>{user.username}</td><td>{user.role.name}</td><td>{user.status}</td></tr>)}</tbody></table></div><div className="section-title" style={{marginTop:26}} id="configuracoes"><div><span className="eyebrow">Feature flags</span><h2>Módulos efetivos</h2></div><Settings2 size={18}/></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{modules.map(module=><span className="pill" key={module}>{module}</span>)}</div></section>
      <div style={{display:"grid",gap:18}}><CreateEmployeeForm roles={tenant.roles.map(({id,name})=>({id,name}))} branches={tenant.branches.map(({id,name})=>({id,name}))}/><CreateRoleForm/><CreateBranchForm/>{tenant.settings?<><TenantSettingsForm settings={tenant.settings}/><BrandSettings logoUrl={tenant.settings.logoUrl}/><AdvancedSettings settings={tenant.settings}/><BranchSettings branches={tenant.branches.map(({id,name})=>({id,name}))}/></>:null}</div>
    </div>
  </>;
}

function Metric({label,value,note,icon}:{label:string;value:string;note:string;icon:React.ReactNode}){return <div className="metric card"><div className="metric-top"><span>{label}</span>{icon}</div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></div>}
