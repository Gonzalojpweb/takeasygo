import { useState, useMemo, useCallback, useEffect } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { useLayout } from "../layout/LayoutContext"
import { useAuth } from "../../hooks/useAuth"
import { db } from "../../db/dexie"
import { formatCurrency, formatTime } from "../../utils/format"

type Period = "today" | "week" | "month"

export function SalesDashboard() {
  const { state } = useAuth()
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined
  const [period, setPeriod] = useState<Period>("today")
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null)
  const { setContextPanel, setActionBar } = useLayout()

  const orders = useLiveQuery(
    () => (tenantId ? db.orders.where("tenantId").equals(tenantId).toArray() : []),
    [tenantId]
  )

  const loading = orders === undefined

  const completedOrders = useMemo(
    () => (orders ?? []).filter((o) => {
      if (o.status === "cancelled") return false
      // Solo pedidos entregados aparecen en Ventas para reporte de ventas
      if (o.status !== "delivered") return false
      // Excluir pedidos externos que aún no fueron integrados por el cajero.
      if (o.source === "external" && !o.integratedAt) return false
      return true
    }),
    [orders]
  )

  const now = useMemo(() => new Date(), [])

  const periodOrders = useMemo(() => {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = new Date(todayStart)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const start = period === "today" ? todayStart : period === "week" ? weekStart : monthStart
    return completedOrders.filter((o) => new Date(o.createdAt) >= start)
  }, [completedOrders, period, now])

  const metrics = useMemo(() => {
    const totalSales = periodOrders.length
    const totalRevenue = periodOrders.reduce((s, o) => s + o.total, 0)
    const avgTicket = totalSales > 0 ? Math.round(totalRevenue / totalSales) : 0
    return { totalSales, totalRevenue, avgTicket }
  }, [periodOrders])

  const handleSelectOrder = useCallback((orderId: string) => {
    setSelectedOrder(orderId === selectedOrder ? null : orderId)
  }, [selectedOrder])

  useEffect(() => {
    if (loading) {
      setContextPanel({
        title: "Ventas",
        subtitle: "Cargando...",
        body: <div className="loading-state"><span className="spinner" /></div>,
      })
      setActionBar(null)
      return
    }

    if (selectedOrder) {
      const order = (orders ?? []).find((o) => o.id === selectedOrder)
      if (order) {
        setContextPanel({
          title: `Mesa ${order.tableId ?? "—"}`,
          subtitle: `${formatOrderStatus(order.status)} — ${formatCurrency(order.total)}`,
          body: (
            <div style={{ padding: "var(--sp-2)" }}>
              {order.items.map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "var(--sp-1) 0", borderBottom: "1px solid var(--border)" }}>
                  <div>
                    <span style={{ fontSize: "var(--font-size-sm)" }}>{item.quantity}x {item.name}</span>
                    {item.modifiers?.map((m, j) => (
                      <div key={j} style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", paddingLeft: "var(--sp-3)" }}>
                        + {m.name} ${m.price}
                      </div>
                    ))}
                  </div>
                  <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)" }}>{formatCurrency(item.total)}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "var(--sp-2)", paddingTop: "var(--sp-2)", borderTop: "2px solid var(--text-primary)", fontWeight: 700, fontSize: "var(--font-size-lg)" }}>
                <span>Total</span>
                <span>{formatCurrency(order.total)}</span>
              </div>
            </div>
          ),
        })
      }
      setActionBar({
        left: (
          <button className="btn btn-ghost" onClick={() => setSelectedOrder(null)}>
            ← Volver
          </button>
        ),
      })
    } else {
      setContextPanel({
        title: "Resumen de ventas",
        subtitle: `${period === "today" ? "Hoy" : period === "week" ? "Esta semana" : "Este mes"} — ${metrics.totalSales} ventas`,
        body: (
          <div style={{ padding: "var(--sp-3)" }}>
            <div style={{ display: "flex", justifyContent: "space-around", marginBottom: "var(--sp-4)" }}>
              {(["today", "week", "month"] as Period[]).map((p) => (
                <button
                  key={p}
                  className={`btn btn-sm ${period === p ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setPeriod(p)}
                >
                  {p === "today" ? "Hoy" : p === "week" ? "Semana" : "Mes"}
                </button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--sp-2)", marginBottom: "var(--sp-4)" }}>
              <div className="card" style={{ textAlign: "center", padding: "var(--sp-3)" }}>
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>Ventas</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{metrics.totalSales}</div>
              </div>
              <div className="card" style={{ textAlign: "center", padding: "var(--sp-3)" }}>
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>Ingresos</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "var(--success)" }}>{formatCurrency(metrics.totalRevenue)}</div>
              </div>
              <div className="card" style={{ textAlign: "center", padding: "var(--sp-3)" }}>
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>Ticket prom.</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{formatCurrency(metrics.avgTicket)}</div>
              </div>
            </div>
          </div>
        ),
      })
      setActionBar(null)
    }
  }, [loading, selectedOrder, period, metrics, periodOrders, orders, setContextPanel, setActionBar])

  const PERIOD_LABEL = { today: "Hoy", week: "Esta semana", month: "Este mes" }

  return (
    <div className="workspace">
      <div className="workspace-header">
        <div>
          <div className="workspace-title">Ventas</div>
          <div className="workspace-subtitle">{PERIOD_LABEL[period]} — {metrics.totalSales} ventas, {formatCurrency(metrics.totalRevenue)}</div>
        </div>
        <div className="workspace-actions">
          {(["today", "week", "month"] as Period[]).map((p) => (
            <button
              key={p}
              className={`category-tab ${period === p ? "active" : ""}`}
              onClick={() => { setPeriod(p); setSelectedOrder(null) }}
            >
              {p === "today" ? "Hoy" : p === "week" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {loading && (
          <div className="loading-state">
            <span className="spinner" />
            Cargando...
          </div>
        )}

        {!loading && periodOrders.length === 0 && (
          <div className="empty-state">
            <span className="empty-state-icon">📊</span>
            <span className="empty-state-text">Sin ventas {PERIOD_LABEL[period].toLowerCase()}</span>
          </div>
        )}

        {!loading && periodOrders.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {periodOrders.map((order) => (
              <div
                key={order.id}
                className={`order-card ${selectedOrder === order.id ? "selected" : ""}`}
                onClick={() => handleSelectOrder(order.id)}
              >
                <div className="order-card-main">
                  <div className="order-card-header">
                    <span className="order-card-id">
                      Mesa {order.tableId ?? "—"}
                      {order.source === "external" && (
                        <span style={{
                          marginLeft: 6,
                          fontSize: "var(--font-size-xs)",
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: "var(--info-bg, #e3f2fd)",
                          color: "var(--info, #1976d2)",
                          fontWeight: 600,
                          verticalAlign: "middle",
                        }}>
                          Externo
                        </span>
                      )}
                    </span>
                    <span className="status-badge" style={{
                      background: order.status === "delivered" ? "var(--success-bg, #e6f7e6)" : "var(--surface-secondary)",
                      color: order.status === "delivered" ? "var(--success)" : "var(--text-secondary)",
                    }}>
                      {formatOrderStatus(order.status)}
                    </span>
                  </div>
                  <div className="order-card-items">
                    {order.items.length} ítems — {formatTime(new Date(order.createdAt))}
                  </div>
                </div>
                <div className="order-card-total">{formatCurrency(order.total)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function formatOrderStatus(status: string): string {
  const map: Record<string, string> = {
    pending: "Pendiente",
    confirmed: "Confirmado",
    preparing: "Preparando",
    ready: "Listo",
    delivered: "Entregado",
    cancelled: "Cancelado",
  }
  return map[status] ?? status
}
