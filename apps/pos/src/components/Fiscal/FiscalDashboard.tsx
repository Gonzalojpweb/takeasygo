import { useCallback, useEffect, useMemo, useState } from "react"
import { RotateCcw, Printer, FileMinus, Download } from "lucide-react"
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
  listFiscalDocuments,
  reprintFiscalDocument,
  retryFiscalDocument,
  type FiscalConfig,
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
// ============================================================================

type Preset = "today" | "yesterday" | "week"

const STATUS_LABEL: Record<string, string> = { authorized: "Autorizado", pending: "Pendiente", retrying: "Reintentando", rejected: "Rechazado" }
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
      const [c, d] = await Promise.all([getFiscalConfig(tenantId), listFiscalDocuments(tenantId, range)])
      setConfig(c)
      setData(d)
    } catch (err) {
      flash("error", err instanceof Error ? err.message : "No se pudieron cargar los comprobantes")
    }
  }, [tenantId, range, flash])

  useEffect(() => {
    const id = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(id)
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
    const canRetry = selected.status !== "authorized"
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
          </dl>
          {selected.message && <div className={selected.status === "rejected" ? "setup-error" : "sale-void-info"}>{selected.message}</div>}
          {selected.qrUrl && <a className="text-sm" href={selected.qrUrl} target="_blank" rel="noreferrer">Verificar en ARCA (QR)</a>}
          <div className="sale-section-title">Acciones</div>
          <div className="fiscal-actions">
            {canRetry && (
              <button className="ctx-action ctx-action--amber" disabled={busy} onClick={() => { void run(async () => { const d = await retryFiscalDocument(tenantId!, selected.id); return d.status === "authorized" ? "Comprobante autorizado" : `Sigue ${STATUS_LABEL[d.status]?.toLowerCase()}` }) }}>
                <span className="ctx-action-icon"><RotateCcw size={20} aria-hidden /></span><span className="ctx-action-label">Reintentar</span>
              </button>
            )}
            {selected.status === "authorized" && (
              <button className="ctx-action ctx-action--teal" disabled={busy} onClick={() => { void run(async () => `Enviado a ${await reprintFiscalDocument(tenantId!, selected.id)}`) }}>
                <span className="ctx-action-icon"><Printer size={20} aria-hidden /></span><span className="ctx-action-label">Reimprimir</span>
              </button>
            )}
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
