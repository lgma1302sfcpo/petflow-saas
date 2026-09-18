import Link from "next/link";
import { PawPrint } from "lucide-react";

export default function NotFound() {
  return <main className="login-panel" style={{minHeight:"100vh"}}>
    <div className="login-box" style={{textAlign:"center"}}>
      <span className="brand-mark" style={{display:"inline-flex",marginBottom:18}}><PawPrint size={22}/></span>
      <span className="eyebrow">Página não encontrada</span>
      <h1 className="display" style={{fontSize:"2.4rem",margin:"12px 0 10px"}}>Esse endereço não existe.</h1>
      <p style={{color:"var(--muted)",marginBottom:26}}>Confira o link ou volte para o início.</p>
      <Link className="button button-primary" href="/login">Ir para o login</Link>
    </div>
  </main>;
}
