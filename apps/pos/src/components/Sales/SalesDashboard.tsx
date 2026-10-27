import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import type { Order, Table } from "@takeasygo/types"
import { ChevronLeft, ChevronRight, Search, UtensilsCrossed, Store, Smartphone, Bike } from "lucide-react"
import { useLayout } from "../layout/LayoutContext"
import { useAuth } from "../../hooks/useAuth"
import { db } from "../../db/dexie"
import { formatCurrency, formatTime } from "../../utils/format"
import { VOID_REASONS, VOID_REASON_LABELS, type VoidReason } from "@takeasygo/business/browser"
import { voidOrder } from "../../services/order"
import { isPosApiError } from "../../services/pos-api"
import { formatPaymentMethod } from "../../services/payment"
import {
  SALE_CHANNEL_LABEL,
  deliveryPlatformLabel,
  orderModeLabel,
  saleChannelOf,
  type SaleChannel,
} from "../../services/channels"

// ============================================================================
// Contexto Ventas (observación UI/UX 24/10)
// ============================================================================
// Antes: cada venta era una tarjeta a todo el ancho titulada «Mesa <uuid>»
// (el id interno de la mesa, también en ventas de Mostrador o de la App), sin
// paginar, y el panel de detalle se desbordaba con scroll horizontal.
// Ahora:
//   · Lista densa (una fila por venta) PAGINADA al alto real del workspace:
//     hora · canal · quién (Mesa 4 / Mostrador #A1B2C3 / App · Para retirar)
//     · productos · pago · total.
//   · Canal claro con ícono y color: Salón, Mostrador, App, Delivery externo.
//   · Filtros compactos (período, canal con conteo, búsqueda).
//   · Detalle completo en el Context Panel: canal, mesa y sector o modo de la
//     App, fecha y hora, productos con opciones, nota, curso y descuento,
//     subtotal, descuentos, total, pagos por método y anulación. Sin desborde.
// ============================================================================

type Period = "today" | "week" | "month"
type ChannelFilter = "all" | SaleChannel

const PERIOD_LABEL: Record<Period, string> = { today: "Hoy", week: "Esta semana", month: "Este mes" }
const CHANNEL_ICON: Record<SaleChannel, typeof Store> = { salon: UtensilsCrossed, mostrador: Store, app: Smartphone, delivery: Bike }
const COURSE_LABEL: Record<string, string> = { entrada: "Entrada", principal: "Principal", postre: "Postre" }
const ROW_H = 56

function shortCode(id: string): string {
  return id.replace(/-/g, "").slice(0, 6).toUpperCase()
}

/** Quién / dónde: lo que el operador reconoce de un vistazo. */
function saleTitle(order: Order, channel: SaleChannel, tables: Map<string, Table>): string {
  if (channel === "salon") {
    const table = order.tableId ? tables.get(order.tableId) : undefined
    return table ? `Mesa ${table.number}` : "Mesa (eliminada)"
  }
  if (channel === "mostrador") return `Mostrador #${shortCode(order.id)}`
  if (channel === "delivery") return `${deliveryPlatformLabel(order.channel) ?? "Delivery"} #${shortCode(order.externalOrderId ?? order.id)}`
  return `App #${shortCode(order.externalOrderId ?? order.id)}`
}

function paymentSummary(order: Order): string {
  if (order.payments?.length) {
    return [...new Set(order.payments.map((p) => formatPaymentMethod(p.method).name))].join(" + ")
  }
  if (order.paymentMethod) return formatPaymentMethod(order.paymentMethod).name
  return "—"
}

