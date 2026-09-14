"use client";
import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { useState } from "react";

export function SessionControls({branches,activeBranchId}:{branches?:Array<{id:string;name:string}>;activeBranchId?:string}){const [pending,setPending]=useState(false);async function change(branchId:string){setPending(true);const response=await fetch("/api/session/branch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({branchId})});setPending(false);if(response.ok)location.reload()}return <div style={{display:"flex",alignItems:"center",gap:8}}>{branches?.length?<select className="input" aria-label="Loja ativa" value={activeBranchId} disabled={pending} onChange={event=>change(event.target.value)} style={{minHeight:36,width:170}}>{branches.map(branch=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>:null}<button className="button button-ghost" aria-label="Sair" title="Sair" onClick={()=>signOut({callbackUrl:"/login"})} style={{minHeight:36,padding:"0 11px"}}><LogOut size={16}/></button></div>}
