import { useState, useEffect, useCallback, useMemo } from "react"
import type { Order } from "@takeasygo/types"
import { useAuth } from "../../hooks/useAuth"
import { useLayout } from "../layout/LayoutContext"
import { formatCurrency, timeAgo, formatOrderStatus } from "../../utils/format"
import { onSocketEvent, connectSocket } from "../../services/socket-client"
import { createOrder } from "../../services/order"

type Scene = "queue" | "validation" | "transform"
type Filter = "all" | "pending" | "confirmed" | "preparing" | "ready"

interface ValidationItem {
  productId: string
  name: string
  quantity: number
  unitPrice: number
  status: "valid" | "needs_attention"
  notes?: string
}

const SYNC_URL = import.meta.env.VITE_SYNC_URL

export function IncomingOrdersDashboard() {
  const { state } = useAuth()
  const jwt = state.status === "authenticated" ? state.jwt?.accessToken : undefined
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined

  const { setContextPanel, setActionBar } = useLayout()
  const [scene, setScene] = useState<Scene>("queue")
  const [orders, setOrders] = useState<Order[]>([])
  const [filter, setFilter] = useState<Filter>("all")
  const [connected, setConnected] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [validationItems, setValidationItems] = useState<ValidationItem[]>([])
  const [transformResult, setTransformResult] = useState<{ localOrderId: string } | null>(null)
  const [transforming, setTransforming] = useState(false)
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
      showToast("Pedido confirmado en origen", "success")
    } catch {
      showToast("Error al confirmar", "error")
    }
  }, [jwt, showToast])

  const handleConfirmAllPaid = useCallback(() => {
    const pendingPaid = orders.filter((o) => o.status === "pending")
    pendingPaid.forEach((o) => handleConfirmOrder(o.id))
  }, [orders, handleConfirmOrder])

  const handleSelectOrder = useCallback((orderId: string) => {
    const order = orders.find((o) => o.id === orderId)
    if (!order) return

    setSelectedOrderId(orderId)
    setValidationItems(
      order.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        status: "valid" as const,
      }))
    )
    setTransformResult(null)
    setScene("validation")
  }, [orders])

  const handleToggleItemStatus = useCallback((productId: string) => {
    setValidationItems((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? { ...item, status: item.status === "valid" ? "needs_attention" as const : "valid" as const }
          : item
      )
    )
  }, [])

  const handleTransform = useCallback(async () => {
    const order = orders.find((o) => o.id === selectedOrderId)
    if (!order || !tenantId) return

    setTransforming(true)
    try {
      const order_ = await createOrder(
        tenantId,
        `IN-${order.id.slice(0, 8)}`,
        order.items,
        order.notes ?? `Pedido online #${order.id.slice(0, 8)}`,
        undefined
      )
      setTransformResult({ localOrderId: order_.id })
      showToast("Pedido transformado a orden local", "success")
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al transformar", "error")
    } finally {
      setTransforming(false)
    }
  }, [orders, selectedOrderId, tenantId, showToast])

  const filteredOrders = useMemo(() => {
    if (filter === "all") return orders
    return orders.filter((o) => o.status === filter)
  }, [orders, filter])

  const pendingCount = useMemo(
    () => orders.filter((o) => o.status === "pending").length,
    [orders]
  )

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId),
    [orders, selectedOrderId]
  )

  useEffect(() => {
    switch (scene) {
      case "queue":
        setContextPanel({
          title: "Bandeja de entrada",
          subtitle: connected ? "● Conectado" : "○ Desconectado — offline",
          body: (
            <div style={{ padding: "var(--sp-2)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
                <div>
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    En cola
                  </div>
                  <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700 }}>
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
              </div>
            </div>
          ),
        })
        setActionBar({
          right: pendingCount > 0 ? (
            <button className="btn btn-primary btn-sm" onClick={handleConfirmAllPaid}>
              Confirmar todos
            </button>
          ) : undefined,
        })
        break

      case "validation":
        if (!selectedOrder) {
          setScene("queue")
          break
        }
        const needsAttention = validationItems.filter((v) => v.status === "needs_attention").length
        setContextPanel({
          title: "Validar pedido",
          subtitle: `#${selectedOrder.id.slice(0, 8)} — ${formatCurrency(selectedOrder.total)}`,
          body: (
            <div style={{ padding: "var(--sp-2)" }}>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "var(--sp-2)" }}>
                Items ({selectedOrder.items.length})
              </div>
              {validationItems.map((item) => (
                <div
                  key={item.productId}
                  onClick={() => handleToggleItemStatus(item.productId)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "var(--sp-1) 0",
                    borderBottom: "1px solid var(--border-light)",
                    cursor: "pointer",
                    opacity: item.status === "needs_attention" ? 0.6 : 1,
                    textDecoration: item.status === "needs_attention" ? "line-through" : "none",
                  }}
                >
                  <div>
                    <span style={{ fontSize: "var(--font-size-sm)" }}>
                      {item.status === "needs_attention" ? "⚠" : "✓"} {item.quantity}x {item.name}
                    </span>
                  </div>
                  <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 600 }}>
                    {formatCurrency(item.unitPrice * item.quantity)}
                  </span>
                </div>
              ))}
              {needsAttention > 0 && (
                <div style={{ marginTop: "var(--sp-2)", padding: "var(--sp-2)", background: "var(--warning-bg, #fff3cd)", borderRadius: "var(--radius)", fontSize: "var(--font-size-sm)" }}>
                  ⚠ {needsAttention} item(s) requieren atención. Hacé clic para alternar estado.
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "var(--sp-2)", paddingTop: "var(--sp-2)", borderTop: "2px solid var(--text-structure)", fontWeight: 700 }}>
                <span>Total</span>
                <span>{formatCurrency(selectedOrder.total)}</span>
              </div>
            </div>
          ),
        })
        setActionBar({
          left: (
            <button className="btn btn-ghost" onClick={() => { setScene("queue"); setSelectedOrderId(null) }}>
              ← Volver
            </button>
          ),
          right: (
            <button
              className="btn btn-primary"
              onClick={() => setScene("transform")}
            >
              Transformar a local
            </button>
          ),
        })
        break

      case "transform":
        setContextPanel({
          title: transformResult ? "Transformación completa" : "Procesando...",
          subtitle: selectedOrder ? `#${selectedOrder.id.slice(0, 8)}` : "",
          body: (
            <div style={{ padding: "var(--sp-3)", textAlign: "center" }}>
              {transformResult ? (
                <div>
                  <div style={{ fontSize: 48, marginBottom: "var(--sp-3)" }}>✅</div>
                  <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, marginBottom: "var(--sp-2)" }}>
                    Pedido transformado
                  </div>
                  <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)" }}>
                    Orden local: {transformResult.localOrderId.slice(0, 12)}...
                  </div>
                  <div style={{ marginTop: "var(--sp-2)", fontSize: "var(--font-size-sm)" }}>
                    Enviado a cocina automáticamente
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 48, marginBottom: "var(--sp-3)" }}>🔄</div>
                  <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, marginBottom: "var(--sp-2)" }}>
                    {transforming ? "Transformando..." : "Listo para transformar"}
                  </div>
                  {selectedOrder && (
                    <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)", marginBottom: "var(--sp-3)" }}>
                      {selectedOrder.items.length} items — {formatCurrency(selectedOrder.total)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ),
        })
        setActionBar({
          left: transformResult ? (
            <button className="btn btn-ghost" onClick={() => { setScene("queue"); setSelectedOrderId(null); setTransformResult(null) }}>
              ← Volver a bandeja
            </button>
          ) : (
            <button className="btn btn-ghost" onClick={() => setScene("validation")}>
              ← Volver a validación
            </button>
          ),
          right: !transformResult ? (
            <button
              className="btn btn-primary"
              onClick={handleTransform}
              disabled={transforming}
            >
              {transforming ? "Transformando..." : "Crear orden local"}
            </button>
          ) : undefined,
        })
        break
    }
  }, [scene, connected, orders.length, pendingCount, filter, selectedOrder, validationItems, transformResult, transforming, setContextPanel, setActionBar, handleConfirmAllPaid, handleToggleItemStatus, handleTransform])

  const formatOrderItems = (items: Order["items"]) =>
    items.map((i) => `${i.quantity}× ${i.name}`).join(", ")

  return (
    <>
      <div className="workspace-header">
        <div>
          <div className="workspace-title">
            {scene === "queue" ? "Bandeja de entrada" : scene === "validation" ? "Validar pedido" : "Transformar a local"}
          </div>
          <div className="workspace-subtitle">
            {scene === "queue"
              ? `Filtro: ${filter === "all" ? "Todos" : formatOrderStatus(filter)}`
              : scene === "validation" && selectedOrder
                ? `#${selectedOrder.id.slice(0, 8)} — ${formatCurrency(selectedOrder.total)}`
                : scene === "transform" && selectedOrder
                  ? `#${selectedOrder.id.slice(0, 8)}`
                  : ""}
          </div>
        </div>
        <div className="workspace-actions">
          {scene === "queue" && (
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
          )}
          {scene === "validation" && (
            <span className="status-badge">
              {validationItems.filter((v) => v.status === "needs_attention").length > 0
                ? `${validationItems.filter((v) => v.status === "needs_attention").length} pendiente(s)`
                : "Todos OK"}
            </span>
          )}
        </div>
      </div>

      <div className="p-6" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {scene === "queue" && (
          filteredOrders.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state-icon">📦</span>
              <span className="empty-state-text">
                No hay pedidos {filter !== "all" ? formatOrderStatus(filter) : ""}
              </span>
            </div>
          ) : (
            <div className="orders-list">
              {filteredOrders.map((order) => (
                <div
                  key={order.id}
                  className="order-card"
                  onClick={() => handleSelectOrder(order.id)}
                  style={{ cursor: "pointer" }}
                >
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
                    <span style={{ fontSize: "var(--font-size-xs)", color: "var(--primary-action)" }}>
                      Validar →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {scene === "validation" && selectedOrder && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Items del pedido</span>
              <span className="text-muted text-sm">Click para marcar necesidad de atención</span>
            </div>
            <div className="order-items">
              {validationItems.map((item) => (
                <div
                  key={item.productId}
                  className={`order-item-card ${item.status === "needs_attention" ? "dimmed" : ""}`}
                  onClick={() => handleToggleItemStatus(item.productId)}
                  style={{ cursor: "pointer", opacity: item.status === "needs_attention" ? 0.5 : 1 }}
                >
                  <div className="order-item-main">
                    <div className="order-item-top">
                      <span className="order-item-name">
                        {item.status === "needs_attention" ? "⚠ " : "✓ "}{item.quantity}x {item.name}
                      </span>
                      <span style={{ fontWeight: 600 }}>
                        {formatCurrency(item.unitPrice * item.quantity)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "var(--sp-3)", borderTop: "2px solid var(--text-structure)", fontWeight: 700, fontSize: "var(--font-size-lg)" }}>
              <span>Total</span>
              <span>{formatCurrency(selectedOrder.total)}</span>
            </div>
          </div>
        )}

        {scene === "transform" && selectedOrder && (
          <div style={{ maxWidth: 500, margin: "0 auto", padding: "var(--sp-8)" }}>
            <div className="card" style={{ padding: "var(--sp-6)", textAlign: "center" }}>
              {transformResult ? (
                <div>
                  <div style={{ fontSize: 64, marginBottom: "var(--sp-4)" }}>✅</div>
                  <div className="workspace-title" style={{ marginBottom: "var(--sp-2)" }}>
                    Pedido transformado
                  </div>
                  <div className="text-muted text-sm" style={{ marginBottom: "var(--sp-4)" }}>
                    El pedido online ya está disponible como orden local en el sistema POS
                  </div>
                  <div style={{ padding: "var(--sp-3)", background: "var(--surface-hover)", borderRadius: "var(--radius)", marginBottom: "var(--sp-4)" }}>
                    <div style={{ fontWeight: 600, marginBottom: "var(--sp-1)" }}>Orden local ID</div>
                    <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)" }}>
                      {transformResult.localOrderId}
                    </div>
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={() => { setScene("queue"); setSelectedOrderId(null); setTransformResult(null) }}
                  >
                    Volver a bandeja
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 64, marginBottom: "var(--sp-4)" }}>🔄</div>
                  <div className="workspace-title" style={{ marginBottom: "var(--sp-2)" }}>
                    Transformar a orden local
                  </div>
                  <div className="text-muted text-sm" style={{ marginBottom: "var(--sp-4)" }}>
                    Este pedido online será convertido en una orden local del POS y enviado a cocina
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-around", marginBottom: "var(--sp-4)" }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 24, fontWeight: 700 }}>{selectedOrder.items.length}</div>
                      <div className="text-muted text-sm">Items</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 24, fontWeight: 700 }}>{formatCurrency(selectedOrder.total)}</div>
                      <div className="text-muted text-sm">Total</div>
                    </div>
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={handleTransform}
                    disabled={transforming}
                    style={{ width: "100%" }}
                  >
                    {transforming ? "Transformando..." : "Crear orden local en POS"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>
            <span className="toast-message">{toast.message}</span>
            <button className="toast-close" onClick={() => setToast(null)}>✕</button>
          </div>
        </div>
      )}
    </>
  )
}
