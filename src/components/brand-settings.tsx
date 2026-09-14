"use client";
import { useState } from "react";
export function BrandSettings({logoUrl}:{logoUrl:string|null}){
  const [message,setMessage]=useState("");
  const [preview,setPreview]=useState(logoUrl??"");
  async function submit(formData:FormData){const value=String(formData.get("logoUrl")??"");const response=await fetch("/api/settings",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({logoUrl:value})});const data=await response.json();setMessage(response.ok?"Logotipo atualizado para esta empresa.":data.error)}
  return <form action={submit} className="section-card card"><div className="section-title"><div><span className="eyebrow">Identidade visual</span><h2>Logotipo</h2></div></div><div className="login-form">{preview?<div role="img" aria-label="Prévia do logotipo" style={{width:180,height:90,backgroundImage:`url(${JSON.stringify(preview)})`,backgroundSize:"contain",backgroundPosition:"left center",backgroundRepeat:"no-repeat"}}/>:null}<div className="field"><label>URL HTTPS da imagem</label><input className="input" name="logoUrl" type="url" defaultValue={logoUrl??""} onChange={event=>setPreview(event.target.value)} placeholder="https://..."/></div><small className="muted">Em produção, use o endereço gerado pelo armazenamento de arquivos contratado.</small><button className="button button-ghost">Salvar logotipo</button>{message?<span className="pill">{message}</span>:null}</div></form>;
}
