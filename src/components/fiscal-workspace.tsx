"use client";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { FormEvent,useState } from "react";

type Config = {
  id: string; environment: "HOMOLOGATION" | "PRODUCTION"; providerType: "SANDBOX" | "DIRECT_SEFAZ_SP" | "NOT_CONFIGURED"; provider: string | null;
  legalName: string | null; cnpj: string | null; stateRegistration: string | null; street: string | null; number: string | null;
  district: string | null; city: string | null; cityCode: string | null; state: string | null; zipCode: string | null; taxRegime: string | null;
  enableNfe: boolean; enableNfce: boolean; directTransmissionEnabled: boolean; certificateExpiresAt: string | null;
  hasCertificate: boolean; hasCertificatePassword: boolean; certificateUsable: boolean;
} | null;

type Sequence = { id: string; type: "NFE" | "NFCE"; series: number; nextNumber: number; environment: string };
type FiscalDocument = { id: string; saleId: string; type: string; series: number; number: number; status: string; environment: string; accessKey: string | null; rejectionReason: string | null; hasXml: boolean; hasPdf: boolean; createdAt: string };
type PendingSale = { id: string; total: number; createdAt: string; fiscalPendingReason: string | null };

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Falha.");
  return data;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",").pop() ?? "");
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo do certificado."));
    reader.readAsDataURL(file);
  });
}

const statusLabel: Record<string, string> = { PROCESSING: "Processando", CONTINGENCY_PENDING: "Contingência pendente", AUTHORIZED: "Autorizada", REJECTED: "Rejeitada", CANCELLED: "Cancelada", ERROR: "Erro" };
const statusClass: Record<string, string> = { AUTHORIZED: "", PROCESSING: "status-dot--warning", CONTINGENCY_PENDING: "status-dot--warning", REJECTED: "status-dot--danger", ERROR: "status-dot--danger", CANCELLED: "status-dot--danger" };

