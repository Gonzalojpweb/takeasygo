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
  getControllerReports,
  requestControllerReport,
  listControllerDocuments,
  actOnControllerDocument,
  controllerDocumentLabel,
  CONTROLLER_ACTIVE,
  listUnbilledOrders,
  invoiceOrder,
  defaultInvoiceChoice,
  isInvoiceChoiceValid,
  listFiscalDocuments,
  reprintFiscalDocument,
  retryFiscalDocument,
  resolveFiscalDocument,
  confirmFiscalPrinted,
  type FiscalConfig,
  type FiscalHealth,
  type ControllerReports,
  type ControllerDocument,
  type ControllerDocuments,
  type UnbilledOrder,
  type InvoiceChoice,
  type ReviewAction,
  type PosFiscalDocument,
  type PosFiscalDocuments,
} from "../../services/fiscal"
import { FiscalHelpButton, FiscalHelpCenter } from "./FiscalHelpCenter"
import { InvoicePicker } from "../shared/InvoicePicker"

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

const REPORT_NAME = {
  x: "Salida de cajero (X)",
  z: "Cierre Z",
  ctd: "Cinta Testigo Digital",
  duplicates: "Duplicados de comprobantes A",
  totals: "Resumen de Totales",
} as const

const REPORT_STATUS: Record<string, string> = {
  pending: "Esperando al agente de impresión",
  claimed: "Enviando a la impresora fiscal",
  sending: "Imprimiendo",
  confirmed: "Hecho",
  failed: "No se hizo",
  unknown: "Resultado desconocido",
  driver_unavailable: "No se pudo hablar con el equipo",
  cancelled: "Cancelado",
}

const REPORT_ACTIVE = new Set(["pending", "claimed", "sending"])

