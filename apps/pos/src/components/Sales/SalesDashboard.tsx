import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from "react"
import { ChevronLeft, ChevronRight, Search, UtensilsCrossed, Store, Smartphone, Bike, FileText, FileSpreadsheet, FilterX, AlertTriangle } from "lucide-react"
import { useLayout } from "../layout/LayoutContext"
import { useEscapeBack } from "../../hooks/useEscapeBack"
import { useAuth } from "../../hooks/useAuth"
import { formatCurrency, formatTime } from "../../utils/format"
import { VOID_REASONS, VOID_REASON_LABELS, type VoidReason } from "@takeasygo/business/browser"
import { voidOrder } from "../../services/order"
import { isPosApiError } from "../../services/pos-api"
import { formatPaymentMethod } from "../../services/payment"
import { DELIVERY_PLATFORMS, deliveryPlatformLabel, orderModeLabel } from "../../services/channels"
import {
  DEFAULT_SALES_FILTERS,
  activeFilterCount,
  downloadSalesReport,
  getSalesView,
  localToday,
  shiftDate,
  type FiscalState,
  type SaleChannel,
  type SaleViewRow,
  type SalesFilters,
  type SalesView,
} from "../../services/reports"
import { closeKeyboardOnEnter } from "../../utils/touch"

// ============================================================================
// Contexto Ventas — flujo completo del local (2026-10-25)
// ============================================================================
// Pedido 25/10: filtros DENTRO del workspace por período y franja horaria,
// canal (Salón, Mostrador, App, Marketplaces — con modo de la App y
// plataforma), estado (cobradas / anuladas), medio de pago y facturación
// (facturadas / sin facturar / pendientes de ARCA). Los KPIs, los desgloses
// y la lista salen del MISMO conjunto filtrado (servidor: /reports/sales/
// view), así nunca se contradicen. Se mantienen ticket promedio y ticket por
// comensal. Junto al inventario: costo de mercadería (CMV), margen bruto y
// food cost por período, por venta y por plato; los platos sin receta se
// avisan para cargarla. El cajero ve cantidades, no dinero ni costo.
// ============================================================================

type Preset = "today" | "yesterday" | "week" | "month" | "custom"
type Tab = "ventas" | "pagos" | "canales" | "categorias" | "productos" | "horarios"
type Shift = "all" | "morning" | "noon" | "afternoon" | "night" | "custom"

const CHANNEL_ICON: Record<SaleChannel, typeof Store> = { salon: UtensilsCrossed, mostrador: Store, app: Smartphone, delivery: Bike }
const CHANNEL_LABEL: Record<SaleChannel, string> = { salon: "Salón", mostrador: "Mostrador", app: "App", delivery: "Marketplaces" }
const COURSE_LABEL: Record<string, string> = { entrada: "Entrada", principal: "Principal", postre: "Postre" }
const ROW_H = 56
const SHIFTS: Record<Exclude<Shift, "all" | "custom">, { label: string; from: number; to: number }> = {
  morning: { label: "Mañana 6–12", from: 6, to: 12 },
  noon: { label: "Mediodía 12–16", from: 12, to: 16 },
  afternoon: { label: "Tarde 16–20", from: 16, to: 20 },
  night: { label: "Noche 20–02", from: 20, to: 2 },
}
const PAYMENT_OPTIONS = ["cash", "posnet_debit", "posnet_credit", "mercadopago", "transfer", "kripton"]
const FISCAL_TEXT: Record<FiscalState, string> = { invoiced: "Facturada", credited: "Con NC", pending: "Pendiente ARCA", none: "Sin factura" }
const MODE_OPTIONS = ["takeaway", "delivery", "dine-in", "business"] as const

function rangeFor(preset: Preset, custom: { from: string; to: string }): { from: string; to: string } {
  const today = localToday()
  switch (preset) {
    case "yesterday": { const y = shiftDate(today, -1); return { from: y, to: y } }
    case "week": return { from: shiftDate(today, -6), to: today }
    case "month": return { from: `${today.slice(0, 8)}01`, to: today }
    case "custom": return custom.from <= custom.to ? custom : { from: custom.to, to: custom.from }
    default: return { from: today, to: today }
  }
}

function shortCode(id: string): string {
  return id.replace(/-/g, "").slice(-6).toUpperCase()
}