export function FiscalWorkspace() {
  const client = useQueryClient();
  const [message, setMessage] = useState("");
  const [issueType, setIssueType] = useState<"NFE" | "NFCE">("NFCE");
  const [issueSeries, setIssueSeries] = useState(1);

  const query = useQuery<{ configuration: Config; sequences: Sequence[]; documents: FiscalDocument[]; sales: PendingSale[] }>({
    queryKey: ["fiscal"],
    queryFn: () => api("/api/fiscal"),
  });

  function invalidate() { client.invalidateQueries({ queryKey: ["fiscal"] }); }
  function report(promise: Promise<unknown>, success: string) {
    promise.then(() => { setMessage(success); invalidate(); }).catch((error) => setMessage(error instanceof Error ? error.message : "Falha."));
  }

  async function submitConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const certificateFile = form.get("certificateFile") as File | null;
    const payload: Record<string, unknown> = {
      environment: form.get("environment"), providerType: form.get("providerType"), legalName: form.get("legalName") || undefined,
      cnpj: form.get("cnpj") || undefined, stateRegistration: form.get("stateRegistration") || undefined, taxRegime: form.get("taxRegime") || undefined,
      street: form.get("street") || undefined, number: form.get("number") || undefined, district: form.get("district") || undefined,
      city: form.get("city") || undefined, cityCode: form.get("cityCode") || undefined, state: form.get("state") || undefined, zipCode: form.get("zipCode") || undefined,
      enableNfe: form.get("enableNfe") === "on", enableNfce: form.get("enableNfce") === "on", directTransmissionEnabled: form.get("directTransmissionEnabled") === "on",
      certificatePassword: form.get("certificatePassword") || undefined,
    };
    if (certificateFile && certificateFile.size > 0) {
      payload.certificateBase64 = await fileToBase64(certificateFile);
      payload.certificateName = certificateFile.name;
    }
    report(api("/api/fiscal", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }), "Configuração fiscal salva e auditada.");
  }

  function adjustSequence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = { type: form.get("type"), series: Number(form.get("series")), nextNumber: Number(form.get("nextNumber")) };
    report(api("/api/fiscal/sequences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }), "Numeração ajustada.");
  }

  function issue(saleId: string) {
    report(api("/api/fiscal/documents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ saleId, type: issueType, series: issueSeries }) }), "Emissão enviada.");
  }
  function dismiss(saleId: string) {
    const reason = prompt("Motivo para dispensar a pendência fiscal desta venda:");
    if (!reason) return;
    report(api(`/api/fiscal/pending/${saleId}/dismiss`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }) }), "Pendência dispensada.");
  }
  function queryDocument(id: string) {
    report(api(`/api/fiscal/documents/${id}/query`, { method: "POST" }), "Consulta concluída.");
  }
  function cancelDocument(id: string) {
    const reason = prompt("Motivo do cancelamento:");
    if (!reason) return;
    report(api(`/api/fiscal/documents/${id}/cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }) }), "Documento cancelado.");
  }
  function archiveDocument(id: string) {
    const reason = prompt("Motivo do arquivamento:");
    if (!reason) return;
    report(api(`/api/fiscal/documents/${id}/archive`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }) }), "Documento arquivado.");
  }
  function transmit(id: string) {
    report(api(`/api/fiscal/documents/${id}/transmit`, { method: "POST" }), "Retransmissão de contingência enviada.");
  }

  const configuration = query.data?.configuration ?? null;
  const documents = query.data?.documents ?? [];
  const sequences = query.data?.sequences ?? [];
  const pendingSales = query.data?.sales?.filter((sale) => sale.fiscalPendingReason) ?? [];

  return (
    <>
      <header className="page-head">
        <div>
          <span className="eyebrow">Módulo fiscal</span>
          <h1 className="display">Fiscal</h1>
          <p>Emissão direta de NF-e/NFC-e para a Secretaria da Fazenda de São Paulo, com simulador de homologação e numeração por loja.</p>
        </div>
        <span className="pill"><span className={`status-dot ${configuration?.environment === "PRODUCTION" ? "status-dot--danger" : ""}`} />Ambiente: {configuration?.environment === "PRODUCTION" ? "Produção" : "Homologação"}</span>
      </header>
      {message ? <p className="success">{message}</p> : null}
      <div className="grid-2">
        <div style={{ display: "grid", gap: 18 }}>
          <section className="card section-card">
            <div className="section-title"><h2>Documentos emitidos</h2></div>
            {documents.length ? (
              <div className="record-list">
                {documents.map((document) => (
                  <div className="record" key={document.id}>
                    <span><small>Documento</small><strong>{document.type} série {document.series} nº {document.number}</strong></span>
                    <span><small>Status</small><strong><span className={`status-dot ${statusClass[document.status] ?? ""}`} />{statusLabel[document.status] ?? document.status}</strong></span>
                    <span><small>Ambiente</small><strong>{document.environment === "PRODUCTION" ? "Produção" : "Homologação"}</strong></span>
                    <span><small>Emitida em</small><strong>{new Date(document.createdAt).toLocaleString("pt-BR")}</strong></span>
                    {document.rejectionReason ? <span><small>Motivo</small><strong>{document.rejectionReason}</strong></span> : null}
                    <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button className="button button-ghost" onClick={() => queryDocument(document.id)}>Consultar</button>
                      {document.status === "AUTHORIZED" ? <button className="button button-ghost" onClick={() => cancelDocument(document.id)}>Cancelar</button> : null}
                      {document.status === "CONTINGENCY_PENDING" ? <button className="button button-ghost" onClick={() => transmit(document.id)}>Retransmitir</button> : null}
                      {document.hasXml ? <a className="button button-ghost" href={`/api/fiscal/documents/${document.id}/artifacts/xml`}>XML</a> : null}
                      {document.hasPdf ? <a className="button button-ghost" href={`/api/fiscal/documents/${document.id}/artifacts/pdf`}>DANFE</a> : null}
                      {(document.status === "ERROR" || document.status === "REJECTED") ? <button className="button button-ghost" onClick={() => archiveDocument(document.id)}>Arquivar</button> : null}
                    </span>
                  </div>
                ))}
              </div>
            ) : <div className="empty-state">Nenhum documento fiscal emitido ainda.</div>}
          </section>

          <section className="card section-card">
            <div className="section-title"><h2>Vendas pendentes de emissão</h2></div>
            <div className="field" style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              <select className="input" style={{ maxWidth: 160 }} value={issueType} onChange={(event) => setIssueType(event.target.value as "NFE" | "NFCE")}>
                <option value="NFCE">NFC-e</option>
                <option value="NFE">NF-e</option>
              </select>
              <input className="input" style={{ maxWidth: 120 }} type="number" min={0} max={999} value={issueSeries} onChange={(event) => setIssueSeries(Number(event.target.value))} placeholder="Série" />
            </div>
            {pendingSales.length ? (
              <div className="record-list">
                {pendingSales.map((sale) => (
                  <div className="record" key={sale.id}>
                    <span><small>Venda</small><strong>{sale.id.slice(-8)}</strong></span>
                    <span><small>Total</small><strong>R$ {sale.total.toFixed(2)}</strong></span>
                    <span><small>Pendência</small><strong>{sale.fiscalPendingReason}</strong></span>
                    <span style={{ display: "flex", gap: 6 }}>
                      <button className="button button-primary" onClick={() => issue(sale.id)}>Emitir</button>
                      <button className="button button-ghost" onClick={() => dismiss(sale.id)}>Dispensar</button>
                    </span>
                  </div>
                ))}
              </div>
            ) : <div className="empty-state">Nenhuma venda com pendência fiscal.</div>}
          </section>
        </div>

        <div style={{ display: "grid", gap: 18 }}>
          <form className="card section-card module-form" onSubmit={submitConfig} key={configuration?.id ?? "new"} autoComplete="off">
            <h2>Configuração fiscal e certificado</h2>
            <div className="field"><label>Ambiente</label><select className="input" name="environment" defaultValue={configuration?.environment ?? "HOMOLOGATION"}><option value="HOMOLOGATION">Homologação</option><option value="PRODUCTION">Produção</option></select></div>
            <div className="field"><label>Forma de transmissão</label><select className="input" name="providerType" defaultValue={configuration?.providerType ?? "SANDBOX"}><option value="SANDBOX">Simulador de homologação</option><option value="DIRECT_SEFAZ_SP">Transmissão direta SEFAZ-SP</option><option value="NOT_CONFIGURED">Não configurado</option></select></div>
            <div className="field"><label>Razão social</label><input className="input" name="legalName" defaultValue={configuration?.legalName ?? ""} /></div>
            <div className="field"><label>CNPJ</label><input className="input" name="cnpj" defaultValue={configuration?.cnpj ?? ""} /></div>
            <div className="field"><label>Inscrição Estadual</label><input className="input" name="stateRegistration" defaultValue={configuration?.stateRegistration ?? ""} /></div>
            <div className="field"><label>Regime tributário</label><select className="input" name="taxRegime" defaultValue={configuration?.taxRegime ?? ""}><option value="">Selecione</option><option value="SIMPLES_NACIONAL">Simples Nacional</option><option value="MEI">MEI</option></select></div>
            <div className="field"><label>Logradouro</label><input className="input" name="street" defaultValue={configuration?.street ?? ""} /></div>
            <div className="field"><label>Número</label><input className="input" name="number" defaultValue={configuration?.number ?? ""} /></div>
            <div className="field"><label>Bairro</label><input className="input" name="district" defaultValue={configuration?.district ?? ""} /></div>
            <div className="field"><label>Município</label><input className="input" name="city" defaultValue={configuration?.city ?? ""} /></div>
            <div className="field"><label>Código do município (IBGE)</label><input className="input" name="cityCode" defaultValue={configuration?.cityCode ?? ""} /></div>
            <div className="field"><label>Estado</label><input className="input" name="state" maxLength={2} defaultValue={configuration?.state ?? ""} /></div>
            <div className="field"><label>CEP</label><input className="input" name="zipCode" autoComplete="postal-code" defaultValue={configuration?.zipCode ?? ""} /></div>
            <div className="field"><label>Certificado A1 (.pfx)</label><input className="input" type="file" name="certificateFile" accept=".pfx,.p12" /><small>{configuration?.hasCertificate ? `Certificado atual: ${configuration.certificateUsable ? "válido" : "inválido, envie novamente"}${configuration.certificateExpiresAt ? `, expira em ${new Date(configuration.certificateExpiresAt).toLocaleDateString("pt-BR")}` : ""}` : "Nenhum certificado enviado ainda."}</small></div>
            <div className="field"><label>Senha do certificado</label><input className="input" type="password" name="certificatePassword" autoComplete="new-password" placeholder={configuration?.hasCertificatePassword ? "Mantida (deixe em branco para não alterar)" : ""} /></div>
            <label><input type="checkbox" name="enableNfe" defaultChecked={configuration?.enableNfe} /> Habilitar NF-e</label>
            <label><input type="checkbox" name="enableNfce" defaultChecked={configuration?.enableNfce} /> Habilitar NFC-e</label>
            <label><input type="checkbox" name="directTransmissionEnabled" defaultChecked={configuration?.directTransmissionEnabled} /> Liberar conscientemente a transmissão direta em produção</label>
            <button className="button button-primary">Salvar configuração fiscal</button>
          </form>

          <section className="card section-card">
            <div className="section-title"><h2>Numeração por série</h2></div>
            <div className="record-list" style={{ marginBottom: 14 }}>
              {sequences.map((sequence) => (
                <div className="record" key={sequence.id}>
                  <span><small>Tipo</small><strong>{sequence.type}</strong></span>
                  <span><small>Série</small><strong>{sequence.series}</strong></span>
                  <span><small>Próximo número</small><strong>{sequence.nextNumber}</strong></span>
                </div>
              ))}
              {!sequences.length ? <div className="empty-state">Nenhuma série iniciada ainda.</div> : null}
            </div>
            <form className="module-form" onSubmit={adjustSequence}>
              <div className="field"><label>Tipo</label><select className="input" name="type"><option value="NFCE">NFC-e</option><option value="NFE">NF-e</option></select></div>
              <div className="field"><label>Série</label><input className="input" type="number" name="series" min={0} max={999} defaultValue={1} /></div>
              <div className="field"><label>Próximo número</label><input className="input" type="number" name="nextNumber" min={1} max={999999999} /></div>
              <button className="button button-ghost">Ajustar numeração</button>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
