import { useCallback, useEffect, useMemo, useState } from "react"
import { RotateCcw, Printer, FileMinus, Download, CheckCircle2, ShieldAlert } from "lucide-react"
import { useAuth } from "../../hooks/useAuth"
import { useLayout } from "../layout/LayoutContext"
import { useEscapeBack } from "../../hooks/useEscapeBack"
import { formatCurrency, formatTime } from "../../utils/format"
import { isPosApiError } from "../../services/pos-api"
import { localToday, shiftDate } from "../../services/reports"
import {
  creditNoteFor,
  downloadLibroIva,
  getFiscalConfig,
  getFiscalHealth,
  listFiscalDocuments,
  reprintFiscalDocument,
  retryFiscalDocument,
  resolveFiscalDocument,
  confirmFiscalPrinted,
  type FiscalConfig,
  type FiscalHealth,
  type ReviewAction,
  type PosFiscalDocument,
  type PosFiscalDocuments,
} from "../../services/fiscal"
import { FiscalHelpButton, FiscalHelpCenter } from "./FiscalHelpCenter"

// ============================================================================
// Contexto Facturación — factura electrónica en el POS (Fase L, 2026-10)
// ============================================================================
// «La factura electrónica es del POS» (hay comercios con POS y sin SaaS):
//   · comprobantes de la sede (Hoy · Ayer · 7 días) con estado, receptor y
//     total; totales facturado / notas de crédito / neto.
//   · acciones del comprobante en el Context Panel: Reintentar (pendiente o
//     rechazado), Reimprimir (autorizado), Nota de crédito (factura
//     autorizada sin NC; el cajero con PIN de encargado).
//   · Libro IVA del mes (CSV y Libro IVA Digital): encargado y admin (el
//     server lo exige; el botón se ofrece y, si no corresponde, avisa).
//   · Centro de ayuda siempre a mano.
//   · Orden 31/10: alertas fiscales de la sede (pendientes demorados, en
//     revisión, ventas cobradas sin comprobante, certificado, CAEA, tickets sin
//     impresión confirmada); estado de impresión SEPARADO del fiscal;
//     resolución controlada de lo que está «en revisión».
// ============================================================================

const PRINT_LABEL: Record<string, string> = {
  not_requested: "Sin imprimir",
  queued: "En cola",
  printing: "Imprimiendo",
  printed: "Enviado a la impresora",
  failed: "No se pudo imprimir",
  unknown: "Desconocido: verificá el papel",
}

/** Acciones de revisión que corresponden a cada motivo (el server lo vuelve a validar). */
const REVIEW_ACTIONS: Record<string, { action: ReviewAction; label: string; hint: string }[]> = {
  arca_number_mismatch: [
    { action: "retry_new_number", label: "Pedir otro número", hint: "El número reservado es de otro comprobante" },
    { action: "discard", label: "Descartar", hint: "La venta queda para facturar de nuevo" },
  ],
  environment_mismatch: [
    { action: "reissue", label: "Emitir con la configuración actual", hint: "Descarta este y emite uno nuevo" },
    { action: "discard", label: "Descartar", hint: "La venta queda sin factura" },
  ],
  cuit_mismatch: [
    { action: "reissue", label: "Emitir con el CUIT actual", hint: "Descarta este y emite uno nuevo" },
    { action: "discard", label: "Descartar", hint: "La venta queda sin factura" },
  ],
  missing_identity: [{ action: "reissue", label: "Emitir de nuevo", hint: "Con la configuración actual" }],
  caea_report_rejected: [{ action: "retry_caea_report", label: "Volver a informar a ARCA", hint: "Revisalo antes con el contador" }],
  number_taken_locally: [{ action: "discard", label: "Descartar", hint: "Solo si no tiene CAE propio: consultá al contador" }],
}

type Preset = "today" | "yesterday" | "week"

const STATUS_LABEL: Record<string, string> = {
  authorized: "Autorizado",
  pending: "Pendiente",
  retrying: "Reintentando",
  rejected: "Rechazado",
  needs_review: "En revisión",
}
const CONDITION_LABEL: Record<string, string> = {
  consumidor_final: "Consumidor final", responsable_inscripto: "Responsable inscripto", monotributo: "Monotributo", exento: "Exento", no_categorizado: "No categorizado",
}

function rangeFor(p: Preset) {
  const t = localToday()
  if (p === "yesterday") { const y = shiftDate(t, -1); return { from: y, to: y } }
  if (p === "week") return { from: shiftDate(t, -6), to: t }
  return { from: t, to: t }
}

