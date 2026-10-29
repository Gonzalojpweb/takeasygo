import { useCallback, useEffect, useMemo, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { UtensilsCrossed, Store, Smartphone, Bike, RefreshCw } from "lucide-react"
import { useAuth } from "../../hooks/useAuth"
import { useTables } from "../../hooks/useTables"
import { useLayout } from "../layout/LayoutContext"
import { useReservations } from "../../hooks/useReservations"
import { db } from "../../db/dexie"
import { formatCurrency } from "../../utils/format"
import { formatPaymentMethod } from "../../services/payment"
import { isAppOrder } from "../../services/channels"
import { getSalesReport, shiftDate, type SaleChannel, type SalesReport } from "../../services/reports"
import { HourlyChart } from "./HourlyChart"

// ============================================================================
// Resumen del día — dashboard del POS (Fase H, 2026-10)
// ============================================================================
// Datos que importan EN EL POS (nada de recorrido de usuarios de la app):
//   · KPIs del día: ingresos, ventas, ticket promedio, comensales y ticket
//     por comensal (los dos últimos son KPIs obligatorios del POS).
//   · Por canal, siempre separado: Salón · Mostrador · App · Delivery. Un
//     comercio con solo POS ve App/Delivery en 0; uno con solo App, Salón y
//     Mostrador en 0. Nunca se mezclan sin desglose.
//   · Tendencia por hora vs el mismo día de la semana pasada.
//   · Top productos, métodos de pago y categorías.
//   · Context Panel: «Ahora en el local» (mesas, comensales sentados, cuentas
//     pedidas, pedidos de la App en curso, para entregar, reservas).
// Números del SERVIDOR (lib/metrics/sales): iguales en todos los equipos.
// El cajero no ve ingresos (llegan en null): se muestran cantidades.
// ============================================================================

const POLL_MS = 60_000
const CHANNELS: { id: SaleChannel; label: string; icon: typeof Store }[] = [
  { id: "salon", label: "Salón", icon: UtensilsCrossed },
  { id: "mostrador", label: "Mostrador", icon: Store },
  { id: "app", label: "App TakeasyGO", icon: Smartphone },
  { id: "delivery", label: "Delivery externo", icon: Bike },
]

function pctChange(now: number, before: number): string | null {
  if (!before) return null
  const p = Math.round(((now - before) / before) * 100)
  return `${p > 0 ? "+" : ""}${p}% vs sem. pasada`
}

export function SummaryDashboard() {
  const { state } = useAuth()
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined
  const { tables } = useTables()
  const { reservations } = useReservations(tenantId)
  const { setContextPanel, setActionBar } = useLayout()
  const [today, setToday] = useState<SalesReport | null>(null)
  const [lastWeek, setLastWeek] = useState<SalesReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const load = useCallback(async () => {
    if (!tenantId) return
    try {
      const t = await getSalesReport(tenantId)
      const prev = shiftDate(t.range.from, -7)
      const w = await getSalesReport(tenantId, { from: prev, to: prev })
      setToday(t)
      setLastWeek(w)
      setError(null)
      setUpdatedAt(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las métricas")
    }
  }, [tenantId])

  useEffect(() => {
    const first = setTimeout(() => { void load() }, 0)
    const id = setInterval(() => { void load() }, POLL_MS)
    return () => { clearTimeout(first); clearInterval(id) }
  }, [load])

  // ── Ahora en el local (tiempo real, caché local) ─────────────────────────
  const openOrders = useLiveQuery(
    () => (tenantId ? db.orders.where("tenantId").equals(tenantId).and((o) => o.status !== "delivered" && o.status !== "cancelled").toArray() : []),
    [tenantId]
  )
  const live = useMemo(() => {
    const occupied = tables.filter((t) => t.status === "occupied")
    const orders = openOrders ?? []
    return {
      occupied: occupied.length,
      total: tables.length,
      seated: occupied.reduce((s, t) => s + (t.guests ?? 0), 0),
      needsBill: tables.filter((t) => t.needsBill).length,
      appInProgress: orders.filter((o) => isAppOrder(o) && o.integratedAt).length,
      appWaiting: orders.filter((o) => isAppOrder(o) && !o.integratedAt).length,
      pickup: orders.filter((o) => o.source === "pos" && !o.tableId && o.status !== "pending").length,
      reservationsDue: reservations.filter((r) => r.status === "confirmed").length,
    }
  }, [tables, openOrders, reservations])

  useEffect(() => {
    setContextPanel({
      title: "Ahora en el local",
      subtitle: updatedAt ? `Actualizado ${updatedAt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}` : "Cargando…",
      body: (
        <div className="sale-detail">
          <div className="sale-kpis">
            <div><span>Mesas ocupadas</span><strong>{live.occupied} / {live.total}</strong></div>
            <div><span>Comensales sentados</span><strong>{live.seated}</strong></div>
            <div><span>Pidieron la cuenta</span><strong>{live.needsBill}</strong></div>
            <div><span>Reservas por llegar</span><strong>{live.reservationsDue}</strong></div>
            <div><span>App: por aceptar</span><strong>{live.appWaiting}</strong></div>
            <div><span>App: en curso</span><strong>{live.appInProgress}</strong></div>
            <div><span>Mostrador: para entregar</span><strong>{live.pickup}</strong></div>
          </div>
          <p className="text-sm text-muted">Estos datos son en tiempo real. Los números del día se recalculan cada minuto desde el servidor.</p>
        </div>
      ),
    })
    setActionBar({
      right: (
        <button className="btn btn-secondary" onClick={() => { void load() }}>
          <RefreshCw size={16} aria-hidden /> Actualizar
        </button>
      ),
    })
  }, [live, updatedAt, load, setContextPanel, setActionBar])

  if (!today) {
    return (
      <div className="summary">
        {error ? <div className="setup-error" role="alert">{error}</div> : <div className="loading-state"><span className="spinner" /> Cargando el resumen…</div>}
      </div>
    )
  }

  const m = today.metrics
  const w = lastWeek?.metrics
  const money = today.revenueVisible
  const totalSales = m.totals.sales || 1

  return (
    <div className="summary">
      {error && <div className="setup-error" role="alert">{error} — se muestran los últimos datos.</div>}

      <section className="summary-kpis" aria-label="Indicadores del día">
        {money && (
          <div className="summary-kpi summary-kpi--hero">
            <span>Ingresos hoy</span>
            <strong>{formatCurrency(m.totals.revenue ?? 0)}</strong>
            {w && pctChange(m.totals.revenue ?? 0, w.totals.revenue ?? 0) && <em>{pctChange(m.totals.revenue ?? 0, w.totals.revenue ?? 0)}</em>}
          </div>
        )}
        <div className="summary-kpi">
          <span>Ventas</span>
          <strong>{m.totals.sales}</strong>
          {w && pctChange(m.totals.sales, w.totals.sales) && <em>{pctChange(m.totals.sales, w.totals.sales)}</em>}
        </div>
        <div className="summary-kpi"><span>Ticket promedio</span><strong>{formatCurrency(m.totals.avgTicket)}</strong></div>
        <div className="summary-kpi"><span>Comensales</span><strong>{m.totals.guests}</strong><em>en salón</em></div>
        <div className="summary-kpi">
          <span>Ticket por comensal</span>
          <strong>{m.totals.perGuest !== null ? formatCurrency(m.totals.perGuest) : "—"}</strong>
        </div>
        {m.totals.voided.count > 0 && <div className="summary-kpi summary-kpi--warn"><span>Anuladas</span><strong>{m.totals.voided.count}</strong></div>}
      </section>

      <div className="summary-grid">
        <section className="summary-card summary-card--wide" aria-label="Tendencia por hora">
          <header className="summary-card-head">Tendencia por hora{money ? "" : " (cantidad de ventas)"}</header>
          <HourlyChart today={m.byHour} lastWeek={w?.byHour ?? []} byRevenue={money} />
        </section>

        <section className="summary-card" aria-label="Por canal">
          <header className="summary-card-head">Por canal</header>
          <ul className="summary-channels">
            {CHANNELS.map(({ id, label, icon: Icon }) => {
              const c = m.byChannel[id]
              const share = Math.round((c.sales / totalSales) * 100)
              return (
                <li key={id}>
                  <span className={`sale-channel sale-channel--${id}`}><Icon size={13} aria-hidden /> {label}</span>
                  <span className="summary-channel-nums">
                    <strong>{money ? formatCurrency(c.revenue ?? 0) : `${c.sales} ventas`}</strong>
                    <small>{money ? `${c.sales} ventas · ` : ""}ticket {formatCurrency(c.avgTicket)}{id === "salon" ? ` · ${c.guests} comensales` : ""}</small>
                  </span>
                  <span className="summary-share" aria-label={`${share}% de las ventas`}><i style={{ width: `${share}%` }} /></span>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="summary-card" aria-label="Más vendidos">
          <header className="summary-card-head">Más vendidos</header>
          <ol className="summary-list">
            {m.topProducts.slice(0, 6).map((p) => (
              <li key={p.name}><span>{p.name}</span><span className="text-muted">{p.quantity} u.</span>{money && <span className="sale-money">{formatCurrency(p.revenue ?? 0)}</span>}</li>
            ))}
            {m.topProducts.length === 0 && <li className="text-muted">Sin ventas todavía</li>}
          </ol>
        </section>

        <section className="summary-card" aria-label="Métodos de pago">
          <header className="summary-card-head">Métodos de pago</header>
          <ul className="summary-list">
            {m.byPayment.slice(0, 6).map((p) => (
              <li key={p.method}><span>{formatPaymentMethod(p.method as never).name}</span><span className="text-muted">{p.count}</span>{money && <span className="sale-money">{formatCurrency(p.amount ?? 0)}</span>}</li>
            ))}
            {m.byPayment.length === 0 && <li className="text-muted">Sin cobros todavía</li>}
          </ul>
        </section>

        <section className="summary-card" aria-label="Categorías">
          <header className="summary-card-head">Categorías</header>
          <ul className="summary-list">
            {m.byCategory.slice(0, 6).map((c) => (
              <li key={c.category}><span>{c.category}</span><span className="text-muted">{c.quantity} u.</span>{money && <span className="sale-money">{formatCurrency(c.revenue ?? 0)}</span>}</li>
            ))}
            {m.byCategory.length === 0 && <li className="text-muted">Sin ventas todavía</li>}
          </ul>
        </section>
      </div>
    </div>
  )
}
