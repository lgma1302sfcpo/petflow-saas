"use client";

import Link from "next/link";
import { useCallback,useEffect,useRef,useState } from "react";
import { Minus,Plus,RefreshCw,Search,WifiOff } from "lucide-react";
import { getCatalog,getPendingSales,removePendingSale,saveCatalog,savePendingSale,type OfflineProduct,type OfflineSalePayload,type PendingOfflineSale } from "@/lib/offline-sales";

type Props={tenantId:string;branchId:string;branchName:string;userId:string};
type Line={product:OfflineProduct;quantity:number;chargedAmount:string};
type Settings={acceptedPaymentMethods:string[]};

async function json(url:string,init?:RequestInit){const response=await fetch(url,init);const data=await response.json();if(!response.ok)throw new Error(data.error??"Falha na operação.");return data}
const money=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;

export function OfflineSalesWorkspace({tenantId,branchId,branchName,userId}:Props){
  const scope=`${tenantId}:${branchId}:${userId}`;
  const [products,setProducts]=useState<OfflineProduct[]>([]);
  const [catalogAt,setCatalogAt]=useState<string|null>(null);
  const [cashSessionId,setCashSessionId]=useState<string|null>(null);
  const [pending,setPending]=useState<PendingOfflineSale[]>([]);
  const [online,setOnline]=useState(()=>typeof navigator==="undefined"||navigator.onLine);
  const [loading,setLoading]=useState(false);
  const [syncing,setSyncing]=useState(false);
  const [search,setSearch]=useState("");
  const [cart,setCart]=useState<Line[]>([]);
  const [payment,setPayment]=useState("");
  const [paymentConfirmed,setPaymentConfirmed]=useState(false);
  const [settings,setSettings]=useState<Settings|null>(null);
  const [message,setMessage]=useState("");
  const syncLock=useRef(false);
  const total=money(cart.reduce((sum,line)=>sum+(line.product.bulkSale&&line.chargedAmount?Number(line.chargedAmount):Number(line.product.salePrice)*line.quantity),0));
  const methods=settings?.acceptedPaymentMethods?.length?settings.acceptedPaymentMethods:["PIX","DINHEIRO","DEBITO","CREDITO"];

  const reloadPending=useCallback(async()=>setPending(await getPendingSales(scope)),[scope]);

  const refreshCatalog=useCallback(async()=>{
    if(!navigator.onLine)return;
    setLoading(true);
    try{
      const [catalog,settingsResponse]=await Promise.all([json("/api/sales/offline-catalog"),json("/api/settings")]);
      const updatedAt=new Date().toISOString();
      await saveCatalog({scope,updatedAt,cashSessionId:catalog.cashSessionId??null,products:catalog.products??[]});
      setProducts(catalog.products??[]);
      setCatalogAt(updatedAt);
      setCashSessionId(catalog.cashSessionId??null);
      setSettings(settingsResponse.settings);
      setMessage(catalog.cashSessionId?`Produtos disponíveis offline: ${catalog.products.length}. Caixa preparado para esta loja.`:"Produtos atualizados. Abra o caixa antes de preparar vendas offline.");
    }catch{
      setMessage("Não foi possível atualizar os produtos. A cópia anterior continua disponível.");
    }finally{setLoading(false)}
  },[scope]);

  const synchronize=useCallback(async()=>{
    if(syncLock.current||!navigator.onLine)return;
    syncLock.current=true;setSyncing(true);
    try{
      const sales=await getPendingSales(scope);
      for(const sale of sales){
        try{
          const response=await json("/api/sales",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(sale.payload)});
          await removePendingSale(sale.id);
          setMessage(`Venda ${sale.id.slice(0,8)} sincronizada${response.replayed?" (já processada anteriormente)":""}.`);
        }catch(error){
          const detail=error instanceof Error?error.message:"Falha na sincronização.";
          await savePendingSale({...sale,status:"ERROR",error:detail});
          if(!navigator.onLine)break;
        }
      }
      await reloadPending();
    }finally{syncLock.current=false;setSyncing(false)}
  },[scope,reloadPending]);

  /* eslint-disable react-hooks/set-state-in-effect -- syncs local state from IndexedDB and browser online/offline APIs, external systems outside React */
  useEffect(()=>{
    let active=true;
    void getCatalog(scope).then(catalog=>{
      if(active&&catalog){setProducts(catalog.products);setCatalogAt(catalog.updatedAt);setCashSessionId(catalog.cashSessionId??null)}
    }).finally(()=>{if(active)void refreshCatalog()});
    void reloadPending();
    if(navigator.onLine)void synchronize();
    if(navigator.onLine&&"serviceWorker" in navigator){
      const prepare=()=>{
        const resources=Array.from(document.querySelectorAll<HTMLScriptElement|HTMLLinkElement>("script[src], link[href]"))
          .map(element=>element instanceof HTMLScriptElement?element.src:element.href)
          .filter(url=>url.startsWith(`${window.location.origin}/_next/static/`))
          .map(url=>new URL(url).pathname);
        void navigator.serviceWorker.ready.then(registration=>registration.active?.postMessage({type:"PREPARE_OFFLINE_SALES",resources}));
      };
      prepare();
    }
    const onOnline=()=>{setOnline(true);void refreshCatalog();void synchronize()};
    const onOffline=()=>setOnline(false);
    window.addEventListener("online",onOnline);
    window.addEventListener("offline",onOffline);
    const retryTimer=window.setInterval(()=>{if(navigator.onLine)void synchronize()},30_000);
    return()=>{active=false;window.clearInterval(retryTimer);window.removeEventListener("online",onOnline);window.removeEventListener("offline",onOffline)};
  },[scope,reloadPending,refreshCatalog,synchronize]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function saveSale(){
    setMessage("");
    if(!catalogAt||!cart.length){setMessage("Atualize os produtos e inclua pelo menos um item.");return}
    if(!cashSessionId){setMessage("Abra o caixa enquanto houver conexão e atualize os produtos antes de vender offline.");return}
    if(!payment){setMessage("Selecione a forma de pagamento.");return}
    if(payment!=="DINHEIRO"&&!paymentConfirmed){setMessage("Confirme que o pagamento foi recebido antes de registrar a venda.");return}
    const idempotencyKey=crypto.randomUUID();
    const payload:OfflineSalePayload={
      idempotencyKey,customerId:null,discount:"0",
      items:cart.map(line=>({productId:line.product.id,quantity:line.product.bulkSale&&line.chargedAmount?undefined:String(line.quantity),chargedAmount:line.product.bulkSale&&line.chargedAmount?line.chargedAmount:undefined,discount:"0"})),
      payments:[{method:payment,amount:total.toFixed(2)}],
    };
    try{
      await savePendingSale({id:idempotencyKey,scope,createdAt:new Date().toISOString(),total,payload,status:"PENDING"});
      await reloadPending();
      setCart([]);setPayment("");setPaymentConfirmed(false);
      setMessage(`Venda salva neste computador como pendente (${idempotencyKey.slice(0,8)}). Ainda não entrou no caixa, estoque ou fiscal da loja.`);
      if(navigator.onLine)void synchronize();
    }catch{setMessage("Não foi possível guardar a venda neste computador. Não entregue a venda como registrada.")}
  }

  function add(product:OfflineProduct){setCart(lines=>{const current=lines.find(line=>line.product.id===product.id);return current?lines.map(line=>line.product.id===product.id?{...line,quantity:line.quantity+1}:line):[...lines,{product,quantity:1,chargedAmount:""}]})}
  const matches=products.filter(product=>`${product.name} ${product.internalCode} ${product.sku??""} ${product.barcode??""}`.toLowerCase().includes(search.toLowerCase())).slice(0,40);

  return <>
    <header className="page-head"><div><span className="eyebrow"><WifiOff size={14}/> Vendas offline</span><h1 className="display">Loja: {branchName}</h1><p>As vendas deste computador ficam guardadas localmente até a conexão voltar.</p></div><Link className="button button-ghost" href="/app/vendas">Venda normal</Link></header>
    <section className="card section-card" style={{display:"flex",flexWrap:"wrap",alignItems:"center",justifyContent:"space-between",gap:14}}>
      <div><strong>{online?"Rede detectada":"Sem conexão"}</strong><p className="muted" style={{margin:"4px 0 0"}}>Produtos atualizados: {catalogAt?new Date(catalogAt).toLocaleString("pt-BR"):"ainda não preparados"} · Caixa: {cashSessionId?cashSessionId.slice(0,8):"não preparado"}</p></div>
      <div style={{display:"flex",gap:10}}><button className="button button-ghost" disabled={loading||!online} onClick={()=>void refreshCatalog()}><RefreshCw size={16}/> Atualizar produtos</button><button className="button button-primary" disabled={syncing||!online||!pending.length} onClick={()=>void synchronize()}><RefreshCw size={16}/> {syncing?"Sincronizando…":"Sincronizar agora"}</button></div>
    </section>
    <div className="pdv-grid" style={{marginTop:18}}>
      <section className="card section-card">
        <div className="search-box"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome, código, SKU ou código de barras" aria-label="Buscar produto" disabled={!catalogAt}/></div>
        {search?<div className="product-results">{matches.map(product=><button className="product-result" key={product.id} onClick={()=>{add(product);setSearch("")}}><span><strong>{product.name}</strong><small>{product.internalCode} · {product.unit}{product.bulkSale?" · granel":""}</small></span><b>R$ {Number(product.salePrice).toFixed(2)}</b><Plus size={17}/></button>)}{!matches.length?<p className="muted" style={{padding:12}}>Nenhum produto encontrado.</p>:null}</div>:null}
        <div className="section-title" style={{marginTop:22}}><h2>Carrinho</h2></div>
        {cart.length?<div className="cart-list">{cart.map(line=><article className="cart-line" key={line.product.id}><div><strong>{line.product.name}</strong><small>R$ {Number(line.product.salePrice).toFixed(2)} / {line.product.unit}</small></div>{line.product.bulkSale?<><label>Kg<input type="number" min="0.001" step="0.001" value={line.quantity} onChange={e=>setCart(rows=>rows.map(row=>row.product.id===line.product.id?{...row,quantity:Number(e.target.value)}:row))}/></label><label>Ou valor R$<input type="number" min="0.01" step="0.01" value={line.chargedAmount} onChange={e=>setCart(rows=>rows.map(row=>row.product.id===line.product.id?{...row,chargedAmount:e.target.value}:row))}/></label></>:<div className="qty"><button onClick={()=>setCart(rows=>rows.map(row=>row.product.id===line.product.id?{...row,quantity:Math.max(1,row.quantity-1)}:row))}><Minus size={15}/></button><b>{line.quantity}</b><button onClick={()=>setCart(rows=>rows.map(row=>row.product.id===line.product.id?{...row,quantity:row.quantity+1}:row))}><Plus size={15}/></button></div>}<button className="icon-button danger" aria-label={`Remover ${line.product.name}`} onClick={()=>setCart(rows=>rows.filter(row=>row.product.id!==line.product.id))}>×</button></article>)}</div>:<div className="empty-state">Busque um produto para começar.</div>}
      </section>
      <aside className="card section-card checkout">
        <div className="section-title"><h2>Pagamento</h2></div>
        <div className="field"><label>Forma de pagamento</label><select className="input" value={payment} onChange={e=>{setPayment(e.target.value);setPaymentConfirmed(false)}}><option value="">Selecione…</option>{methods.map(method=><option key={method} value={method}>{method}</option>)}</select></div>
        {payment&&payment!=="DINHEIRO"?<label style={{display:"flex",gap:8,alignItems:"flex-start",fontSize:".82rem",padding:12,border:"1px dashed #d8c48a",borderRadius:10,background:"#fbf3df"}}><input type="checkbox" checked={paymentConfirmed} onChange={e=>setPaymentConfirmed(e.target.checked)}/>Confirmo que recebi o pagamento (Pix aprovado ou cartão aprovado na maquininha). O sistema não verifica isso sem internet.</label>:null}
        <div className="checkout-total"><span>Total</span><strong>R$ {total.toFixed(2)}</strong></div>
        {message?<p className={message.includes("sincronizada")||message.includes("salva neste")?"success":"error"}>{message}</p>:null}
        <button className="button button-primary" disabled={!catalogAt||!cashSessionId||!cart.length||!payment||(payment!=="DINHEIRO"&&!paymentConfirmed)} onClick={()=>void saveSale()}>Salvar como pendente</button>
      </aside>
    </div>
    <section className="card section-card" style={{marginTop:18}}>
      <div className="section-title"><h2>Pendentes neste computador ({pending.length})</h2></div>
      <div className="record-list">{pending.map(sale=><article className="record" key={sale.id}><span><small>Venda</small><strong>{sale.id.slice(0,8)}</strong></span><span><small>Total</small><strong>R$ {sale.total.toFixed(2)}</strong></span><span><small>Status</small><strong className={sale.status==="ERROR"?"status-cancelled":"status-pending"} style={{padding:"3px 8px",borderRadius:999,fontSize:".68rem",textTransform:"uppercase",fontWeight:800}}>{sale.status==="ERROR"?"Erro":"Pendente"}</strong></span><span><small>Registrada</small><strong>{new Date(sale.createdAt).toLocaleString("pt-BR")}</strong></span>{sale.error?<span><small>Detalhe</small><strong>{sale.error}</strong></span>:null}</article>)}{!pending.length?<div className="empty-state">Nenhuma venda aguardando sincronização.</div>:null}</div>
    </section>
    <p className="muted" style={{marginTop:14,fontSize:".76rem"}}>A venda só atualiza caixa, estoque e financeiro depois da confirmação do servidor. Este registro local não é um documento fiscal.</p>
  </>;
}