export function FiscalDashboard() {
  const { state } = useAuth()
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined
  const { setContextPanel, setActionBar } = useLayout()
  const [config, setConfig] = useState<FiscalConfig | null>(null)
  const [preset, setPreset] = useState<Preset>("today")
  const [data, setData] = useState<PosFiscalDocuments | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [month, setMonth] = useState(() => localToday().slice(0, 7))
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  const [health, setHealth] = useState<FiscalHealth | null>(null)
  const range = useMemo(() => rangeFor(preset), [preset])
  // Esc: cierra el comprobante abierto (el centro de ayuda maneja su propio Esc).
  useEscapeBack(selectedId ? () => setSelectedId(null) : null)

  const flash = useCallback((kind: "success" | "error", text: string) => {
    setNotice({ kind, text })
    setTimeout(() => setNotice(null), 4500)
  }, [])

  const load = useCallback(async () => {
    if (!tenantId) return
    try {
      const [c, d, h] = await Promise.all([
        getFiscalConfig(tenantId),
        listFiscalDocuments(tenantId, range),
        getFiscalHealth(tenantId).catch(() => null),
      ])
      setConfig(c)
      setData(d)
      setHealth(h)
    } catch (err) {
      flash("error", err instanceof Error ? err.message : "No se pudieron cargar los comprobantes")
    }
  }, [tenantId, range, flash])

  useEffect(() => {
    const id = setTimeout(() => { void load() }, 0)
    // Mientras el contexto está abierto, se refresca (y el server aprovecha
    // para recuperar pendientes del comercio).
    const every = setInterval(() => { void load() }, 60_000)
    return () => {
      clearTimeout(id)
      clearInterval(every)
    }
  }, [load])

  const run = useCallback(async (op: () => Promise<string>) => {
    setBusy(true)
    try {
      flash("success", await op())
      await load()
    } catch (err) {
      if (!(isPosApiError(err) && err.code === "approval_cancelled")) flash("error", err instanceof Error ? err.message : "No se pudo completar la operación")
    } finally {
      setBusy(false)
    }
  }, [flash, load])

  const selected = data?.documents.find((d) => d.id === selectedId) ?? null

  useEffect(() => {
    if (!selected) {
      setContextPanel({
        title: "Facturación",
        subtitle: data ? `${data.environment === "homologation" ? "Modo pruebas · " : ""}${data.counts.authorized} autorizados` : "Cargando…",
        body: (
          <div className="sale-detail">
            {config && !config.enabled && (
              <div className="setup-error" role="note">
                La factura electrónica no está activa en este comercio. La configura el administrador (CUIT, certificado y punto de venta). Mientras tanto podés leer el centro de ayuda.
              </div>
            )}
            {health && health.alerts.length > 0 && (
              <div className="fiscal-alerts" role="status" aria-label="Alertas fiscales">
                {health.alerts.map((a) => (
                  <div key={a.code} className={a.level === "critical" ? "setup-error" : "sale-void-info"}>
                    <ShieldAlert size={14} aria-hidden /> {a.message}
                  </div>
                ))}
              </div>
            )}
            {data && (
              <div className="sale-kpis">
                <div><span>Facturado</span><strong>{formatCurrency(data.totals.invoicedCents)}</strong></div>
                <div><span>Notas de crédito</span><strong>{formatCurrency(data.totals.creditedCents)}</strong></div>
                <div><span>Neto</span><strong>{formatCurrency(data.totals.netCents)}</strong></div>
                <div><span>Pendientes</span><strong className={data.counts.pending ? "text-error" : ""}>{data.counts.pending}</strong></div>
                {data.counts.rejected > 0 && <div><span>Rechazados</span><strong className="text-error">{data.counts.rejected}</strong></div>}
              </div>
            )}
            <div className="sale-section-title">Libro IVA (encargado / admin)</div>
            <div className="fiscal-libro">
              <input type="month" value={month} max={localToday().slice(0, 7)} aria-label="Mes del Libro IVA" onChange={(e) => setMonth(e.target.value)} />
              <button className="btn btn-secondary btn-sm" disabled={busy || !tenantId} onClick={() => { void run(async () => { await downloadLibroIva(tenantId!, month, "csv"); return "Libro IVA descargado" }) }}>
                <Download size={14} aria-hidden /> CSV
              </button>
              <button className="btn btn-secondary btn-sm" disabled={busy || !tenantId} onClick={() => { void run(async () => { await downloadLibroIva(tenantId!, month, "lid-cbte"); await downloadLibroIva(tenantId!, month, "lid-alicuotas"); return "Libro IVA Digital descargado (2 archivos)" }) }}>
                <Download size={14} aria-hidden /> Libro IVA Digital
              </button>
            </div>
            <p className="text-sm text-muted">Tocá un comprobante para ver el detalle, reintentarlo, reimprimirlo o emitir la nota de crédito.</p>
          </div>
        ),
      })
      setActionBar({ right: <button className="btn btn-secondary" onClick={() => setShowHelp(true)}>Centro de ayuda</button> })
      return
    }

    const isInvoice = selected.kind === "invoice"
    const canRetry = selected.status !== "authorized" && selected.status !== "needs_review"
    const reviewActions = selected.status === "needs_review" ? (REVIEW_ACTIONS[selected.reviewCode ?? ""] ?? []) : []
    const printUncertain = selected.printStatus === "unknown" || selected.printStatus === "failed"
    const canCredit = isInvoice && selected.status === "authorized" && !selected.hasCreditNote
    setContextPanel({
      title: selected.label,
      subtitle: `${new Date(selected.issuedAt).toLocaleDateString("es-AR")} · ${formatTime(new Date(selected.issuedAt))} · ${formatCurrency(selected.totalCents)}`,
      body: (
        <div className="sale-detail">
          <div className="sale-tags">
            <span className={`fiscal-status fiscal-status--${selected.status}`}>{selected.authMode === "caea" && selected.status === "authorized" ? "Contingencia (CAEA)" : STATUS_LABEL[selected.status]}</span>
            {selected.environment === "homologation" && <span className="sale-voided">Pruebas</span>}
            {selected.hasCreditNote && <span className="sale-voided">Con nota de crédito</span>}
          </div>
          <dl className="sale-facts">
            <div><dt>Receptor</dt><dd>{selected.receiver.name || CONDITION_LABEL[selected.receiver.condition]}</dd></div>
            <div><dt>Condición</dt><dd>{CONDITION_LABEL[selected.receiver.condition] ?? selected.receiver.condition}</dd></div>
            {selected.receiver.docNumber && selected.receiver.docNumber !== "0" && <div><dt>Documento</dt><dd>{selected.receiver.docNumber}</dd></div>}
            <div><dt>Pedido</dt><dd>{selected.orderNumber ?? (selected.orderPosId ? `#${selected.orderPosId.slice(0, 6).toUpperCase()}` : "—")}</dd></div>
            {selected.cae && <div><dt>{selected.authMode === "caea" ? "CAEA" : "CAE"}</dt><dd>{selected.cae}</dd></div>}
            {selected.caeExpiresAt && <div><dt>Vence</dt><dd>{new Date(selected.caeExpiresAt).toLocaleDateString("es-AR")}</dd></div>}
            <div><dt>Impresión</dt><dd>{PRINT_LABEL[selected.printStatus ?? "not_requested"]}</dd></div>
            {selected.authMode === "caea" && selected.caeaReportStatus && selected.caeaReportStatus !== "not_applicable" && (
              <div><dt>Informe CAEA</dt><dd>{{ pending: "Pendiente de informar", informed: "Informado", rejected: "Rechazado por ARCA" }[selected.caeaReportStatus] ?? selected.caeaReportStatus}</dd></div>
            )}
          </dl>
          {selected.message && <div className={selected.status === "rejected" || selected.status === "needs_review" ? "setup-error" : "sale-void-info"}>{selected.message}</div>}
          {selected.qrUrl && <a className="text-sm" href={selected.qrUrl} target="_blank" rel="noreferrer">Verificar en ARCA (QR)</a>}
          <div className="sale-section-title">Acciones</div>
          <div className="fiscal-actions">
            {canRetry && (
              <button className="ctx-action ctx-action--amber" disabled={busy} onClick={() => { void run(async () => { const d = await retryFiscalDocument(tenantId!, selected.id); return d.status === "authorized" ? "Comprobante autorizado" : `Sigue ${STATUS_LABEL[d.status]?.toLowerCase()}` }) }}>
                <span className="ctx-action-icon"><RotateCcw size={20} aria-hidden /></span><span className="ctx-action-label">Reintentar</span>
              </button>
            )}
            {selected.status === "authorized" && (
              <button className="ctx-action ctx-action--teal" disabled={busy} onClick={() => { void run(async () => `Reimpresión enviada a ${await reprintFiscalDocument(tenantId!, selected.id)}`) }}>
                <span className="ctx-action-icon"><Printer size={20} aria-hidden /></span><span className="ctx-action-label">Reimprimir</span>
                {printUncertain && <span className="ctx-action-hint">Solo si NO salió</span>}
              </button>
            )}
            {printUncertain && (
              <button className="ctx-action ctx-action--teal" disabled={busy} onClick={() => { void run(async () => { await confirmFiscalPrinted(tenantId!, selected.id); return "Impresión confirmada" }) }}>
                <span className="ctx-action-icon"><CheckCircle2 size={20} aria-hidden /></span><span className="ctx-action-label">Salió bien</span><span className="ctx-action-hint">Confirmar el ticket</span>
              </button>
            )}
            {reviewActions.map((r) => (
              <button key={r.action} className="ctx-action ctx-action--amber" disabled={busy} onClick={() => { void run(async () => {
                const out = await resolveFiscalDocument(tenantId!, selected.id, r.action)
                const doc = out.replacement ?? out.document
                return doc.status === "authorized" ? `${doc.label} autorizado` : `Resuelto: ${STATUS_LABEL[doc.status]?.toLowerCase() ?? doc.status}`
              }) }}>
                <span className="ctx-action-icon"><ShieldAlert size={20} aria-hidden /></span><span className="ctx-action-label">{r.label}</span><span className="ctx-action-hint">{r.hint} · admin</span>
              </button>
            ))}
            {canCredit && (
              <button className="ctx-action ctx-action--red" disabled={busy} onClick={() => { void run(async () => { const d = await creditNoteFor(tenantId!, selected.id); return d.status === "authorized" ? `${d.label} emitida` : "Nota de crédito pendiente de ARCA" }) }}>
                <span className="ctx-action-icon"><FileMinus size={20} aria-hidden /></span><span className="ctx-action-label">Nota de crédito</span><span className="ctx-action-hint">PIN de encargado</span>
              </button>
            )}
          </div>
          <FiscalHelpButton topic={canCredit ? "nota-credito" : selected.status === "rejected" ? "estados" : "que-es"} label="¿Qué hago con este comprobante?" />
        </div>
      ),
    })
    setActionBar({ left: <button className="btn btn-ghost" onClick={() => setSelectedId(null)}>← Volver</button> })
  }, [selected, data, config, month, busy, tenantId, run, setContextPanel, setActionBar])

  return (
    <div className="workspace sales">
      <div className="sales-toolbar">
        <div className="sales-chips" role="group" aria-label="Período">
          {([["today", "Hoy"], ["yesterday", "Ayer"], ["week", "7 días"]] as [Preset, string][]).map(([p, label]) => (
            <button key={p} type="button" className={`sales-chip${preset === p ? " active" : ""}`} aria-pressed={preset === p} onClick={() => { setPreset(p); setSelectedId(null) }}>{label}</button>
          ))}
        </div>
        {data?.environment === "homologation" && <span className="sale-voided">Modo pruebas: sin validez fiscal</span>}
        <span style={{ flex: 1 }} />
        <FiscalHelpButton label="Centro de ayuda" />
      </div>

      <div className="sales-table" role="table" aria-label="Comprobantes">
        <div className="sales-row sales-row--head fiscal-row" role="row">
          <span role="columnheader">Hora</span>
          <span role="columnheader">Comprobante</span>
          <span role="columnheader">Receptor</span>
          <span role="columnheader">Estado</span>
          <span role="columnheader" className="sales-right">Total</span>
        </div>
        <div className="sales-rows fiscal-rows">
          {!data && <div className="loading-state"><span className="spinner" /> Cargando…</div>}
          {data && data.documents.length === 0 && (
            <div className="empty-state"><span className="empty-state-text">Sin comprobantes en este período</span></div>
          )}
          {data?.documents.map((d: PosFiscalDocument) => (
            <button key={d.id} type="button" role="row" aria-selected={selectedId === d.id}
              className={`sales-row fiscal-row${selectedId === d.id ? " selected" : ""}`}
              onClick={() => setSelectedId(selectedId === d.id ? null : d.id)}>
              <span role="cell" className="sales-time">{formatTime(new Date(d.issuedAt))}</span>
              <span role="cell" className="sales-title">{d.label}</span>
              <span role="cell" className="sales-items">{d.receiver.name || CONDITION_LABEL[d.receiver.condition]}</span>
              <span role="cell"><span className={`fiscal-status fiscal-status--${d.status}`}>{d.authMode === "caea" && d.status === "authorized" ? "CAEA" : STATUS_LABEL[d.status]}</span></span>
              <span role="cell" className="sales-right sale-money">{d.kind === "credit_note" ? "−" : ""}{formatCurrency(d.totalCents)}</span>
            </button>
          ))}
        </div>
      </div>

      {showHelp && <FiscalHelpCenter onClose={() => setShowHelp(false)} />}
      {notice && (
        <div className="toast-container">
          <div className={`toast ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}><span className="toast-message">{notice.text}</span></div>
        </div>
      )}
    </div>
  )
}
