"use client";
import { useMutation,useQuery,useQueryClient } from "@tanstack/react-query";
import { FormEvent,useMemo,useState } from "react";
import { Ban,ChevronLeft,ChevronRight } from "lucide-react";

type Professional={id:string;name:string;simultaneousCapacity:number};
type Service={id:string;name:string;durationMinutes:number;price:string};
type Customer={id:string;fullName:string;phone:string};
type Pet={id:string;name:string;customerId:string};
type Appointment={id:string;professionalId:string;serviceId?:string;customerId?:string;petId?:string;startsAt:string;endsAt:string;status:string;price:string;notes?:string};

async function json(url:string,init?:RequestInit){const r=await fetch(url,init);const d=await r.json();if(!r.ok){const suggestion=d.suggestedStart?` Próximo horário sugerido: ${new Date(d.suggestedStart).toLocaleString("pt-BR")}.`:"";throw new Error(`${d.error??"Falha na operação."}${suggestion}`)}return d}
const money=(value:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value);
const statusLabels:Record<string,string>={SCHEDULED:"Agendado",CONFIRMED:"Confirmado",IN_SERVICE:"Em atendimento",COMPLETED:"Concluído",CANCELLED:"Cancelado",NO_SHOW:"Não compareceu",BLOCKED:"Bloqueado"};
function localDay(date=new Date()){return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(date)}
function shiftDay(value:string,amount:number){const date=new Date(`${value}T12:00:00-03:00`);date.setUTCDate(date.getUTCDate()+amount);return localDay(date)}
function dayKey(value:string){return localDay(new Date(value))}
function isoAt(day:string,time:string){return new Date(`${day}T${time}:00-03:00`).toISOString()}
function monthCells(month:string){const [year,monthNumber]=month.split("-").map(Number);const leading=new Date(Date.UTC(year,monthNumber-1,1)).getUTCDay();const total=new Date(Date.UTC(year,monthNumber,0)).getUTCDate();return Array.from({length:42},(_,index)=>{const day=index-leading+1;return day>=1&&day<=total?`${month}-${String(day).padStart(2,"0")}`:null})}
const SLOTS=Array.from({length:24},(_,index)=>{const minutes=8*60+index*30;return `${String(Math.floor(minutes/60)).padStart(2,"0")}:${String(minutes%60).padStart(2,"0")}`});