export function SalesDashboard() {
  const { state } = useAuth()
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined
  const [period, setPeriod] = useState<Period>("today")
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null)
  // Anular venta (Fase 1 de caja): motivo en el mismo panel, sin pantalla nueva.
  const [voiding, setVoiding] = useState(false)
  const [voidReason, setVoidReason] = useState<VoidReason | null>(null)
  const [voidBusy, setVoidBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null)
  const [rowsPerPage, setRowsPerPage] = useState(8)
  const listRef = useRef<HTMLDivElement>(null)
  const { setContextPanel, setActionBar } = useLayout()

  const orders = useLiveQuery(
    () => (tenantId ? db.orders.where("tenantId").equals(tenantId).toArray() : []),
    [tenantId]
  )
  const tablesLive = useLiveQuery(
    () => (tenantId ? db.diningTable.where("tenantId").equals(tenantId).toArray() : []),
    [tenantId]
  )
  const tables = useMemo(() => new Map((tablesLive ?? []).map((t) => [t.id, t])), [tablesLive])
  const loading = orders === undefined

  // Ventas = pedidos entregados (los externos, una vez integrados por la caja).
  const completedOrders = useMemo(
    () => (orders ?? [])
      .filter((o) => o.status === "delivered" && !(o.source === "external" && !o.integratedAt))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [orders]
  )

  const [now] = useState(() => new Date())
  const inPeriod = useMemo(() => {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = new Date(todayStart)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const start = period === "today" ? todayStart : period === "week" ? weekStart : monthStart
    return completedOrders.filter((o) => new Date(o.createdAt) >= start)
  }, [completedOrders, period, now])

  const channelCounts = useMemo(() => {
    const counts: Record<ChannelFilter, number> = { all: inPeriod.length, salon: 0, mostrador: 0, app: 0, delivery: 0 }
    for (const o of inPeriod) counts[saleChannelOf(o)]++
    return counts
  }, [inPeriod])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return inPeriod.filter((o) => {
      const channel = saleChannelOf(o)
      if (channelFilter !== "all" && channel !== channelFilter) return false
      if (!q) return true
      const hay = `${saleTitle(o, channel, tables)} ${o.items.map((i) => i.name).join(" ")}`.toLowerCase()
      return hay.includes(q)
    })
  }, [inPeriod, channelFilter, query, tables])

  const metrics = useMemo(() => {
    const valid = filtered.filter((o) => !o.voided)
    const revenue = valid.reduce((s, o) => s + o.total, 0)
    return {
      count: valid.length,
      revenue,
      avg: valid.length > 0 ? Math.round(revenue / valid.length) : 0,
      voided: filtered.length - valid.length,
    }
  }, [filtered])

  // ── Paginado al alto real (nunca scroll) ────────────────────────────────
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    const measure = () => setRowsPerPage(Math.max(3, Math.floor(el.getBoundingClientRect().height / ROW_H)))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [loading])
  const pageCount = Math.max(1, Math.ceil(filtered.length / rowsPerPage))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = filtered.slice(safePage * rowsPerPage, safePage * rowsPerPage + rowsPerPage)

  const resetPaging = () => { setPage(0); setSelectedOrder(null) }

  const flash = useCallback((kind: "success" | "error", text: string) => {
    setNotice({ kind, text })
    setTimeout(() => setNotice(null), 4000)
  }, [])

  const handleVoid = useCallback(async (orderId: string) => {
    if (!tenantId || !voidReason) return
    setVoidBusy(true)
    try {
      await voidOrder(tenantId, orderId, voidReason)
      flash("success", "Venta anulada. La devolución quedó registrada en la caja.")
      setVoiding(false)
      setVoidReason(null)
    } catch (err) {
      if (!(isPosApiError(err) && err.code === "approval_cancelled")) {
        flash("error", err instanceof Error ? err.message : "No se pudo anular la venta")
      }
    } finally {
      setVoidBusy(false)
    }
  }, [tenantId, voidReason, flash])

  // ── Context Panel: resumen o detalle de la venta ─────────────────────────
  useEffect(() => {
    if (loading) {
      setContextPanel({ title: "Ventas", subtitle: "Cargando...", body: <div className="loading-state"><span className="spinner" /></div> })
      setActionBar(null)
      return
    }
    const order = selectedOrder ? (orders ?? []).find((o) => o.id === selectedOrder) : undefined
    if (!order) {
      setContextPanel({
        title: "Resumen",
        subtitle: `${PERIOD_LABEL[period]} · ${channelFilter === "all" ? "Todos los canales" : SALE_CHANNEL_LABEL[channelFilter]}`,
        body: (
          <div className="sale-detail">
            <div className="sale-kpis">
              <div><span>Ventas</span><strong>{metrics.count}</strong></div>
              <div><span>Ingresos</span><strong className="text-success">{formatCurrency(metrics.revenue)}</strong></div>
              <div><span>Ticket promedio</span><strong>{formatCurrency(metrics.avg)}</strong></div>
              {metrics.voided > 0 && <div><span>Anuladas</span><strong className="text-error">{metrics.voided}</strong></div>}
            </div>
            <div className="sale-section-title">Por canal</div>
            {(["salon", "mostrador", "app", "delivery"] as SaleChannel[]).map((c) => {
              const Icon = CHANNEL_ICON[c]
              const list = inPeriod.filter((o) => saleChannelOf(o) === c && !o.voided)
              return (
                <div key={c} className="sale-channel-row">
                  <span className={`sale-channel sale-channel--${c}`}><Icon size={14} aria-hidden /> {SALE_CHANNEL_LABEL[c]}</span>
                  <span className="text-muted">{list.length}</span>
                  <span className="sale-money">{formatCurrency(list.reduce((s, o) => s + o.total, 0))}</span>
                </div>
              )
            })}
            <p className="text-sm text-muted" style={{ marginTop: "var(--sp-3)" }}>Tocá una venta para ver su detalle.</p>
          </div>
        ),
      })
      setActionBar(null)
      return
    }

    const channel = saleChannelOf(order)
    const Icon = CHANNEL_ICON[channel]
    const table = order.tableId ? tables.get(order.tableId) : undefined
    const discounts = order.items.reduce((s, i) => s + (i.discount?.amount ?? 0), 0)
    const created = new Date(order.createdAt)
    setContextPanel({
      title: saleTitle(order, channel, tables),
      subtitle: `${created.toLocaleDateString("es-AR")} · ${formatTime(created)} · ${formatCurrency(order.total)}`,
      body: (
        <div className="sale-detail">
          <div className="sale-tags">
            <span className={`sale-channel sale-channel--${channel}`}><Icon size={14} aria-hidden /> {SALE_CHANNEL_LABEL[channel]}</span>
            {order.voided && <span className="sale-voided">Anulada</span>}
          </div>
          <dl className="sale-facts">
            {channel === "salon" && <div><dt>Mesa</dt><dd>{table ? `${table.number}${table.section ? ` · ${table.section}` : ""}` : "Mesa eliminada"}</dd></div>}
            {(channel === "app" || channel === "delivery") && orderModeLabel(order.orderMode) && <div><dt>Modo</dt><dd>{orderModeLabel(order.orderMode)}</dd></div>}
            {channel === "delivery" && <div><dt>Plataforma</dt><dd>{deliveryPlatformLabel(order.channel) ?? "—"}</dd></div>}
            <div><dt>Código</dt><dd>#{shortCode(order.externalOrderId ?? order.id)}</dd></div>
            <div><dt>Fecha</dt><dd>{created.toLocaleDateString("es-AR")} {formatTime(created)}</dd></div>
            <div><dt>Productos</dt><dd>{order.items.reduce((s, i) => s + i.quantity, 0)}</dd></div>
          </dl>

          <div className="sale-section-title">Detalle</div>
          <ul className="sale-lines">
            {order.items.map((item, i) => (
              <li key={item.lineId ?? i}>
                <span className="sale-qty">{item.quantity}×</span>
                <div className="sale-line-main">
                  <span className="sale-line-name">
                    {item.course && <span className="order-item-course">{COURSE_LABEL[item.course]}</span>}
                    {item.name}
                  </span>
                  {item.modifiers?.length ? <span className="sale-line-sub">{item.modifiers.map((m) => m.name).join(" · ")}</span> : null}
                  {item.notes && <span className="sale-line-note">{item.notes}</span>}
                  {item.discount && <span className="sale-line-disc">Descuento {item.discount.kind === "percent" ? `${item.discount.value}% ` : ""}−{formatCurrency(item.discount.amount)}</span>}
                </div>
                <span className="sale-money">{formatCurrency(item.total)}</span>
              </li>
            ))}
          </ul>

          <div className="sale-totals">
            {discounts > 0 && <div><span>Subtotal</span><span>{formatCurrency(order.total + discounts)}</span></div>}
            {discounts > 0 && <div><span>Descuentos</span><span className="text-success">−{formatCurrency(discounts)}</span></div>}
            <div className="sale-grand"><span>Total</span><span>{formatCurrency(order.total)}</span></div>
          </div>

          <div className="sale-section-title">Pago</div>
          {order.payments?.length ? (
            <ul className="sale-payments">
              {order.payments.map((p, i) => (
                <li key={i}>
                  <span>{formatPaymentMethod(p.method).icon} {formatPaymentMethod(p.method).name}{p.reference ? <span className="sale-line-sub"> · {p.reference}</span> : null}</span>
                  <span className="sale-money">{formatCurrency(p.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm">{order.paymentMethod ? `${formatPaymentMethod(order.paymentMethod).name} (pagado en la App)` : "Sin detalle de pago"}</p>
          )}

          {order.voided && (
            <div className="sale-void-info">
              Anulada el {new Date(order.voided.at).toLocaleString("es-AR")} — {VOID_REASON_LABELS[order.voided.reason as VoidReason] ?? order.voided.reason}
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
              <p className="cash-help">Se devuelve {formatCurrency(order.total)} y queda en el cierre de caja. Un cajero necesita el PIN del encargado.</p>
            </div>
          )}
        </div>
      ),
    })
    // Solo ventas cobradas en el POS se anulan acá (las online se gestionan en el SaaS).
    const canVoid = order.paymentSource === "pos_charged" && !order.voided
    setActionBar({
      left: (
        <button className="btn btn-ghost" onClick={() => (voiding ? setVoiding(false) : setSelectedOrder(null))}>
          {voiding ? "Cancelar" : "← Volver al resumen"}
        </button>
      ),
      right: canVoid ? (
        voiding ? (
          <button className="btn btn-danger" disabled={!voidReason || voidBusy} onClick={() => handleVoid(order.id)}>Anular y devolver</button>
        ) : (
          <button className="btn btn-secondary" onClick={() => setVoiding(true)}>Anular venta</button>
        )
      ) : undefined,
    })
  }, [loading, selectedOrder, period, channelFilter, metrics, inPeriod, orders, tables, voiding, voidReason, voidBusy, handleVoid, setContextPanel, setActionBar])

  return (
    <div className="workspace sales">
      <div className="sales-toolbar">
        <div className="sales-chips" role="group" aria-label="Período">
          {(["today", "week", "month"] as Period[]).map((p) => (
            <button key={p} type="button" className={`sales-chip${period === p ? " active" : ""}`} aria-pressed={period === p}
              onClick={() => { setPeriod(p); resetPaging() }}>
              {p === "today" ? "Hoy" : p === "week" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>
        <div className="sales-chips" role="group" aria-label="Canal">
          {(["all", "salon", "mostrador", "app", "delivery"] as ChannelFilter[]).map((c) => (
            <button key={c} type="button" className={`sales-chip${channelFilter === c ? " active" : ""}`} aria-pressed={channelFilter === c}
              onClick={() => { setChannelFilter(c); resetPaging() }}>
              {c === "all" ? "Todos" : SALE_CHANNEL_LABEL[c]} <span className="sales-chip-count">{channelCounts[c]}</span>
            </button>
          ))}
        </div>
        <label className="sales-search">
          <Search size={16} aria-hidden />
          <input type="search" value={query} placeholder="Mesa, código o producto…" aria-label="Buscar venta"
            onChange={(e) => { setQuery(e.target.value); setPage(0) }} />
        </label>
      </div>

      <div className="sales-kpis" role="status">
        <div><span>Ventas</span><strong>{metrics.count}</strong></div>
        <div><span>Ingresos</span><strong>{formatCurrency(metrics.revenue)}</strong></div>
        <div><span>Ticket promedio</span><strong>{formatCurrency(metrics.avg)}</strong></div>
        {metrics.voided > 0 && <div><span>Anuladas</span><strong className="text-error">{metrics.voided}</strong></div>}
      </div>

      <div className="sales-table" role="table" aria-label="Ventas">
        <div className="sales-row sales-row--head" role="row">
          <span role="columnheader">Hora</span>
          <span role="columnheader">Canal</span>
          <span role="columnheader">Venta</span>
          <span role="columnheader">Productos</span>
          <span role="columnheader">Pago</span>
          <span role="columnheader" className="sales-right">Total</span>
        </div>
        <div className="sales-rows" ref={listRef}>
          {loading && <div className="loading-state"><span className="spinner" /> Cargando...</div>}
          {!loading && filtered.length === 0 && (
            <div className="empty-state">
              <span className="empty-state-text">Sin ventas {PERIOD_LABEL[period].toLowerCase()}{channelFilter !== "all" ? ` en ${SALE_CHANNEL_LABEL[channelFilter]}` : ""}</span>
            </div>
          )}
          {pageRows.map((order) => {
            const channel = saleChannelOf(order)
            const Icon = CHANNEL_ICON[channel]
            const selected = selectedOrder === order.id
            return (
              <button
                key={order.id}
                type="button"
                role="row"
                className={`sales-row${selected ? " selected" : ""}${order.voided ? " voided" : ""}`}
                aria-selected={selected}
                onClick={() => { setSelectedOrder(selected ? null : order.id); setVoiding(false); setVoidReason(null) }}
              >
                <span role="cell" className="sales-time">{formatTime(new Date(order.createdAt))}</span>
                <span role="cell"><span className={`sale-channel sale-channel--${channel}`}><Icon size={13} aria-hidden /> {SALE_CHANNEL_LABEL[channel]}</span></span>
                <span role="cell" className="sales-title">
                  {saleTitle(order, channel, tables)}
                  {channel === "app" && orderModeLabel(order.orderMode) && <span className="sale-line-sub"> · {orderModeLabel(order.orderMode)}</span>}
                </span>
                <span role="cell" className="sales-items">{order.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</span>
                <span role="cell" className="sales-pay">{paymentSummary(order)}</span>
                <span role="cell" className="sales-right sale-money">
                  {order.voided && <span className="sale-voided">Anulada</span>} {formatCurrency(order.total)}
                </span>
              </button>
            )
          })}
        </div>
        <div className="sales-pager">
          <span className="text-sm text-muted">{filtered.length} ventas</span>
          <button type="button" className="btn btn-secondary psel-page-btn" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label="Página anterior">
            <ChevronLeft size={18} aria-hidden />
          </button>
          <span className="psel-page">{safePage + 1} / {pageCount}</span>
          <button type="button" className="btn btn-secondary psel-page-btn" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} aria-label="Página siguiente">
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
      </div>

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
