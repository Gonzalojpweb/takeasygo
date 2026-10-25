import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from "react"
import { ChevronLeft, ChevronRight, Search, UtensilsCrossed, Store, Smartphone, Bike, FileText, FileSpreadsheet } from "lucide-react"
import { useLayout } from "../layout/LayoutContext"
import { useAuth } from "../../hooks/useAuth"
import { formatCurrency, formatTime } from "../../utils/format"
import { VOID_REASONS, VOID_REASON_LABELS, type VoidReason } from "@takeasygo/business/browser"
import { voidOrder } from "../../services/order"
import { isPosApiError } from "../../services/pos-api"
import { formatPaymentMethod } from "../../services/payment"
import { SALE_CHANNEL_LABEL, deliveryPlatformLabel, orderModeLabel } from "../../services/channels"
import {
  downloadSalesReport,
  getSalesReport,
  listSales,
  localToday,
  shiftDate,
  type SaleChannel,
  type SaleRow,
  type SalesList,
  type SalesReport,
} from "../../services/reports"

// ============================================================================
// Contexto Ventas (obs. 24/10 + Fase I)
// ============================================================================
// Todo sale del SERVIDOR (antes: caché de 200 órdenes del dispositivo, con
// semana y mes incompletos): mismos números en todos los equipos.
//   · Período: Hoy · Ayer · 7 días · Mes · Rango (fechas a elección).
//   · Canal siempre separado: Salón · Mostrador · App TakeasyGO · Delivery.
//   · Pestañas: Ventas (lista paginada al alto real) · Métodos de pago ·
//     Categorías · Productos.
//   · Descargas: «Cierre» en PDF y Excel (encargado y admin).
//   · Detalle completo en el Context Panel; anular venta con PIN.
// El cajero ve cantidades sin montos (el server los manda en null).
// ============================================================================

type Preset = "today" | "yesterday" | "week" | "month" | "custom"
type Tab = "ventas" | "pagos" | "categorias" | "productos"
type ChannelFilter = "all" | SaleChannel

const CHANNEL_ICON: Record<SaleChannel, typeof Store> = { salon: UtensilsCrossed, mostrador: Store, app: Smartphone, delivery: Bike }
const COURSE_LABEL: Record<string, string> = { entrada: "Entrada", principal: "Principal", postre: "Postre" }
const ROW_H = 56

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

function saleTitle(r: SaleRow): string {
  if (r.channel === "salon") return r.table ? `Mesa ${r.table.number}` : "Mesa (eliminada)"
  if (r.channel === "mostrador") return `Mostrador #${shortCode(r.posId ?? r.id)}`
  if (r.channel === "delivery") return `${deliveryPlatformLabel(r.platform ?? undefined) ?? "Delivery"} #${r.orderNumber ?? shortCode(r.id)}`
  return `App #${r.orderNumber ?? shortCode(r.id)}`
}

function paymentSummary(r: SaleRow): string {
  if (r.payments.length) return [...new Set(r.payments.map((p) => formatPaymentMethod(p.method as never).name))].join(" + ")
  return r.paymentMethod ? formatPaymentMethod(r.paymentMethod as never).name : "—"
}

const money = (v: number | null | undefined) => (v === null || v === undefined ? "—" : formatCurrency(v))