function saleTitle(r: SaleViewRow): string {
  if (r.channel === "salon") return r.table ? `Mesa ${r.table.number}` : "Mesa (eliminada)"
  if (r.channel === "mostrador") return `Mostrador #${shortCode(r.posId ?? r.id)}`
  if (r.channel === "delivery") return `${deliveryPlatformLabel(r.platform ?? undefined) ?? "Marketplace"} #${r.orderNumber ?? shortCode(r.id)}`
  return `App #${r.orderNumber ?? shortCode(r.id)}`
}

function paymentSummary(r: SaleViewRow): string {
  if (r.payments.length) return [...new Set(r.payments.map((p) => formatPaymentMethod(p.method as never).name))].join(" + ")
  return r.paymentMethod ? formatPaymentMethod(r.paymentMethod as never).name : "—"
}

const money = (v: number | null | undefined) => (v === null || v === undefined ? "—" : formatCurrency(v))
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v.toLocaleString("es-AR")} %`)
const hh = (h: number) => `${String(h % 24).padStart(2, "0")}:00`

export function SalesDashboard() {
  const { state } = useAuth()
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined
  const [preset, setPreset] = useState<Preset>("today")
  const [custom, setCustom] = useState(() => ({ from: shiftDate(localToday(), -6), to: localToday() }))
  const [shift, setShift] = useState<Shift>("all")
  const [customHours, setCustomHours] = useState({ from: 12, to: 16 })
  const [filters, setFilters] = useState<SalesFilters>(DEFAULT_SALES_FILTERS)
  const [tab, setTab] = useState<Tab>("ventas")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(8)
  const [view, setView] = useState<SalesView | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [voiding, setVoiding] = useState(false)
  useEscapeBack(voiding ? () => setVoiding(false) : selectedId ? () => setSelectedId(null) : null)
  const [voidReason, setVoidReason] = useState<VoidReason | null>(null)
  const [voidBusy, setVoidBusy] = useState(false)
  const [downloading, setDownloading] = useState<"pdf" | "xlsx" | null>(null)
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const { setContextPanel, setActionBar } = useLayout()
  const range = useMemo(() => rangeFor(preset, custom), [preset, custom])

  // Franja horaria → filtros hourFrom/hourTo (zona de la sede, en el server).
  const effective = useMemo<SalesFilters>(() => {
    const hours = shift === "all" ? null : shift === "custom" ? customHours : SHIFTS[shift]
    return { ...filters, hourFrom: hours ? hours.from : null, hourTo: hours ? hours.to : null }
  }, [filters, shift, customHours])

  useEffect(() => {
    const id = setTimeout(() => { setFilters((f) => (f.q === query.trim() ? f : { ...f, q: query.trim() })); setPage(0) }, 300)
    return () => clearTimeout(id)
  }, [query])

  const flash = useCallback((kind: "success" | "error", text: string) => {
    setNotice({ kind, text })
    setTimeout(() => setNotice(null), 4000)
  }, [])

  const load = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    try {
      setView(await getSalesView(tenantId, range, effective, { page, pageSize: rowsPerPage }))
    } catch (err) {
      flash("error", err instanceof Error ? err.message : "No se pudieron cargar las ventas")
    } finally {
      setLoading(false)
    }
  }, [tenantId, range, effective, page, rowsPerPage, flash])

  useEffect(() => {
    const id = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(id)
  }, [load])

  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    const measure = () => setRowsPerPage(Math.max(3, Math.floor(el.getBoundingClientRect().height / ROW_H)))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [tab])

  const resetPaging = () => { setPage(0); setSelectedId(null) }
  const setFilter = <K extends keyof SalesFilters>(key: K, value: SalesFilters[K]) => {
    setFilters((f) => {
      const next = { ...f, [key]: value }
      // El modo es de la App y la plataforma de Marketplaces: al cambiar de canal se limpian.
      if (key === "channel") { next.mode = "all"; next.platform = "all" }
      return next
    })
    resetPaging()
  }
  const clearFilters = () => { setFilters({ ...DEFAULT_SALES_FILTERS, channel: filters.channel, q: filters.q }); setShift("all"); resetPaging() }

  const selected = view?.rows.find((r) => r.id === selectedId) ?? null
  const m = view?.metrics
  const showMoney = view?.revenueVisible ?? false
  const cost = view?.cost
  const pageCount = view ? Math.max(1, Math.ceil(view.total / view.pageSize)) : 1
  const extraFilters = activeFilterCount(effective)

  const handleVoid = useCallback(async (row: SaleViewRow) => {
    if (!tenantId || !voidReason || !row.posId) return
    setVoidBusy(true)
    try {
      await voidOrder(tenantId, row.posId, voidReason)
      flash("success", "Venta anulada. La devolución quedó registrada en la caja.")
      setVoiding(false)
      setVoidReason(null)
      void load()
    } catch (err) {
      if (!(isPosApiError(err) && err.code === "approval_cancelled")) {
        flash("error", err instanceof Error ? err.message : "No se pudo anular la venta")
      }
    } finally {
      setVoidBusy(false)
    }
  }, [tenantId, voidReason, flash, load])

  const handleDownload = useCallback(async (format: "pdf" | "xlsx") => {
    if (!tenantId) return
    setDownloading(format)
    try {
      await downloadSalesReport(tenantId, format, range, effective)
    } catch (err) {
      flash("error", err instanceof Error ? err.message : "No se pudo descargar el reporte")
    } finally {
      setDownloading(null)
    }
  }, [tenantId, range, effective, flash])

  // ── Context Panel ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!selected) {
      const coverage = cost && cost.coverage.totalPortions ? Math.round((cost.coverage.mappedPortions / cost.coverage.totalPortions) * 100) : null
      setContextPanel({
        title: "Resumen del período",
        subtitle: [
          range.from === range.to ? range.from.split("-").reverse().join("/") : `${range.from.split("-").reverse().join("/")} al ${range.to.split("-").reverse().join("/")}`,
          effective.hourFrom !== null ? `${hh(effective.hourFrom)} a ${hh(effective.hourTo ?? 0)}` : null,
        ].filter(Boolean).join(" · "),
        body: m && view ? (
          <div className="sale-detail">
            <div className="sale-kpis">
              <div><span>Ventas</span><strong>{m.totals.sales}</strong></div>
              {showMoney && <div><span>Ingresos</span><strong className="text-success">{money(m.totals.revenue)}</strong></div>}
              <div><span>Ticket promedio</span><strong>{money(m.totals.avgTicket)}</strong></div>
              <div><span>Comensales</span><strong>{m.totals.guests}</strong></div>
              {showMoney && <div><span>Por comensal</span><strong>{money(m.totals.perGuest)}</strong></div>}
              {m.totals.voided.count > 0 && <div><span>Anuladas</span><strong className="text-error">{m.totals.voided.count}</strong></div>}
            </div>

            <div className="sale-section-title">Facturación</div>
            <div className="sale-channel-row"><span>Facturado</span><span className="text-muted">{view.invoicing.invoiced.count}</span><span className="sale-money">{showMoney ? money(view.invoicing.invoiced.amount) : ""}</span></div>
            <div className="sale-channel-row"><span>Sin facturar</span><span className="text-muted">{view.invoicing.notInvoiced.count}</span><span className="sale-money">{showMoney ? money(view.invoicing.notInvoiced.amount) : ""}</span></div>
            {view.invoicing.pending.count > 0 && (
              <div className="sale-channel-row"><span className="text-warning">Pendiente de ARCA</span><span className="text-muted">{view.invoicing.pending.count}</span><span className="sale-money">{showMoney ? money(view.invoicing.pending.amount) : ""}</span></div>
            )}

            {showMoney && cost?.available && (
              <>
                <div className="sale-section-title">Rentabilidad (inventario)</div>
                <div className="sale-kpis">
                  <div><span>Costo de mercadería</span><strong>{money(cost.cmvCents)}</strong></div>
                  <div><span>Margen bruto</span><strong className="text-success">{money(cost.grossMarginCents)}</strong></div>
                  <div><span>Food cost</span><strong>{pct(cost.foodCostPct)}</strong></div>
                  <div><span>Con receta</span><strong>{coverage === null ? "—" : `${coverage} %`}</strong></div>
                </div>
                {cost.unmappedProducts.length > 0 && (
                  <p className="sale-warn"><AlertTriangle size={14} aria-hidden /> Sin receta: {cost.unmappedProducts.slice(0, 4).map((p) => p.name).join(", ")}{cost.unmappedProducts.length > 4 ? "…" : ""}. Su costo no se cuenta: cargala en Inventario.</p>
                )}
                {cost.missingCostSkus > 0 && (
                  <p className="sale-warn"><AlertTriangle size={14} aria-hidden /> {cost.missingCostSkus} insumo(s) sin precio de compra: el costo puede quedar corto.</p>
                )}
              </>
            )}
            {showMoney && cost && !cost.available && (
              <p className="text-sm text-muted">El costo y el margen aparecen cuando la sede usa Inventario con recetas.</p>
            )}

            <div className="sale-section-title">Por canal</div>
            {(["salon", "mostrador", "app", "delivery"] as SaleChannel[]).map((c) => {
              const Icon = CHANNEL_ICON[c]
              const v = m.byChannel[c]
              return (
                <div key={c} className="sale-channel-row">
                  <span className={`sale-channel sale-channel--${c}`}><Icon size={14} aria-hidden /> {CHANNEL_LABEL[c]}</span>
                  <span className="text-muted">{v.sales}</span>
                  <span className="sale-money">{showMoney ? money(v.revenue) : `ticket ${money(v.avgTicket)}`}</span>
                </div>
              )
            })}
            {showMoney && m.totals.discounts ? <p className="text-sm">Descuentos del período: <strong>{money(m.totals.discounts)}</strong></p> : null}
            <p className="text-sm text-muted">Tocá una venta para ver su detalle.</p>
          </div>
        ) : <div className="loading-state"><span className="spinner" /></div>,
      })
      setActionBar(showMoney ? {
        right: (
          <>
            <button className="btn btn-secondary" disabled={downloading !== null} onClick={() => { void handleDownload("pdf") }} title="Respeta los filtros aplicados">
              <FileText size={16} aria-hidden /> {downloading === "pdf" ? "Generando…" : "Cierre PDF"}
            </button>
            <button className="btn btn-secondary" disabled={downloading !== null} onClick={() => { void handleDownload("xlsx") }} title="Respeta los filtros aplicados">
              <FileSpreadsheet size={16} aria-hidden /> {downloading === "xlsx" ? "Generando…" : "Excel"}
            </button>
          </>
        ),
      } : null)
      return
    }

    const Icon = CHANNEL_ICON[selected.channel]
    const created = new Date(selected.createdAt)
    const margin = showMoney && selected.costCents !== null && selected.total ? selected.total - selected.costCents : null
    setContextPanel({
      title: saleTitle(selected),
      subtitle: `${created.toLocaleDateString("es-AR")} · ${formatTime(created)}${showMoney ? ` · ${money(selected.total)}` : ""}`,
      body: (
        <div className="sale-detail">
          <div className="sale-tags">
            <span className={`sale-channel sale-channel--${selected.channel}`}><Icon size={14} aria-hidden /> {CHANNEL_LABEL[selected.channel]}</span>
            {selected.voided ? <span className="sale-voided">Anulada</span> : <span className="sale-billed">Cobrada</span>}
            <span className={`sale-fiscal sale-fiscal--${selected.fiscal.state}`}>{FISCAL_TEXT[selected.fiscal.state]}</span>
          </div>
          <dl className="sale-facts">
            {selected.channel === "salon" && <div><dt>Mesa</dt><dd>{selected.table ? `${selected.table.number}${selected.table.section ? ` · ${selected.table.section}` : ""}` : "Mesa eliminada"}</dd></div>}
            {selected.channel === "salon" && <div><dt>Comensales</dt><dd>{selected.guests ?? "—"}</dd></div>}
            {(selected.channel === "app" || selected.channel === "delivery") && orderModeLabel(selected.orderMode ?? undefined) && <div><dt>Modo</dt><dd>{orderModeLabel(selected.orderMode ?? undefined)}</dd></div>}
            {selected.channel === "delivery" && <div><dt>Plataforma</dt><dd>{deliveryPlatformLabel(selected.platform ?? undefined) ?? "—"}</dd></div>}
            <div><dt>Código</dt><dd>#{selected.orderNumber ?? shortCode(selected.posId ?? selected.id)}</dd></div>
            <div><dt>Fecha</dt><dd>{created.toLocaleDateString("es-AR")} {formatTime(created)}</dd></div>
            {selected.fiscal.label && <div><dt>Comprobante</dt><dd>{selected.fiscal.label}</dd></div>}
          </dl>

          <div className="sale-section-title">Detalle</div>
          <ul className="sale-lines">
            {selected.items.map((item, i) => (
              <li key={i}>
                <span className="sale-qty">{item.quantity}×</span>
                <div className="sale-line-main">
                  <span className="sale-line-name">
                    {item.course && <span className="order-item-course">{COURSE_LABEL[item.course] ?? item.course}</span>}
                    {item.name}
                  </span>
                  {item.modifiers.length > 0 && <span className="sale-line-sub">{item.modifiers.join(" · ")}</span>}
                  {item.notes && <span className="sale-line-note">{item.notes}</span>}
                  {item.discount && <span className="sale-line-disc">Descuento {item.discount.kind === "percent" ? `${item.discount.value}% ` : ""}{showMoney ? `−${money(item.discount.amount)}` : ""}</span>}
                </div>
                {showMoney && <span className="sale-money">{money(item.total)}</span>}
              </li>
            ))}
          </ul>

          {showMoney && (
            <div className="sale-totals">
              {selected.discounts ? <div><span>Descuentos</span><span className="text-success">−{money(selected.discounts)}</span></div> : null}
              <div className="sale-grand"><span>Total</span><span>{money(selected.total)}</span></div>
              {selected.costCents !== null && (
                <>
                  <div><span>Costo de mercadería</span><span>{money(selected.costCents)}</span></div>
                  <div><span>Margen</span><span className="text-success">{money(margin)}{selected.total ? ` · ${Math.round(((margin ?? 0) / selected.total) * 100)} %` : ""}</span></div>
                </>
              )}
            </div>
          )}

          <div className="sale-section-title">Pago</div>
          {selected.payments.length ? (
            <ul className="sale-payments">
              {selected.payments.map((p, i) => (
                <li key={i}>
                  <span>{formatPaymentMethod(p.method as never).icon} {formatPaymentMethod(p.method as never).name}{p.reference ? <span className="sale-line-sub"> · {p.reference}</span> : null}</span>
                  {showMoney && <span className="sale-money">{money(p.amount)}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm">{selected.paymentMethod ? `${formatPaymentMethod(selected.paymentMethod as never).name} (pagado en la App)` : "Sin detalle de pago"}</p>
          )}

          {selected.fiscal.state === "none" && !selected.voided && (
            <p className="text-sm text-muted">Sin comprobante electrónico. Se puede facturar desde Facturación o desde la mesa al cobrar.</p>
          )}
          {selected.voided && (
            <div className="sale-void-info">
              Anulada el {new Date(selected.voided.at).toLocaleString("es-AR")} — {VOID_REASON_LABELS[selected.voided.reason as VoidReason] ?? selected.voided.reason}
            </div>
          )}

          {voiding && (
            <div className="void-form">
              <span className="cash-label">¿Por qué se anula?</span>
              <div className="chip-row" role="radiogroup" aria-label="Motivo de la anulación">
                {VOID_REASONS.map((r) => (
                  <button key={r} role="radio" aria-checked={voidReason === r} className={`chip ${voidReason === r ? "active" : ""}`} onClick={() => setVoidReason(r)}>
                    {VOID_REASON_LABELS[r]}
                  </button>
                ))}
              </div>
              <p className="cash-help">Se devuelve el total y queda en el cierre de caja. Un cajero necesita el PIN del encargado.{selected.fiscal.state === "invoiced" ? " La factura se anula con su nota de crédito." : ""}</p>
            </div>
          )}
        </div>
      ),
    })
    const canVoid = selected.chargedInPos && !selected.voided && Boolean(selected.posId)
    setActionBar({
      left: (
        <button className="btn btn-ghost" onClick={() => (voiding ? setVoiding(false) : setSelectedId(null))}>
          {voiding ? "Cancelar" : "← Volver al resumen"}
        </button>
      ),
      right: canVoid ? (
        voiding ? (
          <button className="btn btn-danger" disabled={!voidReason || voidBusy} onClick={() => { void handleVoid(selected) }}>Anular y devolver</button>
        ) : (
          <button className="btn btn-secondary" onClick={() => setVoiding(true)}>Anular venta</button>
        )
      ) : undefined,
    })
  }, [selected, m, view, cost, range, effective, showMoney, voiding, voidReason, voidBusy, downloading, handleVoid, handleDownload, setContextPanel, setActionBar])

  // ── Desgloses ───────────────────────────────────────────────────────────
  const breakdown = useMemo(() => {
    if (!m || !view) return []
    if (tab === "pagos") return m.byPayment.map((p) => ({ key: p.method, label: formatPaymentMethod(p.method as never).name, qty: p.count, unit: "cobros", amount: p.amount }))
    if (tab === "categorias") return m.byCategory.map((c) => ({ key: c.category, label: c.category, qty: c.quantity, unit: "u.", amount: c.revenue }))
    if (tab === "horarios") return m.byHour.filter((h) => h.sales > 0).map((h) => ({ key: String(h.hour), label: `${hh(h.hour)} – ${hh(h.hour + 1)}`, qty: h.sales, unit: "ventas", amount: h.revenue }))
    if (tab === "canales") {
      return [
        ...(["salon", "mostrador", "app", "delivery"] as SaleChannel[]).map((c) => ({ key: c, label: CHANNEL_LABEL[c], qty: m.byChannel[c].sales, unit: "ventas", amount: m.byChannel[c].revenue })),
        ...view.byMode.map((x) => ({ key: `mode-${x.mode}`, label: `App · ${orderModeLabel(x.mode) ?? x.mode}`, qty: x.sales, unit: "ventas", amount: x.revenue })),
        ...view.byPlatform.map((x) => ({
          key: `pf-${x.platform}`,
          // Fase 5: comisión de la plataforma y neto para el local.
          label: `Marketplace · ${deliveryPlatformLabel(x.platform) ?? x.platform}${x.commissionCents !== null && x.commissionPercent !== null ? ` · comisión ${x.commissionPercent} % (−${formatCurrency(x.commissionCents)}) · neto ${formatCurrency(x.netCents ?? 0)}` : ""}`,
          qty: x.sales,
          unit: "ventas",
          amount: x.revenue,
        })),
      ]
    }
    return []
  }, [m, view, tab])
  const breakdownMax = Math.max(1, ...breakdown.map((b) => (showMoney ? b.amount ?? 0 : b.qty)))

  const channelCount = (c: SaleChannel | "all") => (m && filters.channel === "all" ? (c === "all" ? m.totals.sales : m.byChannel[c].sales) : null)

  return (
    <div className="workspace sales">
      {/* ── Período y franja horaria ── */}
      <div className="sales-toolbar">
        <div className="sales-chips" role="group" aria-label="Período">
          {([["today", "Hoy"], ["yesterday", "Ayer"], ["week", "7 días"], ["month", "Mes"], ["custom", "Rango"]] as [Preset, string][]).map(([p, label]) => (
            <button key={p} type="button" className={`sales-chip${preset === p ? " active" : ""}`} aria-pressed={preset === p} onClick={() => { setPreset(p); resetPaging() }}>
              {label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="sales-range">
            <input type="date" value={custom.from} max={localToday()} aria-label="Desde" onChange={(e) => { setCustom((c) => ({ ...c, from: e.target.value })); resetPaging() }} />
            <span>al</span>
            <input type="date" value={custom.to} max={localToday()} aria-label="Hasta" onChange={(e) => { setCustom((c) => ({ ...c, to: e.target.value })); resetPaging() }} />
          </div>
        )}
        <label className="sales-select">
          <span>Franja</span>
          <select value={shift} onChange={(e) => { setShift(e.target.value as Shift); resetPaging() }} aria-label="Franja horaria">
            <option value="all">Todo el día</option>
            {(Object.keys(SHIFTS) as (keyof typeof SHIFTS)[]).map((k) => <option key={k} value={k}>{SHIFTS[k].label}</option>)}
            <option value="custom">Personalizada</option>
          </select>
        </label>
        {shift === "custom" && (
          <div className="sales-range">
            <select value={customHours.from} aria-label="Desde la hora" onChange={(e) => { setCustomHours((h) => ({ ...h, from: Number(e.target.value) })); resetPaging() }}>
              {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{hh(i)}</option>)}
            </select>
            <span>a</span>
            <select value={customHours.to} aria-label="Hasta la hora" onChange={(e) => { setCustomHours((h) => ({ ...h, to: Number(e.target.value) })); resetPaging() }}>
              {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{hh(i)}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* ── Canal (+ modo de la App / plataforma) ── */}
      <div className="sales-toolbar">
        <div className="sales-chips" role="group" aria-label="Canal">
          {(["all", "salon", "mostrador", "app", "delivery"] as (SaleChannel | "all")[]).map((c) => (
            <button key={c} type="button" className={`sales-chip${filters.channel === c ? " active" : ""}`} aria-pressed={filters.channel === c} onClick={() => setFilter("channel", c)}>
              {c === "all" ? "Todos" : CHANNEL_LABEL[c]}
              {channelCount(c) !== null && <span className="sales-chip-count">{channelCount(c)}</span>}
            </button>
          ))}
        </div>
        {filters.channel === "app" && (
          <div className="sales-chips sales-chips--sub" role="group" aria-label="Modo del pedido">
            <button type="button" className={`sales-chip${filters.mode === "all" ? " active" : ""}`} aria-pressed={filters.mode === "all"} onClick={() => setFilter("mode", "all")}>Todos</button>
            {MODE_OPTIONS.map((mo) => (
              <button key={mo} type="button" className={`sales-chip${filters.mode === mo ? " active" : ""}`} aria-pressed={filters.mode === mo} onClick={() => setFilter("mode", mo)}>{orderModeLabel(mo)}</button>
            ))}
          </div>
        )}
        {filters.channel === "delivery" && (
          <div className="sales-chips sales-chips--sub" role="group" aria-label="Plataforma">
            <button type="button" className={`sales-chip${filters.platform === "all" ? " active" : ""}`} aria-pressed={filters.platform === "all"} onClick={() => setFilter("platform", "all")}>Todas</button>
            {DELIVERY_PLATFORMS.map((p) => (
              <button key={p.id} type="button" className={`sales-chip${filters.platform === p.id ? " active" : ""}`} aria-pressed={filters.platform === p.id} onClick={() => setFilter("platform", p.id)}>{p.label}</button>
            ))}
          </div>
        )}
      </div>

      {/* ── Estado, medio de pago, facturación ── */}
      <div className="sales-toolbar sales-filters">
        <label className="sales-select">
          <span>Estado</span>
          <select value={filters.status} onChange={(e) => setFilter("status", e.target.value as SalesFilters["status"])}>
            <option value="all">Todas</option>
            <option value="billed">Cobradas</option>
            <option value="voided">Anuladas</option>
          </select>
        </label>
        <label className="sales-select">
          <span>Medio de pago</span>
          <select value={filters.payment} onChange={(e) => setFilter("payment", e.target.value)}>
            <option value="all">Todos</option>
            {PAYMENT_OPTIONS.map((p) => <option key={p} value={p}>{formatPaymentMethod(p as never).name}</option>)}
          </select>
        </label>
        <label className="sales-select">
          <span>Facturación</span>
          <select value={filters.invoice} onChange={(e) => setFilter("invoice", e.target.value as SalesFilters["invoice"])}>
            <option value="all">Todas</option>
            <option value="invoiced">Facturadas</option>
            <option value="not_invoiced">Sin facturar</option>
            <option value="pending">Pendientes de ARCA</option>
          </select>
        </label>
        {extraFilters > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>
            <FilterX size={16} aria-hidden /> Limpiar filtros ({extraFilters})
          </button>
        )}
        <label className="sales-search">
          <Search size={16} aria-hidden />
          <input type="search" enterKeyHint="search" autoComplete="off" value={query} placeholder="Mesa, código o producto…" aria-label="Buscar venta" onChange={(e) => setQuery(e.target.value)} onKeyDown={closeKeyboardOnEnter} />
        </label>
      </div>

      {/* ── KPIs del conjunto filtrado ── */}
      <div className="sales-kpis" role="status" aria-busy={loading}>
        <div><span>Ventas</span><strong>{m?.totals.sales ?? "—"}</strong></div>
        {showMoney && <div><span>Ingresos</span><strong>{money(m?.totals.revenue)}</strong></div>}
        <div><span>Ticket promedio</span><strong>{money(m?.totals.avgTicket)}</strong></div>
        <div><span>Comensales</span><strong>{m?.totals.guests ?? "—"}</strong></div>
        {showMoney && <div><span>Ticket por comensal</span><strong>{money(m?.totals.perGuest)}</strong></div>}
        {showMoney && <div><span>Facturado</span><strong>{money(view?.invoicing.invoiced.amount)}</strong></div>}
        {showMoney && <div><span>Sin facturar</span><strong>{money(view?.invoicing.notInvoiced.amount)}</strong></div>}
        {showMoney && cost?.available && <div><span>Margen bruto</span><strong className="text-success">{money(cost.grossMarginCents)}</strong><small>food cost {pct(cost.foodCostPct)}</small></div>}
      </div>

      <div className="sales-tabs" role="tablist" aria-label="Vista">
        {([["ventas", "Ventas"], ["pagos", "Medios de pago"], ["canales", "Canales"], ["categorias", "Categorías"], ["productos", "Productos"], ["horarios", "Horarios"]] as [Tab, string][]).map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={`sales-tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>

      {tab === "ventas" ? (
        <div className="sales-table" role="table" aria-label="Ventas" aria-busy={loading}>
          <div className="sales-row sales-row--head" role="row">
            <span role="columnheader">Hora</span>
            <span role="columnheader">Canal</span>
            <span role="columnheader">Venta</span>
            <span role="columnheader">Productos</span>
            <span role="columnheader">Pago</span>
            <span role="columnheader">Factura</span>
            <span role="columnheader" className="sales-right">{showMoney ? "Total" : "Productos"}</span>
          </div>
          <div className="sales-rows" ref={listRef}>
            {!view && loading && <div className="loading-state"><span className="spinner" /> Cargando…</div>}
            {view && view.rows.length === 0 && (
              <div className="empty-state"><span className="empty-state-text">Sin ventas con estos filtros</span></div>
            )}
            {view?.rows.map((r) => {
              const Icon = CHANNEL_ICON[r.channel]
              const isSel = selectedId === r.id
              const d = new Date(r.createdAt)
              return (
                <button
                  key={r.id}
                  type="button"
                  role="row"
                  aria-selected={isSel}
                  className={`sales-row${isSel ? " selected" : ""}${r.voided ? " voided" : ""}`}
                  onClick={() => { setSelectedId(isSel ? null : r.id); setVoiding(false); setVoidReason(null) }}
                >
                  <span role="cell" className="sales-time">{range.from === range.to ? formatTime(d) : `${d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })} ${formatTime(d)}`}</span>
                  <span role="cell"><span className={`sale-channel sale-channel--${r.channel}`}><Icon size={13} aria-hidden /> {CHANNEL_LABEL[r.channel]}</span></span>
                  <span role="cell" className="sales-title">
                    {saleTitle(r)}
                    {r.channel === "salon" && r.guests ? <span className="sale-line-sub"> · {r.guests} com.</span> : null}
                    {r.channel === "app" && orderModeLabel(r.orderMode ?? undefined) && <span className="sale-line-sub"> · {orderModeLabel(r.orderMode ?? undefined)}</span>}
                  </span>
                  <span role="cell" className="sales-items">{r.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</span>
                  <span role="cell" className="sales-pay">{paymentSummary(r)}</span>
                  <span role="cell"><span className={`sale-fiscal sale-fiscal--${r.fiscal.state}`} title={r.fiscal.label ?? undefined}>{FISCAL_TEXT[r.fiscal.state]}</span></span>
                  <span role="cell" className="sales-right sale-money">
                    {r.voided && <span className="sale-voided">Anulada</span>} {showMoney ? money(r.total) : `${r.items.reduce((s, i) => s + i.quantity, 0)} u.`}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="sales-pager">
            <span className="text-sm text-muted">{view?.total ?? 0} ventas</span>
            <button type="button" className="btn btn-secondary psel-page-btn" disabled={page === 0 || loading} onClick={() => setPage(page - 1)} aria-label="Página anterior">
              <ChevronLeft size={18} aria-hidden />
            </button>
            <span className="psel-page">{page + 1} / {pageCount}</span>
            <button type="button" className="btn btn-secondary psel-page-btn" disabled={page >= pageCount - 1 || loading} onClick={() => setPage(page + 1)} aria-label="Página siguiente">
              <ChevronRight size={18} aria-hidden />
            </button>
          </div>
        </div>
      ) : tab === "productos" ? (
        <div className="sales-breakdown" role="tabpanel">
          <div className="sales-prod-row sales-prod-row--head">
            <span>Producto</span><span className="sales-right">Unid.</span>
            {showMoney && <span className="sales-right">Ingresos</span>}
            {showMoney && cost?.available && <span className="sales-right">Costo</span>}
            {showMoney && cost?.available && <span className="sales-right">Margen</span>}
          </div>
          {(view?.products.length ?? 0) === 0 && <div className="empty-state"><span className="empty-state-text">Sin datos con estos filtros</span></div>}
          {view?.products.map((p) => (
            <div key={p.name} className="sales-prod-row">
              <span className="sales-break-label">{p.name}</span>
              <span className="sales-right text-muted">{p.quantity}</span>
              {showMoney && <span className="sales-right sale-money">{money(p.revenue)}</span>}
              {showMoney && cost?.available && <span className="sales-right">{p.costCents === null ? <span className="sale-line-sub">sin receta</span> : money(p.costCents)}</span>}
              {showMoney && cost?.available && <span className={`sales-right sale-money${p.marginPct !== null && p.marginPct < 50 ? " text-warning" : ""}`}>{pct(p.marginPct)}</span>}
            </div>
          ))}
        </div>
      ) : (
        <div className="sales-breakdown" role="tabpanel">
          {breakdown.length === 0 && <div className="empty-state"><span className="empty-state-text">Sin datos con estos filtros</span></div>}
          {breakdown.map((b) => {
            const v = showMoney ? b.amount ?? 0 : b.qty
            return (
              <div key={b.key} className="sales-break-row">
                <span className="sales-break-label">{b.label}</span>
                <span className="sales-break-bar" aria-hidden><i style={{ width: `${(v / breakdownMax) * 100}%` }} /></span>
                <span className="text-muted">{b.qty} {b.unit}</span>
                {showMoney && <span className="sale-money">{money(b.amount)}</span>}
              </div>
            )
          })}
        </div>
      )}

      {notice && (
        <div className="toast-container">
          <div className={`toast ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
            <span className="toast-message">{notice.text}</span>
          </div>
        </div>
      )}
    </div>
  )
}
