"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, LockKeyhole } from "lucide-react";

export function LoginForm() {
  const router=useRouter(); const params=useSearchParams(); const [pending,setPending]=useState(false); const [error,setError]=useState("");
  async function submit(formData:FormData){ setPending(true); setError(""); const workspace=String(formData.get("workspace")??""); const result=await signIn("credentials",{workspace,username:formData.get("username"),password:formData.get("password"),redirect:false}); if(result?.error){setError("Dados inválidos, usuário bloqueado ou empresa indisponível.");setPending(false);return} router.push(params.get("callbackUrl")??(workspace==="plataforma"?"/platform":"/app"));router.refresh(); }
  return <form className="login-form" action={submit}>
    <div className="field"><label htmlFor="workspace">Empresa</label><input className="input" id="workspace" name="workspace" placeholder="Ex.: pet-demo" autoComplete="organization" required /></div>
    <div className="field"><label htmlFor="username">Nome de usuário</label><input className="input" id="username" name="username" placeholder="seu.usuario" autoComplete="username" required /></div>
    <div className="field"><label htmlFor="password">Senha</label><input className="input" id="password" name="password" type="password" placeholder="Sua senha" autoComplete="current-password" required /></div>
    {error?<div className="error" role="alert">{error}</div>:null}<button className="button button-primary" disabled={pending} type="submit">{pending?"Entrando…":"Entrar com segurança"} {pending?<LockKeyhole size={16}/>:<ArrowRight size={17}/>}</button>
  </form>;
}
