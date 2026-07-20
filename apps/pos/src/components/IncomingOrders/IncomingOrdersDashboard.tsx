import { useState, useEffect, useCallback, useMemo } from "react"
import type { Order } from "@takeasygo/types"
import { useAuth } from "../../hooks/useAuth"
import { useLayout } from "../layout/LayoutContext"
import { formatCurrency } from "../../utils/format"
import { onSocketEvent, connectSocket } from "../../services/socket-client"
import { createOrder } from "../../services/order"
import { fetchPendingOrders } from "../../services/sync-api"
import { SocketStatus } from "./SocketStatus"
import { GatewayStats } from "./GatewayStats"
import { GatewayFilters } from "./GatewayFilters"
import type { FilterOption } from "./GatewayFilters"
import { AutoConfirmToggle } from "./AutoConfirmToggle"
import { OrderCard } from "./OrderCard"
import { OrderValidationPanel } from "./OrderValidationPanel"
import { OrderTransformPanel } from "./OrderTransformPanel"

// ============================================================================
// REGLA DE DOMINIO — Gateway
// ============================================================================
// El Gateway NUNCA modifica un pedido.
// Solo puede:
//   ✅ Validar    — revisar items, marcar needs_attention
//   ✅ Rechazar   — eliminar de la cola (no se transforma)
//   ✅ Transformar — convertir a orden local POS
// Prohibido:
//   ❌ Editar productos, precios o cantidades
//   ❌ Cambiar el estado del pedido en origen
//   ❌ Modificar la orden después de transformada
// ============================================================================

type Scene = "queue" | "validation" | "transform"

interface ValidationItem {
  productId: string
  name: string
  quantity: number
  unitPrice: number
  status: "valid" | "needs_attention"
}

const SYNC_URL = import.meta.env.VITE_SYNC_URL