const CONTROLLER_STATUS: Record<ControllerDocument["status"], { label: string; tone: string }> = {
  pending: { label: "Esperando al agente", tone: "pending" },
  claimed: { label: "Enviando", tone: "pending" },
  sending: { label: "Imprimiendo", tone: "pending" },
  confirmed: { label: "Emitido", tone: "authorized" },
  failed: { label: "No salió", tone: "rejected" },
  expired: { label: "No salió a tiempo", tone: "rejected" },
  driver_unavailable: { label: "Sin conexión al equipo", tone: "rejected" },
  unknown: { label: "A verificar", tone: "needs_review" },
  cancelled: { label: "Frenado", tone: "retrying" },
}

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
  const [controller, setController] = useState<ControllerReports | null>(null)
  const [confirmZ, setConfirmZ] = useState(false)
  const [printerDocs, setPrinterDocs] = useState<ControllerDocuments | null>(null)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [resolvedNumber, setResolvedNumber] = useState("")
  const [unbilled, setUnbilled] = useState<UnbilledOrder[]>([])
  const [selectedUnbilledId, setSelectedUnbilledId] = useState<string | null>(null)
  const [unbilledChoice, setUnbilledChoice] = useState<InvoiceChoice | null>(null)
  const range = useMemo(() => rangeFor(preset), [preset])
  // Esc: cierra el comprobante abierto (el centro de ayuda maneja su propio Esc).
  useEscapeBack(selectedId ? () => setSelectedId(null) : selectedJobId ? () => setSelectedJobId(null) : selectedUnbilledId ? () => setSelectedUnbilledId(null) : null)

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
      const reports = await getControllerReports(tenantId).catch(() => null)
      setController(reports)
      setPrinterDocs(reports?.modality === "controller" ? await listControllerDocuments(tenantId, range).catch(() => null) : null)
      setUnbilled(await listUnbilledOrders(tenantId).catch(() => []))
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
  const selectedJob = printerDocs?.documents.find((d) => d.id === selectedJobId) ?? null
  const isPrinter = controller?.modality === "controller"
  const selectedUnbilled = unbilled.find((o) => o.posId === selectedUnbilledId) ?? null

  // Con un comprobante en camino se consulta seguido: el resultado lo da el equipo.
  const printerActive = Boolean(printerDocs?.documents.some((d) => CONTROLLER_ACTIVE.has(d.status)))
  useEffect(() => {
    if (!tenantId || !printerActive) return
    const id = setInterval(() => {
      void listControllerDocuments(tenantId, range).then(setPrinterDocs).catch(() => undefined)
    }, 3000)
    return () => clearInterval(id)
  }, [tenantId, printerActive, range])

  // Con un informe en curso se consulta seguido: lo ejecuta el agente de la caja.
  const reportActive = Boolean(controller?.reports.some((r) => REPORT_ACTIVE.has(r.status)))
  useEffect(() => {
    if (!tenantId || !reportActive) return
    const id = setInterval(() => {
      void getControllerReports(tenantId).then(setController).catch(() => undefined)
    }, 3000)
    return () => clearInterval(id)
  }, [tenantId, reportActive])

  const askReport = useCallback((kind: "x" | "z") => {
    setConfirmZ(false)
    void run(async () => {
      await requestControllerReport(tenantId!, kind, crypto.randomUUID())
      return `${REPORT_NAME[kind]} enviado a la impresora fiscal`
    })
  }, [run, tenantId])

  useEffect(() => {
    if (selectedUnbilled && config && unbilledChoice) {
      const order = selectedUnbilled
      // Ya se decidió emitir: el selector no ofrece «Sin factura».
      const pickerConfig: FiscalConfig = { ...config, mode: "always" }
      setContextPanel({
        title: "Emitir comprobante",
        subtitle: `${order.orderNumber ?? `#${order.posId.slice(0, 6).toUpperCase()}`} · ${formatCurrency(order.totalCents)}`,
        body: (
          <div className="sale-detail">
            {order.failureMessage && <div className="setup-error" role="note">Falló al cobrar: {order.failureMessage}</div>}
            <InvoicePicker config={pickerConfig} value={unbilledChoice} onChange={setUnbilledChoice} />
            <div className="fiscal-actions">
              <button className="ctx-action ctx-action--teal" disabled={busy || !isInvoiceChoiceValid(unbilledChoice, config)} onClick={() => { void run(async () => {
                const doc = await invoiceOrder(tenantId!, order.posId, unbilledChoice)
                setSelectedUnbilledId(null)
                return doc.channel === "controller" ? "Enviado a la impresora fiscal" : doc.status === "authorized" ? `${doc.label} autorizado` : "Comprobante pendiente"
              }) }}>
                <span className="ctx-action-icon"><Printer size={20} aria-hidden /></span><span className="ctx-action-label">Emitir comprobante</span>
              </button>
            </div>
          </div>
        ),
      })
      setActionBar({ left: <button className="btn btn-ghost" onClick={() => setSelectedUnbilledId(null)}>← Volver</button> })
      return
    }

    if (selectedJob) {
      const st = CONTROLLER_STATUS[selectedJob.status]
      const canRetry = selectedJob.status === "failed" || selectedJob.status === "expired" || selectedJob.status === "driver_unavailable"
      const canRetryNow = canRetry && (selectedJob.kind === "credit_note" || !selectedJob.orderCancelled)
      const canCredit = selectedJob.kind === "invoice" && selectedJob.status === "confirmed" && !selectedJob.hasCreditNote
      const number = Number(resolvedNumber)
      setContextPanel({
        title: controllerDocumentLabel(selectedJob),
        subtitle: `${new Date(selectedJob.createdAt).toLocaleDateString("es-AR")} · ${formatTime(new Date(selectedJob.createdAt))} · ${formatCurrency(selectedJob.totalCents)}`,
        body: (
          <div className="sale-detail">
            <div className="sale-tags">
              <span className={`fiscal-status fiscal-status--${st.tone}`}>{st.label}</span>
              {selectedJob.training && <span className="sale-voided">Entrenamiento: sin validez fiscal</span>}
              {selectedJob.orderCancelled && <span className="sale-voided">Venta anulada</span>}
              {selectedJob.hasCreditNote && selectedJob.kind === "invoice" && <span className="sale-voided">Con nota de crédito</span>}
            </div>
            <dl className="sale-facts">
              <div><dt>Receptor</dt><dd>{selectedJob.receiver.name || CONDITION_LABEL[selectedJob.receiver.condition]}</dd></div>
              {selectedJob.receiver.docNumber !== "0" && <div><dt>Documento</dt><dd>{selectedJob.receiver.docNumber}</dd></div>}
              <div><dt>Pedido</dt><dd>{selectedJob.orderNumber ?? (selectedJob.orderPosId ? `#${selectedJob.orderPosId.slice(0, 6).toUpperCase()}` : "—")}</dd></div>
              {selectedJob.pointOfSale && <div><dt>Punto de venta</dt><dd>{selectedJob.pointOfSale}</dd></div>}
            </dl>
            {selectedJob.message && <div className={st.tone === "authorized" || st.tone === "retrying" ? "sale-void-info" : "setup-error"}>{selectedJob.message}</div>}
            {selectedJob.status === "unknown" && (
              <>
                <div className="sale-section-title">Mirá el papel y el equipo</div>
                <div className="setup-error" role="note">El sistema no sabe si salió y no lo vuelve a emitir solo. Si salió, cargá el número impreso.</div>
                <input className="search-input" inputMode="numeric" placeholder="Número impreso" aria-label="Número impreso en el comprobante" value={resolvedNumber} onChange={(e) => setResolvedNumber(e.target.value.replace(/\D/g, "").slice(0, 8))} />
                <div className="fiscal-actions">
                  <button className="ctx-action ctx-action--teal" disabled={busy || !number} onClick={() => { void run(async () => { await actOnControllerDocument(tenantId!, selectedJob.id, { action: "resolve", emitted: true, number }); setResolvedNumber(""); return "Comprobante registrado como emitido" }) }}>
                    <span className="ctx-action-icon"><CheckCircle2 size={20} aria-hidden /></span><span className="ctx-action-label">Salió</span><span className="ctx-action-hint">PIN de encargado</span>
                  </button>
                  <button className="ctx-action ctx-action--amber" disabled={busy} onClick={() => { void run(async () => { await actOnControllerDocument(tenantId!, selectedJob.id, { action: "resolve", emitted: false }); return "Registrado como no emitido: ya se puede reintentar" }) }}>
                    <span className="ctx-action-icon"><ShieldAlert size={20} aria-hidden /></span><span className="ctx-action-label">No salió</span><span className="ctx-action-hint">PIN de encargado</span>
                  </button>
                </div>
              </>
            )}
            {(canRetryNow || canCredit) && <div className="sale-section-title">Acciones</div>}
            <div className="fiscal-actions">
              {canRetryNow && (
                <button className="ctx-action ctx-action--amber" disabled={busy} onClick={() => { void run(async () => { await actOnControllerDocument(tenantId!, selectedJob.id, { action: "retry" }); return "Enviado de nuevo a la impresora fiscal" }) }}>
                  <span className="ctx-action-icon"><RotateCcw size={20} aria-hidden /></span><span className="ctx-action-label">Reintentar</span><span className="ctx-action-hint">Se sabe que no salió</span>
                </button>
              )}
              {canCredit && (
                <button className="ctx-action ctx-action--red" disabled={busy} onClick={() => { void run(async () => { await actOnControllerDocument(tenantId!, selectedJob.id, { action: "credit_note" }); return "Nota de crédito enviada a la impresora fiscal" }) }}>
                  <span className="ctx-action-icon"><FileMinus size={20} aria-hidden /></span><span className="ctx-action-label">Nota de crédito</span><span className="ctx-action-hint">PIN de encargado</span>
                </button>
              )}
            </div>
          </div>
        ),
      })
      setActionBar({ left: <button className="btn btn-ghost" onClick={() => setSelectedJobId(null)}>← Volver</button> })
      return
    }

    if (!selected) {
      setContextPanel({
        title: "Facturación",
        subtitle: isPrinter
          ? `${printerDocs?.counts.confirmed ?? 0} emitidos en la impresora fiscal`
          : data ? `${data.environment === "homologation" ? "Modo pruebas · " : ""}${data.counts.authorized} autorizados` : "Cargando…",
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
            {isPrinter && printerDocs && (
              <div className="sale-kpis">
                <div><span>Emitido</span><strong>{formatCurrency(printerDocs.totals.invoicedCents)}</strong></div>
                <div><span>Notas de crédito</span><strong>{formatCurrency(printerDocs.totals.creditedCents)}</strong></div>
                <div><span>Neto</span><strong>{formatCurrency(printerDocs.totals.netCents)}</strong></div>
                <div><span>En camino</span><strong>{printerDocs.counts.pending}</strong></div>
                {printerDocs.counts.attention > 0 && <div><span>A revisar</span><strong className="text-error">{printerDocs.counts.attention}</strong></div>}
              </div>
            )}
            {data && !isPrinter && (
              <div className="sale-kpis">
                <div><span>Facturado</span><strong>{formatCurrency(data.totals.invoicedCents)}</strong></div>
                <div><span>Notas de crédito</span><strong>{formatCurrency(data.totals.creditedCents)}</strong></div>
                <div><span>Neto</span><strong>{formatCurrency(data.totals.netCents)}</strong></div>
                <div><span>Pendientes</span><strong className={data.counts.pending ? "text-error" : ""}>{data.counts.pending}</strong></div>
                {data.counts.rejected > 0 && <div><span>Rechazados</span><strong className="text-error">{data.counts.rejected}</strong></div>}
              </div>
            )}
            {unbilled.length > 0 && (
              <>
                <div className="sale-section-title">Ventas sin comprobante ({unbilled.length})</div>
                <p className="text-sm text-muted">De los últimos 7 días. Tocá una para emitirlo.</p>
                {unbilled.slice(0, 15).map((o) => (
                  <button key={o.posId} type="button" className={o.failureMessage ? "setup-error" : "sale-void-info"} style={{ textAlign: "left", width: "100%" }}
                    onClick={() => { if (config) { setUnbilledChoice({ ...defaultInvoiceChoice(config), type: "final" }); setSelectedJobId(null); setSelectedId(null); setSelectedUnbilledId(o.posId) } }}>
                    {new Date(o.createdAt).toLocaleDateString("es-AR")} {formatTime(new Date(o.createdAt))} · {o.orderNumber ?? `#${o.posId.slice(0, 6).toUpperCase()}`} · {formatCurrency(o.totalCents)}
                    {o.failureMessage ? ` · Falló: ${o.failureMessage}` : ""}
                  </button>
                ))}
              </>
            )}
            {controller?.modality === "controller" && (
              <>
                <div className="sale-section-title">Impresora fiscal{controller.device ? ` · ${controller.device.brand} ${controller.device.model}` : ""}</div>
                <div className="fiscal-actions">
                  <button className="ctx-action ctx-action--teal" disabled={busy || reportActive} onClick={() => askReport("x")}>
                    <span className="ctx-action-icon"><Printer size={20} aria-hidden /></span>
                    <span className="ctx-action-label">Salida de cajero (X)</span>
                    <span className="ctx-action-hint">No cierra la jornada</span>
                  </button>
                  {!confirmZ && (
                    <button className="ctx-action ctx-action--red" disabled={busy || reportActive} onClick={() => setConfirmZ(true)}>
                      <span className="ctx-action-icon"><FileMinus size={20} aria-hidden /></span>
                      <span className="ctx-action-label">Cierre Z</span>
                      <span className="ctx-action-hint">Admin o encargado</span>
                    </button>
                  )}
                </div>
                {confirmZ && (
                  <div className="setup-error" role="alert">
                    <p><strong>El cierre Z no se puede deshacer.</strong> Cierra la jornada fiscal y graba los importes en la memoria fiscal.</p>
                    <div className="fiscal-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => setConfirmZ(false)}>Cancelar</button>
                      <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => askReport("z")}>Sí, hacer el cierre Z</button>
                    </div>
                  </div>
                )}
                {controller.reports.map((r) => (
                  <div key={r.id} className={r.status === "failed" || r.status === "unknown" || r.status === "driver_unavailable" ? "setup-error" : "sale-void-info"}>
                    {REPORT_NAME[r.kind]}{r.number && !r.file ? ` N.º ${r.number}` : ""} · {formatTime(new Date(r.createdAt))} · {REPORT_STATUS[r.status] ?? r.status}
                    {r.file ? ` · Guardado en la PC de caja: ${r.file}` : ""}
                    {r.message ? `: ${r.message}` : ""}
                  </div>
                ))}
              </>
            )}
            {controller?.modality === "controller" && (
              <>
                <div className="sale-section-title">Reportes del equipo (encargado / admin)</div>
                <p className="text-sm text-muted">Archivos firmados del mes elegido en Libro IVA. Quedan en la PC de caja, para presentarlos con tu contador. No imprimen ni emiten nada.</p>
                <div className="fiscal-libro">
                  {(["totals", "ctd", "duplicates"] as const).map((kind) => (
                    <button key={kind} className="btn btn-secondary btn-sm" disabled={busy || reportActive} onClick={() => { void run(async () => {
                      await requestControllerReport(tenantId!, kind, crypto.randomUUID(), month)
                      return `${REPORT_NAME[kind]}: descarga pedida a la impresora fiscal`
                    }) }}>
                      <Download size={14} aria-hidden /> {REPORT_NAME[kind]}
                    </button>
                  ))}
                </div>
              </>
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
  }, [selected, data, config, month, busy, tenantId, run, setContextPanel, setActionBar, health, controller, confirmZ, reportActive, askReport, selectedJob, isPrinter, printerDocs, resolvedNumber, unbilled, selectedUnbilled, unbilledChoice])

  return (
    <div className="workspace sales">
      <div className="sales-toolbar">
        <div className="sales-chips" role="group" aria-label="Período">
          {([["today", "Hoy"], ["yesterday", "Ayer"], ["week", "7 días"]] as [Preset, string][]).map(([p, label]) => (
            <button key={p} type="button" className={`sales-chip${preset === p ? " active" : ""}`} aria-pressed={preset === p} onClick={() => { setPreset(p); setSelectedId(null); setSelectedJobId(null); setSelectedUnbilledId(null) }}>{label}</button>
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
          {printerDocs?.documents.map((d) => (
            <button key={d.id} type="button" role="row" aria-selected={selectedJobId === d.id}
              className={`sales-row fiscal-row${selectedJobId === d.id ? " selected" : ""}`}
              onClick={() => { setSelectedId(null); setResolvedNumber(""); setSelectedJobId(selectedJobId === d.id ? null : d.id) }}>
              <span role="cell" className="sales-time">{formatTime(new Date(d.createdAt))}</span>
              <span role="cell" className="sales-title">{controllerDocumentLabel(d)}{d.training ? " · Entrenamiento" : ""}</span>
              <span role="cell" className="sales-items">{d.receiver.name || CONDITION_LABEL[d.receiver.condition]}</span>
              <span role="cell"><span className={`fiscal-status fiscal-status--${CONTROLLER_STATUS[d.status].tone}`}>{CONTROLLER_STATUS[d.status].label}</span></span>
              <span role="cell" className="sales-right sale-money">{d.kind === "credit_note" ? "−" : ""}{formatCurrency(d.totalCents)}</span>
            </button>
          ))}
          {data && data.documents.length === 0 && !printerDocs?.documents.length && (
            <div className="empty-state"><span className="empty-state-text">Sin comprobantes en este período</span></div>
          )}
          {data?.documents.map((d: PosFiscalDocument) => (
            <button key={d.id} type="button" role="row" aria-selected={selectedId === d.id}
              className={`sales-row fiscal-row${selectedId === d.id ? " selected" : ""}`}
              onClick={() => { setSelectedJobId(null); setSelectedId(selectedId === d.id ? null : d.id) }}>
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