export function GroomingWorkspace(){
  const client=useQueryClient();
  const [message,setMessage]=useState("");
  const [date,setDate]=useState(localDay());
  const [form,setForm]=useState({professionalId:"",serviceId:"",customerId:"",petId:"",time:"09:00",notes:""});
  const [blockForm,setBlockForm]=useState({professionalId:"",startTime:"12:00",endTime:"13:00",reason:"Almoço"});
  const month=date.slice(0,7);
  const monthStart=new Date(`${month}-01T00:00:00-03:00`);
  const monthEnd=new Date(monthStart.getFullYear(),monthStart.getMonth()+1,1);

  const professionals=useQuery<{professionals:Professional[]}>({queryKey:["professionals"],queryFn:()=>json("/api/grooming/professionals")});
  const services=useQuery<{services:Service[]}>({queryKey:["grooming-services"],queryFn:()=>json("/api/grooming/services")});
  const customers=useQuery<{customers:Customer[]}>({queryKey:["grooming-customers"],queryFn:()=>json("/api/customers")});
  const pets=useQuery<{pets:Pet[]}>({queryKey:["grooming-pets"],queryFn:()=>json("/api/pets")});
  const monthAppointments=useQuery<{appointments:Appointment[]}>({queryKey:["appointments",month],queryFn:()=>json(`/api/appointments?from=${monthStart.toISOString()}&to=${monthEnd.toISOString()}`)});

  const mutate=useMutation({mutationFn:({url,payload,method="POST"}:{url:string;payload:unknown;method?:string})=>json(url,{method,headers:{"content-type":"application/json"},body:JSON.stringify(payload)}),onSuccess:()=>{setMessage("Operação concluída.");client.invalidateQueries()},onError:e=>setMessage(e.message)});

  const allAppointments=useMemo(()=>monthAppointments.data?.appointments??[],[monthAppointments.data]);
  const dayAppointments=useMemo(()=>allAppointments.filter(a=>dayKey(a.startsAt)===date),[allAppointments,date]);
  const activeAppointments=dayAppointments.filter(a=>a.status!=="CANCELLED"&&a.status!=="BLOCKED");
  const blocks=dayAppointments.filter(a=>a.status==="BLOCKED");
  const professionalList=professionals.data?.professionals??[];
  const petList=pets.data?.pets??[];
  const dayRevenue=activeAppointments.reduce((sum,a)=>sum+Number(a.price),0);
  const selectedService=services.data?.services.find(s=>s.id===form.serviceId);
  const selectedCustomerPets=petList.filter(p=>p.customerId===form.customerId);

  function petName(id?:string){return petList.find(p=>p.id===id)?.name??"Consumidor não identificado"}
  function professionalName(id:string){return professionalList.find(p=>p.id===id)?.name??"—"}

  function selectSlot(professionalId:string,time:string){setForm(current=>({...current,professionalId,time}));setMessage("")}

  function submitAppointment(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!form.professionalId||!form.time){setMessage("Selecione profissional e horário.");return}
    mutate.mutate({url:"/api/appointments",payload:{professionalId:form.professionalId,serviceId:form.serviceId||undefined,customerId:form.customerId||undefined,petId:form.petId||undefined,startsAt:isoAt(date,form.time),notes:form.notes||undefined}});
  }

  async function submitBlock(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!blockForm.reason.trim()){setMessage("Informe o motivo do bloqueio.");return}
    const targets=blockForm.professionalId?[blockForm.professionalId]:professionalList.map(p=>p.id);
    for(const professionalId of targets){
      try{await json("/api/appointments/blocks",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({professionalId,startsAt:isoAt(date,blockForm.startTime),endsAt:isoAt(date,blockForm.endTime),reason:blockForm.reason})})}
      catch(error){setMessage(error instanceof Error?error.message:"Falha ao bloquear.");return}
    }
    setMessage("Horário bloqueado.");
    client.invalidateQueries({queryKey:["appointments"]});
  }

  function cancelBlock(id:string){mutate.mutate({url:`/api/appointments/${id}`,method:"PATCH",payload:{status:"CANCELLED",reason:"Bloqueio removido"}})}
  function changeStatus(id:string,status:string){const reason=prompt("Motivo da alteração:");if(!reason)return;mutate.mutate({url:`/api/appointments/${id}`,method:"PATCH",payload:{status,reason}})}
  async function reminder(id:string){try{const data=await json(`/api/appointments/${id}/reminder`,{method:"POST"});window.open(data.whatsappUrl,"_blank","noopener,noreferrer");setMessage("Lembrete registrado e WhatsApp aberto.")}catch(e){setMessage(e instanceof Error?e.message:"Falha no lembrete.")}}
  function quick(event:FormEvent<HTMLFormElement>,url:string){event.preventDefault();mutate.mutate({url,payload:Object.fromEntries(new FormData(event.currentTarget))});event.currentTarget.reset()}

  return <>
    <header className="page-head"><div><span className="eyebrow">Serviços</span><h1 className="display">Banho e tosa</h1><p>Agenda por horário, bloqueios de profissional e lembretes.</p></div></header>

    <section className="card section-card" style={{display:"flex",flexWrap:"wrap",alignItems:"center",justifyContent:"space-between",gap:14}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <button className="icon-button" aria-label="Dia anterior" onClick={()=>setDate(d=>shiftDay(d,-1))}><ChevronLeft size={17}/></button>
        <input className="input" type="date" value={date} onChange={e=>setDate(e.target.value)} style={{width:"auto"}}/>
        <button className="icon-button" aria-label="Próximo dia" onClick={()=>setDate(d=>shiftDay(d,1))}><ChevronRight size={17}/></button>
        <button className="button button-ghost" onClick={()=>setDate(localDay())}>Hoje</button>
      </div>
      <div className="metrics" style={{margin:0}}>
        <div className="metric" style={{padding:0}}><div className="metric-top"><span>Agendamentos</span></div><div className="metric-value" style={{fontSize:"1.3rem"}}>{activeAppointments.length}</div></div>
        <div className="metric" style={{padding:0}}><div className="metric-top"><span>Previsto</span></div><div className="metric-value" style={{fontSize:"1.3rem"}}>{money(dayRevenue)}</div></div>
      </div>
    </section>

    <div className="grid-2" style={{marginTop:18,gridTemplateColumns:"290px minmax(0,1fr)"}}>
      <section className="card section-card">
        <div className="section-title"><h2>Calendário</h2></div>
        <div className="mini-calendar-grid">{["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map(d=><span key={d}>{d}</span>)}</div>
        <div className="mini-calendar-grid">{monthCells(month).map((day,index)=>{
          if(!day)return <span key={`e${index}`}/>;
          const count=allAppointments.filter(a=>a.status!=="CANCELLED"&&a.status!=="BLOCKED"&&dayKey(a.startsAt)===day).length;
          const blocked=allAppointments.some(a=>a.status==="BLOCKED"&&dayKey(a.startsAt)===day);
          return <button key={day} className={`mini-day${day===date?" active":""}`} onClick={()=>setDate(day)}>{Number(day.slice(-2))}{count||blocked?<span className="mini-day-dots">{count?<i/>:null}{blocked?<i className="danger-dot"/>:null}</span>:null}</button>;
        })}</div>
      </section>

      <section className="card section-card" style={{overflow:"hidden"}}>
        <div className="section-title"><h2>Horários</h2></div>
        <div className="table-wrap" style={{maxHeight:430}}>
          <table><thead><tr><th>Horário</th>{professionalList.map(p=><th key={p.id}>{p.name}</th>)}</tr></thead>
          <tbody>{SLOTS.map(time=>{
            const slotStart=new Date(isoAt(date,time));
            const slotEnd=new Date(slotStart.getTime()+30*60_000);
            return <tr key={time}><th>{time}</th>{professionalList.map(professional=>{
              const overlapping=activeAppointments.filter(a=>a.professionalId===professional.id&&new Date(a.startsAt)<slotEnd&&new Date(a.endsAt)>slotStart);
              const blocked=blocks.some(b=>b.professionalId===professional.id&&new Date(b.startsAt)<slotEnd&&new Date(b.endsAt)>slotStart);
              if(blocked)return <td key={professional.id} className="slot-blocked">Bloqueado</td>;
              if(overlapping.length>=professional.simultaneousCapacity)return <td key={professional.id} className="slot-full">Lotado</td>;
              if(overlapping.length)return <td key={professional.id} className="slot-busy"><button onClick={()=>selectSlot(professional.id,time)}>{petName(overlapping[0].petId)} · +vaga</button></td>;
              return <td key={professional.id} className="slot-free"><button onClick={()=>selectSlot(professional.id,time)}>Livre</button></td>;
            })}</tr>;
          })}</tbody></table>
        </div>
      </section>
    </div>

    {blocks.length?<section className="card section-card" style={{marginTop:18}}><div className="section-title"><h2>Bloqueios do dia</h2></div><div className="quick-list">{blocks.map(b=><div className="quick-item" key={b.id}><span className="quick-icon"><Ban size={16}/></span><div><strong>{new Date(b.startsAt).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}–{new Date(b.endsAt).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})} · {professionalName(b.professionalId)}</strong><span>{b.notes}</span></div><button className="button button-ghost" onClick={()=>cancelBlock(b.id)}>Remover</button></div>)}</div></section>:null}

    <div className="grid-2" style={{marginTop:18}}>
      <form className="card section-card module-form" onSubmit={submitAppointment}>
        <div className="section-title"><div><span className="eyebrow">Novo</span><h2>Agendar atendimento</h2></div></div>
        <div className="field"><label>Profissional</label><select className="input" value={form.professionalId} onChange={e=>setForm(c=>({...c,professionalId:e.target.value}))} required><option value="">Selecione…</option>{professionalList.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div className="field"><label>Serviço</label><select className="input" value={form.serviceId} onChange={e=>setForm(c=>({...c,serviceId:e.target.value}))}><option value="">Não informado</option>{services.data?.services.map(s=><option key={s.id} value={s.id}>{s.name} · {s.durationMinutes}min</option>)}</select></div>
        <div className="field"><label>Cliente</label><select className="input" value={form.customerId} onChange={e=>setForm(c=>({...c,customerId:e.target.value,petId:""}))}><option value="">Não informado</option>{customers.data?.customers.map(c=><option key={c.id} value={c.id}>{c.fullName}</option>)}</select></div>
        <div className="field"><label>Pet</label><select className="input" value={form.petId} onChange={e=>setForm(c=>({...c,petId:e.target.value}))} disabled={!form.customerId}><option value="">Não informado</option>{selectedCustomerPets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div className="field"><label>Horário</label><input className="input" type="time" value={form.time} onChange={e=>setForm(c=>({...c,time:e.target.value}))} required/></div>
        {selectedService?<p className="muted">Término previsto: {new Date(new Date(isoAt(date,form.time)).getTime()+selectedService.durationMinutes*60_000).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</p>:null}
        <div className="field"><label>Observações</label><input className="input" value={form.notes} onChange={e=>setForm(c=>({...c,notes:e.target.value}))}/></div>
        {message?<span className="pill">{message}</span>:null}
        <button className="button button-primary" disabled={mutate.isPending}>Agendar</button>
      </form>
      <form className="card section-card module-form" onSubmit={submitBlock}>
        <div className="section-title"><div><span className="eyebrow">Indisponibilidade</span><h2>Bloquear horário</h2></div></div>
        <div className="field"><label>Profissional</label><select className="input" value={blockForm.professionalId} onChange={e=>setBlockForm(c=>({...c,professionalId:e.target.value}))}><option value="">Todos os profissionais</option>{professionalList.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div className="form-row"><div className="field"><label>Início</label><input className="input" type="time" value={blockForm.startTime} onChange={e=>setBlockForm(c=>({...c,startTime:e.target.value}))}/></div><div className="field"><label>Fim</label><input className="input" type="time" value={blockForm.endTime} onChange={e=>setBlockForm(c=>({...c,endTime:e.target.value}))}/></div></div>
        <div className="field"><label>Motivo</label><input className="input" placeholder="Ex.: Almoço, folga" value={blockForm.reason} onChange={e=>setBlockForm(c=>({...c,reason:e.target.value}))}/></div>
        <button className="button button-ghost">Bloquear</button>
      </form>
    </div>

    <section className="card section-card" style={{marginTop:18}}>
      <div className="section-title"><h2>Atendimentos do dia</h2></div>
      <div className="agenda-list">{activeAppointments.length?activeAppointments.map(a=><article className="agenda-item" key={a.id}><time>{new Date(a.startsAt).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</time><div><strong>{petName(a.petId)}</strong><small>{professionalName(a.professionalId)} · {statusLabels[a.status]}</small></div><select aria-label="Alterar status" value={a.status} onChange={e=>changeStatus(a.id,e.target.value)}>{Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><button className="button button-ghost" onClick={()=>reminder(a.id)}>WhatsApp</button></article>):<div className="empty-state">Nenhum atendimento agendado para este dia.</div>}</div>
    </section>

    <div className="grid-2" style={{marginTop:18}}>
      <form className="card section-card module-form" onSubmit={e=>quick(e,"/api/grooming/professionals")}><h2>Novo profissional</h2><div className="field"><label>Nome</label><input className="input" name="name" required/></div><div className="field"><label>Comissão %</label><input className="input" name="commissionPercent" type="number" defaultValue="0"/></div><div className="field"><label>Capacidade simultânea</label><input className="input" name="simultaneousCapacity" type="number" min="1" defaultValue="1"/></div><button className="button button-ghost">Cadastrar profissional</button></form>
      <form className="card section-card module-form" onSubmit={e=>quick(e,"/api/grooming/services")}><h2>Novo serviço</h2><div className="field"><label>Nome</label><input className="input" name="name" required/></div><div className="field"><label>Duração em minutos</label><input className="input" name="durationMinutes" type="number" min="10" required/></div><div className="field"><label>Preço</label><input className="input" name="price" type="number" step="0.01" required/></div><div className="field"><label>Comissão %</label><input className="input" name="commissionPercent" type="number" defaultValue="0"/></div><button className="button button-ghost">Cadastrar serviço</button></form>
    </div>
  </>;
}