export function IncomingOrdersDashboard() {
  const { state } = useAuth()
  const jwt = state.status === "authenticated" ? state.jwt?.accessToken : undefined
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined

  const { setContextPanel, setActionBar } = useLayout()
  const [scene, setScene] = useState<Scene>("queue")
  const [orders, setOrders] = useState<Order[]>([])
  const [filter, setFilter] = useState<FilterOption>("all")
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
    if (!jwt || !tenantId) return

    const socket = connectSocket(jwt)

    socket.on("connect", () => setConnected(true))
    socket.on("disconnect", () => setConnected(false))

    // Fetch active orders on mount (catch orders missed while offline)
    fetchPendingOrders(tenantId, jwt).then((pending) => {
      if (pending.length > 0) {
        setOrders((prev) => {
          const existingIds = new Set(prev.map((o) => o.id))
          const newOrders = pending
            .filter((o) => !existingIds.has(o.orderId))
            .map((o) => ({
              id: o.orderId,
              tenantId: o.tenantId,
              source: (o.source as Order["source"]) || "takeasygo",
              status: (o.status as Order["status"]) || "pending",
              items: o.items as Order["items"],
              total: o.total,
              menuVersion: 1,
              createdAt: new Date(),
              updatedAt: new Date(),
            }))
          return [...newOrders, ...prev]
        })
      }
    }).catch(() => {})

    const unsubCreated = onSocketEvent("order:created", (data: unknown) => {
      const event = data as { orderId: string; items: unknown[]; total: number; source?: string }
      setOrders((prev) => {
        if (prev.some((o) => o.id === event.orderId)) return prev
        const newOrder: Order = {
          id: event.orderId,
          tenantId: "",
          source: (event.source as Order["source"]) || "takeasygo",
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

    const unsubCancelled = onSocketEvent("order:cancelled", (data: unknown) => {
      const event = data as { orderId: string; reason?: string }
      setOrders((prev) => {
        const existed = prev.some((o) => o.id === event.orderId)
        if (existed) {
          showToast(
            event.reason === "offline_timeout"
              ? "Pedido expirado (timeout)"
              : "Pedido cancelado",
            "info"
          )
        }
        return prev.filter((o) => o.id !== event.orderId)
      })
    })

    // Allow App.tsx to trigger a refresh on reconnect
    const handleRefresh = () => {
      if (!tenantId || !jwt) return
      fetchPendingOrders(tenantId, jwt).then((pending) => {
        setOrders((prev) => {
          const existingIds = new Set(prev.map((o) => o.id))
          const newOrders = pending
            .filter((o) => !existingIds.has(o.orderId))
            .map((o) => ({
              id: o.orderId,
              tenantId: o.tenantId,
              source: (o.source as Order["source"]) || "takeasygo",
              status: (o.status as Order["status"]) || "pending",
              items: o.items as Order["items"],
              total: o.total,
              menuVersion: 1,
              createdAt: new Date(),
              updatedAt: new Date(),
            }))
          return [...newOrders, ...prev]
        })
      }).catch(() => {})
    }
    window.addEventListener("pos:refresh-incoming", handleRefresh)

    return () => {
      unsubCreated()
      unsubConfirmed()
      unsubCancelled()
      window.removeEventListener("pos:refresh-incoming", handleRefresh)
    }
  }, [jwt, tenantId, showToast])

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

  const handleRejectOrder = useCallback((orderId: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== orderId))
    setSelectedOrderId(null)
    setScene("queue")
    showToast("Pedido rechazado", "info")
  }, [showToast])

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
    if (filter === "all" || filter === "delivery" || filter === "takeaway" || filter === "marketplace") return orders
    if (filter === "pending_payment") return orders.filter((o) => o.status === "pending")
    return orders
  }, [orders, filter])

  const pendingCount = useMemo(
    () => orders.filter((o) => o.status === "pending").length,
    [orders]
  )

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId),
    [orders, selectedOrderId]
  )

  const paidCount = useMemo(
    () => orders.filter(
      (o) => o.source === "takeasygo" && ["confirmed", "preparing", "ready", "delivered"].includes(o.status)
    ).length,
    [orders]
  )

  const filterCounts = useMemo(() => ({
    all: orders.length,
    delivery: 0,
    takeaway: 0,
    marketplace: 0,
    pending_payment: pendingCount,
  }), [orders.length, pendingCount])

  // Context Panel + ActionBar per scene
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
                  <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: pendingCount > 0 ? "var(--warning)" : "var(--text-primary)" }}>
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
                    borderBottom: "1px solid var(--border)",
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
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "var(--sp-2)", paddingTop: "var(--sp-2)", borderTop: "2px solid var(--text-primary)", fontWeight: 700 }}>
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
          center: selectedOrder && (
            <button className="btn btn-danger" onClick={() => handleRejectOrder(selectedOrder.id)}>
              Rechazar pedido
            </button>
          ),
          right: (
            <button className="btn btn-primary" onClick={() => setScene("transform")}>
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
  }, [scene, connected, orders.length, pendingCount, paidCount, filter, selectedOrder, validationItems, transformResult, transforming, setContextPanel, setActionBar, handleConfirmAllPaid, handleToggleItemStatus, handleTransform, handleRejectOrder])

  return (
    <>
      <div className="workspace-header">
        <div>
          <div className="workspace-title">
            {scene === "queue" ? "Pedidos Externos" : scene === "validation" ? "Validar pedido" : "Transformar a local"}
          </div>
          <div className="workspace-subtitle">
            {scene === "queue"
              ? "Solo pedidos del ecosistema — No incluye pedidos de salón"
              : scene === "validation" && selectedOrder
                ? `#${selectedOrder.id.slice(0, 8)} — ${formatCurrency(selectedOrder.total)}`
                : scene === "transform" && selectedOrder
                  ? `#${selectedOrder.id.slice(0, 8)}`
                  : ""}
          </div>
        </div>
        <div className="workspace-actions">
          {scene === "queue" && (
            <>
              <GatewayStats urgent={0} pendingPayment={pendingCount} paid={paidCount} urgentDisabled />
              <AutoConfirmToggle />
              <SocketStatus connected={connected} />
            </>
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
          <>
            <GatewayFilters active={filter} counts={filterCounts} onChange={setFilter} />
            {filteredOrders.length === 0 ? (
              <div className="empty-state">
                <span className="empty-state-icon">📦</span>
                <span className="empty-state-text">
                  No hay pedidos externos pendientes
                </span>
              </div>
            ) : (
              <div className="orders-list">
                {filteredOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onClick={handleSelectOrder}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {scene === "validation" && selectedOrder && (
          <OrderValidationPanel
            order={selectedOrder}
            items={validationItems}
            onToggleItem={handleToggleItemStatus}
          />
        )}

        {scene === "transform" && selectedOrder && (
          <OrderTransformPanel
            order={selectedOrder}
            transformResult={transformResult}
            transforming={transforming}
            onTransform={handleTransform}
            onReturn={() => { setScene("queue"); setSelectedOrderId(null); setTransformResult(null) }}
          />
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
