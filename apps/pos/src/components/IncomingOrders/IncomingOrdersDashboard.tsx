import { useState, useEffect, useCallback, useMemo } from "react"
import type { Order } from "@takeasygo/types"
import { useAuth } from "../../hooks/useAuth"
import { useLayout } from "../layout/LayoutContext"
import { formatCurrency, timeAgo, formatOrderStatus } from "../../utils/format"
import { onSocketEvent, connectSocket } from "../../services/socket-client"

const SYNC_URL = import.meta.env.VITE_SYNC_URL ?? "http://localhost:3001"

type Filter = "all" | "pending" | "confirmed" | "preparing" | "ready"

export function IncomingOrdersDashboard() {
  const { state } = useAuth()
  const jwt = state.status === "authenticated" ? state.jwt?.accessToken : undefined

  const { setContextPanel, setActionBar } = useLayout()
  const [orders, setOrders] = useState<Order[]>([])
  const [filter, setFilter] = useState<Filter>("all")
  const [connected, setConnected] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null)

  const showToast = useCallback((message: string, type: string) => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }, [])

  useEffect(() => {
    if (!jwt) return

    const socket = connectSocket(jwt)

    socket.on("connect", () => setConnected(true))
    socket.on("disconnect", () => setConnected(false))

    const unsubCreated = onSocketEvent("order:created", (data: unknown) => {
      const event = data as { orderId: string; items: unknown[]; total: number }
      setOrders((prev) => {
        const newOrder: Order = {
          id: event.orderId,
          tenantId: "",
          source: "takeasygo",
          status: "pending",
          items: event.items as Order["items"],
          total: event.total,
          menuVersion: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        return [newOrder, ...prev]
      })
      showToast("Nuevo pedido recibido", "info")
    })

    const unsubConfirmed = onSocketEvent("order:confirmed", (data: unknown) => {
      const event = data as { orderId: string }
      setOrders((prev) =>
        prev.map((o) =>
          o.id === event.orderId
            ? { ...o, status: "confirmed" as const, updatedAt: new Date() }
            : o
        )
      )
    })

    return () => {
      unsubCreated()
      unsubConfirmed()
    }
  }, [jwt, showToast])

  const handleConfirmOrder = useCallback(async (orderId: string) => {
    try {
      const res = await fetch(`${SYNC_URL}/api/v1/orders/${orderId}/confirm`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}` },
      })
      if (!res.ok) throw new Error(`Confirm failed (${res.status})`)

      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, status: "confirmed" as const, updatedAt: new Date() }
            : o
        )
      )
      showToast("Pedido confirmado", "success")
    } catch {
      showToast("Error al confirmar", "error")
    }
  }, [jwt, showToast])

  const handleConfirmAllPaid = useCallback(() => {
    const pendingPaid = orders.filter(
      (o) => o.status === "pending"
    )
    pendingPaid.forEach((o) => handleConfirmOrder(o.id))
  }, [orders, handleConfirmOrder])

  const filteredOrders = useMemo(() => {
    if (filter === "all") return orders
    return orders.filter((o) => o.status === filter)
  }, [orders, filter])

  const pendingCount = useMemo(
    () => orders.filter((o) => o.status === "pending").length,
    [orders]
  )

  const formatOrderItems = (items: Order["items"]) =>
    items.map((i) => `${i.quantity}× ${i.name}`).join(", ")

  // ==========================================================================
  // Context Panel + ActionBar
  // ==========================================================================

  useEffect(() => {
    setContextPanel({
      title: "Pedidos entrantes",
      subtitle: connected ? "● Conectado en tiempo real" : "○ Desconectado — modo offline",
      body: (
        <div style={{ padding: "var(--sp-2)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
            <div>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Total
              </div>
              <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: "var(--text-structure)" }}>
                {orders.length}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Pendientes
              </div>
              <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: pendingCount > 0 ? "var(--warning)" : "var(--text-structure)" }}>
                {pendingCount}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Filtro activo
              </div>
              <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--text-structure)" }}>
                {formatOrderStatus(filter)}
              </div>
            </div>
          </div>
        </div>
      ),
    })

    setActionBar({
      right: pendingCount > 0 ? (
        <button className="btn btn-primary btn-sm" onClick={handleConfirmAllPaid}>
          Confirmar todos pagados
        </button>
      ) : undefined,
    })

    return () => {
      setContextPanel(null)
      setActionBar(null)
    }
  }, [connected, orders.length, pendingCount, filter, setContextPanel, setActionBar, handleConfirmAllPaid])

  return (
    <>
      <div className="workspace-header">
        <div>
          <div className="workspace-title">Pedidos entrantes</div>
          <div className="workspace-subtitle">
            {filteredOrders.length} pedidos {filter !== "all" ? formatOrderStatus(filter) : ""}
          </div>
        </div>
        <div className="workspace-actions">
          <div className="flex gap-2">
            {(["all", "pending", "confirmed", "ready"] as Filter[]).map((f) => (
              <button
                key={f}
                className={`category-tab ${filter === f ? "active" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "Todos" : formatOrderStatus(f)}
                {f === "pending" && pendingCount > 0 && (
                  <span className="nav-item-badge" style={{ marginLeft: 6 }}>
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-6" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {filteredOrders.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon">📦</span>
            <span className="empty-state-text">
              No hay pedidos {filter !== "all" ? formatOrderStatus(filter) : ""}
            </span>
          </div>
        ) : (
          <div className="orders-list">
            {filteredOrders.map((order) => (
              <div key={order.id} className="order-card">
                <div className="order-card-main">
                  <div className="order-card-header">
                    <span className="order-card-id">#{order.id.slice(0, 8)}</span>
                    <span className={`status-badge ${order.status}`}>
                      {formatOrderStatus(order.status)}
                    </span>
                    <span className="order-card-time">{timeAgo(order.createdAt)}</span>
                  </div>
                  <div className="order-card-items">{formatOrderItems(order.items)}</div>
                </div>
                <div className="order-card-total">{formatCurrency(order.total)}</div>
                <div className="order-card-actions">
                  {order.status === "pending" && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleConfirmOrder(order.id)}
                    >
                      Confirmar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>
            <span className="toast-message">{toast.message}</span>
            <button className="toast-close" onClick={() => setToast(null)}>
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  )
}