export function SalesDashboard() {
  const { state } = useAuth()
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined
  const [preset, setPreset] = useState<Preset>("today")
  const [custom, setCustom] = useState(() => ({ from: shiftDate(localToday(), -6), to: localToday() }))
  const [channel, setChannel] = useState<ChannelFilter>("all")
  const [tab, setTab] = useState<Tab>("ventas")
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(8)
  const [list, setList] = useState<SalesList | null>(null)
  const [report, setReport] = useState<SalesReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [voiding, setVoiding] = useState(false)
  const [voidReason, setVoidReason] = useState<VoidReason | null>(null)
  const [voidBusy, setVoidBusy] = useState(false)
  const [downloading, setDownloading] = useState<"pdf" | "xlsx" | null>(null)
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const { setContextPanel, setActionBar } = useLayout()
  const range = useMemo(() => rangeFor(preset, custom), [preset, custom])

  useEffect(() => {
    const id = setTimeout(() => { setDebounced(query.trim()); setPage(0) }, 300)
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
      const [l, r] = await Promise.all([
        listSales(tenantId, { ...range, channel, q: debounced, page, pageSize: rowsPerPage }),
        getSalesReport(tenantId, range),
      ])
      setList(l)
      setReport(r)
    } catch (err) {
      flash("error", err instanceof Error ? err.message : "No se pudieron cargar las ventas")
    } finally {
      setLoading(false)
    }
  }, [tenantId, range, channel, debounced, page, rowsPerPage, flash])

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
  const selected = list?.rows.find((r) => r.id === selectedId) ?? null
  const m = report?.metrics
  const showMoney = list?.revenueVisible ?? report?.revenueVisible ?? false
  const pageCount = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1
  // Ventas es de encargado/admin y el server exige ese rol para exportar:
  // si el server muestra montos, se puede descargar.
  const canExport = showMoney

  const handleVoid = useCallback(async (row: SaleRow) => {
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
      await downloadSalesReport(tenantId, format, range)
    } catch (err) {
      flash("error", err instanceof Error ? err.message : "No se pudo descargar el reporte")
    } finally {
      setDownloading(null)
    }
  }, [tenantId, range, flash])

  // ── Context Panel: resumen del período o detalle de la venta ─────────────
  useEffect(() => {
    if (!selected) {
      setContextPanel({
        title: "Resumen del período",
        subtitle: range.from === range.to ? range.from.split("-").reverse().join("/") : `${range.from.split("-").reverse().join("/")} al ${range.to.split("-").reverse().join("/")}`,
        body: m ? (
          <div className="sale-detail">
            <div className="sale-kpis">
              <div><span>Ventas</span><strong>{m.totals.sales}</strong></div>
              {showMoney && <div><span>Ingresos</span><strong className="text-success">{money(m.totals.revenue)}</strong></div>}
              <div><span>Ticket promedio</span><strong>{money(m.totals.avgTicket)}</strong></div>
              <div><span>Comensales</span><strong>{m.totals.guests}</strong></div>
              {showMoney && <div><span>Por comensal</span><strong>{money(m.totals.perGuest)}</strong></div>}
              {m.totals.voided.count > 0 && <div><span>Anuladas</span><strong className="text-error">{m.totals.voided.count}</strong></div>}
            </div>
            <div className="sale-section-title">Por canal</div>
            {(["salon", "mostrador", "app", "delivery"] as SaleChannel[]).map((c) => {
              const Icon = CHANNEL_ICON[c]
              const v = m.byChannel[c]
              return (
                <div key={c} className="sale-channel-row">
                  <span className={`sale-channel sale-channel--${c}`}><Icon size={14} aria-hidden /> {SALE_CHANNEL_LABEL[c]}</span>
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
      setActionBar(canExport ? {
        right: (
          <>
            <button className="btn btn-secondary" disabled={downloading !== null} onClick={() => { void handleDownload("pdf") }}>
              <FileText size={16} aria-hidden /> {downloading === "pdf" ? "Generando…" : "Cierre PDF"}
            </button>
            <button className="btn btn-secondary" disabled={downloading !== null} onClick={() => { void handleDownload("xlsx") }}>
              <FileSpreadsheet size={16} aria-hidden /> {downloading === "xlsx" ? "Generando…" : "Excel"}
            </button>
          </>
        ),
      } : null)
      return
    }

    const Icon = CHANNEL_ICON[selected.channel]
    const created = new Date(selected.createdAt)
    setContextPanel({
      title: saleTitle(selected),
      subtitle: `${created.toLocaleDateString("es-AR")} · ${formatTime(created)}${showMoney ? ` · ${money(selected.total)}` : ""}`,
      body: (
        <div className="sale-detail">
          <div className="sale-tags">
            <span className={`sale-channel sale-channel--${selected.channel}`}><Icon size={14} aria-hidden /> {SALE_CHANNEL_LABEL[selected.channel]}</span>
            {selected.voided && <span className="sale-voided">Anulada</span>}
          </div>
          <dl className="sale-facts">
            {selected.channel === "salon" && <div><dt>Mesa</dt><dd>{selected.table ? `${selected.table.number}${selected.table.section ? ` · ${selected.table.section}` : ""}` : "Mesa eliminada"}</dd></div>}
            {selected.channel === "salon" && <div><dt>Comensales</dt><dd>{selected.guests ?? "—"}</dd></div>}
            {(selected.channel === "app" || selected.channel === "delivery") && orderModeLabel(selected.orderMode ?? undefined) && <div><dt>Modo</dt><dd>{orderModeLabel(selected.orderMode ?? undefined)}</dd></div>}
            {selected.channel === "delivery" && <div><dt>Plataforma</dt><dd>{deliveryPlatformLabel(selected.platform ?? undefined) ?? "—"}</dd></div>}
            <div><dt>Código</dt><dd>#{selected.orderNumber ?? shortCode(selected.posId ?? selected.id)}</dd></div>
            <div><dt>Fecha</dt><dd>{created.toLocaleDateString("es-AR")} {formatTime(created)}</dd></div>
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
              <p className="cash-help">Se devuelve el total y queda en el cierre de caja. Un cajero necesita el PIN del encargado.</p>
            </div>
          )}
        </div>
      ),
    })
    // Solo ventas cobradas en el POS se anulan acá (las online se gestionan en el SaaS).
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
  }, [selected, m, range, showMoney, voiding, voidReason, voidBusy, canExport, downloading, handleVoid, handleDownload, setContextPanel, setActionBar])

  const breakdown = useMemo(() => {
    if (!m) return []
    if (tab === "pagos") return m.byPayment.map((p) => ({ key: p.method, label: formatPaymentMethod(p.method as never).name, qty: `${p.count} cobros`, amount: p.amount }))
    if (tab === "categorias") return m.byCategory.map((c) => ({ key: c.category, label: c.category, qty: `${c.quantity} u.`, amount: c.revenue }))
    if (tab === "productos") return m.topProducts.map((p) => ({ key: p.name, label: p.name, qty: `${p.quantity} u.`, amount: p.revenue }))
    return []
  }, [m, tab])
  const breakdownMax = Math.max(1, ...breakdown.map((b) => (showMoney ? b.amount ?? 0 : Number.parseInt(b.qty, 10) || 0)))

  return (
    <div className="workspace sales">
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
        <div className="sales-chips" role="group" aria-label="Canal">
          {(["all", "salon", "mostrador", "app", "delivery"] as ChannelFilter[]).map((c) => (
            <button key={c} type="button" className={`sales-chip${channel === c ? " active" : ""}`} aria-pressed={channel === c} onClick={() => { setChannel(c); resetPaging() }}>
              {c === "all" ? "Todos" : SALE_CHANNEL_LABEL[c]}
              <span className="sales-chip-count">{m ? (c === "all" ? m.totals.sales : m.byChannel[c].sales) : ""}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="sales-kpis" role="status">
        <div><span>Ventas</span><strong>{m?.totals.sales ?? "—"}</strong></div>
        {showMoney && <div><span>Ingresos</span><strong>{money(m?.totals.revenue)}</strong></div>}
        <div><span>Ticket promedio</span><strong>{money(m?.totals.avgTicket)}</strong></div>
        <div><span>Comensales</span><strong>{m?.totals.guests ?? "—"}</strong></div>
        {showMoney && <div><span>Ticket por comensal</span><strong>{money(m?.totals.perGuest)}</strong></div>}
      </div>

      <div className="sales-tabs" role="tablist" aria-label="Vista">
        {([["ventas", "Ventas"], ["pagos", "Métodos de pago"], ["categorias", "Categorías"], ["productos", "Productos"]] as [Tab, string][]).map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={`sales-tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>{label}</button>
        ))}
        {tab === "ventas" && (
          <label className="sales-search">
            <Search size={16} aria-hidden />
            <input type="search" value={query} placeholder="Mesa, código o producto…" aria-label="Buscar venta" onChange={(e) => setQuery(e.target.value)} />
          </label>
        )}
      </div>

      {tab === "ventas" ? (
        <div className="sales-table" role="table" aria-label="Ventas" aria-busy={loading}>
          <div className="sales-row sales-row--head" role="row">
            <span role="columnheader">Hora</span>
            <span role="columnheader">Canal</span>
            <span role="columnheader">Venta</span>
            <span role="columnheader">Productos</span>
            <span role="columnheader">Pago</span>
            <span role="columnheader" className="sales-right">{showMoney ? "Total" : "Productos"}</span>
          </div>
          <div className="sales-rows" ref={listRef}>
            {!list && loading && <div className="loading-state"><span className="spinner" /> Cargando…</div>}
            {list && list.rows.length === 0 && (
              <div className="empty-state"><span className="empty-state-text">Sin ventas en este período{channel !== "all" ? ` en ${SALE_CHANNEL_LABEL[channel]}` : ""}</span></div>
            )}
            {list?.rows.map((r) => {
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
                  <span role="cell"><span className={`sale-channel sale-channel--${r.channel}`}><Icon size={13} aria-hidden /> {SALE_CHANNEL_LABEL[r.channel]}</span></span>
                  <span role="cell" className="sales-title">
                    {saleTitle(r)}
                    {r.channel === "salon" && r.guests ? <span className="sale-line-sub"> · {r.guests} com.</span> : null}
                    {r.channel === "app" && orderModeLabel(r.orderMode ?? undefined) && <span className="sale-line-sub"> · {orderModeLabel(r.orderMode ?? undefined)}</span>}
                  </span>
                  <span role="cell" className="sales-items">{r.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</span>
                  <span role="cell" className="sales-pay">{paymentSummary(r)}</span>
                  <span role="cell" className="sales-right sale-money">
                    {r.voided && <span className="sale-voided">Anulada</span>} {showMoney ? money(r.total) : `${r.items.reduce((s, i) => s + i.quantity, 0)} u.`}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="sales-pager">
            <span className="text-sm text-muted">{list?.total ?? 0} ventas</span>
            <button type="button" className="btn btn-secondary psel-page-btn" disabled={page === 0 || loading} onClick={() => setPage(page - 1)} aria-label="Página anterior">
              <ChevronLeft size={18} aria-hidden />
            </button>
            <span className="psel-page">{page + 1} / {pageCount}</span>
            <button type="button" className="btn btn-secondary psel-page-btn" disabled={page >= pageCount - 1 || loading} onClick={() => setPage(page + 1)} aria-label="Página siguiente">
              <ChevronRight size={18} aria-hidden />
            </button>
          </div>
        </div>
      ) : (
        <div className="sales-breakdown" role="tabpanel">
          {breakdown.length === 0 && <div className="empty-state"><span className="empty-state-text">Sin datos en este período</span></div>}
          {breakdown.map((b) => {
            const v = showMoney ? b.amount ?? 0 : Number.parseInt(b.qty, 10) || 0
            return (
              <div key={b.key} className="sales-break-row">
                <span className="sales-break-label">{b.label}</span>
                <span className="sales-break-bar" aria-hidden><i style={{ width: `${(v / breakdownMax) * 100}%` }} /></span>
                <span className="text-muted">{b.qty}</span>
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
