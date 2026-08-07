import { useState, useMemo, useCallback, useEffect } from "react"
import type { ComponentType } from "react"
import type { Product, OrderItem, CustomerProfile, PaymentMethod, Order } from "@takeasygo/types"
import { useLiveQuery } from "dexie-react-hooks"
import { useTables } from "../../hooks/useTables"
import { useMenu } from "../../hooks/useMenu"
import { usePayments } from "../../hooks/usePayments"
import { useOrders } from "../../hooks/useOrders"
import { useLayout } from "../layout/LayoutContext"
import { useAuth } from "../../hooks/useAuth"
import { ProductSelector } from "../shared/ProductSelector"
import { ProductConfigurationPanel } from "../shared/ProductConfigurationPanel"
import { OrderPanel } from "../shared/OrderPanel"
import { CustomerSearch } from "../shared/CustomerSearch"
import { PaymentSelector } from "../shared/PaymentSelector"
import { MesaCard } from "../shared/MesaCard"
import { WorkspaceViewBar } from "../shared/WorkspaceViewBar"
import { SalonSetup } from "./SalonSetup"
import { formatCurrency, timeAgo } from "../../utils/format"
import { prepareOrder, markReady, deliverOrder, setEnRuta, setArrived } from "../../services/order"
import { db } from "../../db/dexie"
import { connectSocket } from "../../services/socket-client"
import { UtensilsCrossed, Store, Package, Calendar, ClipboardList } from "lucide-react"
import { confirmTransferPayment, notifyStatusToSyncLayer } from "../../services/sync-api"
import { transformExternalOrder, cancelExternalOrder, updateExternalOrderStatus } from "../../services/external-orders"
import { OrderCard } from "../IncomingOrders/OrderCard"
import { OrderValidationPanel } from "../IncomingOrders/OrderValidationPanel"
import { OrderTransformPanel } from "../IncomingOrders/OrderTransformPanel"
import { GatewayStats } from "../IncomingOrders/GatewayStats"
import { GatewayFilters } from "../IncomingOrders/GatewayFilters"
import { AutoConfirmToggle } from "../IncomingOrders/AutoConfirmToggle"
import { SocketStatus } from "../IncomingOrders/SocketStatus"
import type { FilterOption } from "../IncomingOrders/GatewayFilters"

type CounterView = "salon" | "mostrador" | "entrantes" | "mis_pedidos" | "reservaciones"
type Scene = "salon" | "productos" | "configurar" | "revision" | "cobro" | "cierre" | "setup" | "mostrador_rapido" | "entrantes" | "mis_pedidos" | "reservaciones"
type EntrantesSubView = "gateway" | "kanban"
type GatewayScene = "queue" | "validation" | "transform"

interface ViewDef {
  id: string
  label: string
  icon: ComponentType<{ size?: number; className?: string }>
}

const COUNTER_VIEWS: ViewDef[] = [
  { id: "salon", label: "Salón", icon: UtensilsCrossed },
  { id: "mostrador", label: "Mostrador", icon: Store },
  { id: "entrantes", label: "Pedidos Entrantes", icon: Package },
  { id: "mis_pedidos", label: "Mis Pedidos", icon: ClipboardList },
  { id: "reservaciones", label: "Reservaciones", icon: Calendar },
]

interface CartItem extends OrderItem {
  product: Product
}

interface ValidationItem {
  productId: string
  name: string
  quantity: number
  unitPrice: number
  status: "valid" | "needs_attention"
}

// ============================================================================
// Audio para notificaciones de nuevos pedidos
// ============================================================================
const NEW_ORDER_AUDIO = new Audio("/LLAMADA.mp3")
NEW_ORDER_AUDIO.volume = 0.5

const SYNC_URL = import.meta.env.VITE_SYNC_URL

export function CounterDashboard() {
  const { state } = useAuth()
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined
  const jwt = state.status === "authenticated" ? state.jwt?.accessToken : undefined

  const [scene, setScene] = useState<Scene>("salon")
  const [view, setView] = useState<CounterView>("salon")
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [customer, setCustomer] = useState<CustomerProfile | null>(null)
  const [showCustomerSearch, setShowCustomerSearch] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [configProduct, setConfigProduct] = useState<Product | null>(null)
  const [diners, setDiners] = useState(1)
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null)

  // ── Gateway state ─────────────────────────────────────────────────
  const [entrantesSubView, setEntrantesSubView] = useState<EntrantesSubView>("gateway")
  const [gatewayScene, setGatewayScene] = useState<GatewayScene>("queue")
  const [gatewayFilter, setGatewayFilter] = useState<FilterOption>("all")
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [validationItems, setValidationItems] = useState<ValidationItem[]>([])
  const [transformResult, setTransformResult] = useState<{ localOrderId: string } | null>(null)
  const [transforming, setTransforming] = useState(false)
  const [connected, setConnected] = useState(false)
  const [seenOrderIds, setSeenOrderIds] = useState<Set<string>>(new Set())
  const [selectedKanbanOrderId, setSelectedKanbanOrderId] = useState<string | null>(null)

  const showToast = useCallback((message: string, type: string) => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const { setContextPanel, setActionBar } = useLayout()
  const { tables, occupyTable } = useTables()
  const { products, categories } = useMenu()
  const { processPayment } = usePayments()
  const { createOrder } = useOrders()

  // ── Socket connection status ──────────────────────────────────────
  useEffect(() => {
    if (!jwt) return
    const socket = connectSocket(jwt)
    setConnected(socket.connected)
    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)
    socket.on("connect", onConnect)
    socket.on("disconnect", onDisconnect)
    return () => {
      socket.off("connect", onConnect)
      socket.off("disconnect", onDisconnect)
    }
  }, [jwt])

  // ============================================================================
  // QUERIES
  // ============================================================================

  // ── Gateway: pedidos NO integrados (cola de entrada) ──────────────
  const gatewayOrders = useLiveQuery(
    () => (tenantId
      ? db.orders
          .where("tenantId")
          .equals(tenantId)
          .and((o) => o.source === "external" && !o.integratedAt && o.status !== "cancelled" && o.status !== "delivered")
          .toArray()
      : []),
    [tenantId]
  ) ?? []

  // ── Kanban: pedidos integrados en operación ──────────────────────
  const kanbanOrders = useLiveQuery(
    () => (tenantId
      ? db.orders
          .where("tenantId")
          .equals(tenantId)
          .and((o) =>
            o.source === "external" &&
            !!o.integratedAt &&
            o.status !== "delivered" &&
            o.status !== "cancelled" &&
            (o.status === "confirmed" || o.status === "preparing" || o.status === "ready" || o.status === "en_ruta" || o.status === "arrived")
          )
          .toArray()
      : []),
    [tenantId]
  ) ?? []

  // ── Mis Pedidos: pedidos creados en el POS (source: "pos") ─────────
  const posOrders = useLiveQuery(
    () => (tenantId
      ? db.orders
          .where("tenantId")
          .equals(tenantId)
          .and((o) =>
            o.source === "pos" &&
            o.status !== "delivered" &&
            o.status !== "cancelled"
          )
          .toArray()
      : []),
    [tenantId]
  ) ?? []

  // ── Detectar nuevos pedidos y reproducir audio ───────────────────
  useEffect(() => {
    const newOrders = gatewayOrders.filter((o) => !seenOrderIds.has(o.id))
    if (newOrders.length > 0) {
      NEW_ORDER_AUDIO.play().catch((err) => console.error("Error playing audio:", err))
      setSeenOrderIds((prev) => {
        const updated = new Set(prev)
        newOrders.forEach((o) => updated.add(o.id))
        return updated
      })
    }
  }, [gatewayOrders, seenOrderIds])

  // ── Detectar nuevos pedidos POS y reproducir audio ──────────────
  const [seenPosOrderIds, setSeenPosOrderIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    const newOrders = posOrders.filter((o) => !seenPosOrderIds.has(o.id))
    if (newOrders.length > 0) {
      NEW_ORDER_AUDIO.play().catch((err) => console.error("Error playing audio:", err))
      showToast(`Nuevo pedido POS: #${newOrders[0].id.slice(0, 8)}`, "info")
      setSeenPosOrderIds((prev) => {
        const updated = new Set(prev)
        newOrders.forEach((o) => updated.add(o.id))
        return updated
      })
    }
  }, [posOrders, seenPosOrderIds])

  // ============================================================================
  // GATEWAY HANDLERS
  // ============================================================================

  const handleConfirmOrder = useCallback(async (orderId: string) => {
    try {
      const res = await fetch(`${SYNC_URL}/api/v1/orders/${orderId}/confirm`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${jwt}` },
      })
      if (!res.ok) throw new Error(`Confirm failed (${res.status})`)
      if (tenantId) {
        updateExternalOrderStatus(orderId, tenantId, "confirmed").catch(() => {})
      }
      showToast("Pedido confirmado en origen", "success")
    } catch {
      showToast("Error al confirmar", "error")
    }
  }, [jwt, tenantId, showToast])

  const handleConfirmTransfer = useCallback(async (orderId: string) => {
    if (!tenantId || !jwt) return
    const ok = await confirmTransferPayment(orderId, tenantId, jwt)
    if (ok) {
      updateExternalOrderStatus(orderId, tenantId, "confirmed").catch(() => {})
      showToast("Pago confirmado y pedido integrado", "success")
    } else {
      showToast("Error al confirmar pago", "error")
    }
  }, [tenantId, jwt, showToast])

  const handleRejectOrder = useCallback(async (orderId: string) => {
    if (tenantId) {
      await cancelExternalOrder(orderId, tenantId, "rejected_by_cashier").catch(() => {})
    }
    setSelectedOrderId(null)
    setGatewayScene("queue")
    showToast("Pedido rechazado", "info")
  }, [tenantId, showToast])

  const handleConfirmAllPaid = useCallback(() => {
    const pendingPaid = gatewayOrders.filter((o) => o.status === "pending")
    pendingPaid.forEach((o) => handleConfirmOrder(o.id))
  }, [gatewayOrders, handleConfirmOrder])

  const handleSelectOrder = useCallback((orderId: string) => {
    const order = gatewayOrders.find((o) => o.id === orderId)
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
    setGatewayScene("validation")
  }, [gatewayOrders])

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
    const order = gatewayOrders.find((o) => o.id === selectedOrderId)
    if (!order || !tenantId) return

    setTransforming(true)
    try {
      const updated = await transformExternalOrder({
        orderId: order.id,
        tenantId,
        items: order.items,
        total: order.total,
        notes: order.notes ?? `Pedido online #${order.id.slice(0, 8)}`,
      })
      setTransformResult({ localOrderId: updated.id })
      showToast("Pedido transformado a orden local", "success")

      // Notificar al SyncLayer que el pedido pasó a "confirmed"
      if (jwt) {
        notifyStatusToSyncLayer(order.id, "confirmed", jwt).catch(() => {})
      }

      // Auto-switch to kanban after short delay
      setTimeout(() => setEntrantesSubView("kanban"), 1500)
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al transformar", "error")
    } finally {
      setTransforming(false)
    }
  }, [gatewayOrders, selectedOrderId, tenantId, jwt, showToast])

  const handleGatewayBack = useCallback(() => {
    setGatewayScene("queue")
    setSelectedOrderId(null)
    setTransformResult(null)
  }, [])

  // ============================================================================
  // KANBAN HANDLERS (existing)
  // ============================================================================

  const handlePrepareExternal = useCallback(async (orderId: string) => {
    if (!tenantId) return
    try {
      await prepareOrder(tenantId, orderId, state.jwt?.accessToken)
      showToast("Pedido en preparación", "success")
    } catch {
      showToast("Error al iniciar preparación", "error")
    }
  }, [tenantId, state.jwt?.accessToken])

  const handleMarkReadyExternal = useCallback(async (orderId: string) => {
    if (!tenantId) return
    try {
      await markReady(tenantId, orderId, state.jwt?.accessToken)
      showToast("Pedido listo", "success")
    } catch {
      showToast("Error al marcar listo", "error")
    }
  }, [tenantId, state.jwt?.accessToken])

  const handleDeliverExternal = useCallback(async (orderId: string) => {
    if (!tenantId) return
    try {
      await deliverOrder(tenantId, orderId, state.jwt?.accessToken)
      showToast("Pedido entregado", "success")
    } catch {
      showToast("Error al entregar", "error")
    }
  }, [tenantId, state.jwt?.accessToken])

  const handleSetEnRutaExternal = useCallback(async (orderId: string) => {
    if (!tenantId) return
    try {
      await setEnRuta(tenantId, orderId, state.jwt?.accessToken)
      showToast("Pedido en ruta", "success")
    } catch {
      showToast("Error al marcar en ruta", "error")
    }
  }, [tenantId, state.jwt?.accessToken])

  const handleSetArrivedExternal = useCallback(async (orderId: string) => {
    if (!tenantId) return
    try {
      await setArrived(tenantId, orderId, state.jwt?.accessToken)
      showToast("Pedido llegó", "success")
    } catch {
      showToast("Error al marcar llegó", "error")
    }
  }, [tenantId, state.jwt?.accessToken])

  // ============================================================================
  // POS ORDER HANDLERS (Mis Pedidos kanban)
  // ============================================================================

  const handleConfirmPosOrder = useCallback(async (orderId: string) => {
    if (!tenantId) return
    try {
      const { confirmOrder } = await import("../../services/order")
      await confirmOrder(tenantId, orderId)
      showToast("Pedido confirmado", "success")
    } catch {
      showToast("Error al confirmar pedido", "error")
    }
  }, [tenantId])

  const handlePreparePosOrder = useCallback(async (orderId: string) => {
    if (!tenantId) return
    try {
      await prepareOrder(tenantId, orderId, state.jwt?.accessToken)
      showToast("Pedido en preparación", "success")
    } catch {
      showToast("Error al iniciar preparación", "error")
    }
  }, [tenantId, state.jwt?.accessToken])

  const handleMarkReadyPosOrder = useCallback(async (orderId: string) => {
    if (!tenantId) return
    try {
      await markReady(tenantId, orderId, state.jwt?.accessToken)
      showToast("Pedido listo", "success")
    } catch {
      showToast("Error al marcar listo", "error")
    }
  }, [tenantId, state.jwt?.accessToken])

  const handleDeliverPosOrder = useCallback(async (orderId: string) => {
    if (!tenantId) return
    try {
      await deliverOrder(tenantId, orderId, state.jwt?.accessToken)
      showToast("Pedido entregado", "success")
    } catch {
      showToast("Error al entregar", "error")
    }
  }, [tenantId, state.jwt?.accessToken])

  // ============================================================================
  // CART + TABLE HANDLERS (existing)
  // ============================================================================

  const selectedTable = useMemo(
    () => tables.find((t) => t.id === selectedTableId),
    [tables, selectedTableId]
  )

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.total, 0),
    [cart]
  )

  const handleViewChange = useCallback((viewId: string) => {
    setView(viewId as CounterView)
    setCart([])
    setCustomer(null)
    setSelectedTableId(null)
    setSelectedCategory(null)
    setDiners(1)
    setEntrantesSubView("gateway")
    setGatewayScene("queue")
    setSelectedOrderId(null)
    setSelectedKanbanOrderId(null)
    const defaults: Record<string, Scene> = {
      salon: "salon",
      mostrador: "mostrador_rapido",
      entrantes: "entrantes",
      mis_pedidos: "mis_pedidos",
      reservaciones: "reservaciones",
    }
    setScene(defaults[viewId] ?? "salon")
  }, [])

  const handleSelectTable = useCallback((tableId: string) => {
    setSelectedTableId(tableId)
    setScene("productos")
  }, [])

  const handleAddProduct = useCallback((product: Product) => {
    const hasModifiers = product.modifiers && product.modifiers.length > 0
    if (hasModifiers) {
      setConfigProduct(product)
      setScene("configurar")
      return
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id)
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id
            ? { ...i, quantity: i.quantity + 1, total: i.unitPrice * (i.quantity + 1) }
            : i
        )
      }
      const item: CartItem = {
        productId: product.id,
        name: product.name,
        quantity: 1,
        unitPrice: product.price,
        total: product.price,
        product,
      }
      return [...prev, item]
    })
  }, [])

  const handleUpdateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((i) => i.productId !== productId))
      return
    }
    setCart((prev) =>
      prev.map((i) =>
        i.productId === productId
          ? { ...i, quantity, total: i.unitPrice * quantity }
          : i
      )
    )
  }, [])

  const handleRemoveItem = useCallback((productId: string) => {
    setCart((prev) => prev.filter((i) => i.productId !== productId))
  }, [])

  const handleConfigConfirm = useCallback((item: OrderItem) => {
    if (!configProduct) return
    setCart((prev) => [...prev, { ...item, product: configProduct }])
    setConfigProduct(null)
    setScene("productos")
  }, [configProduct])

  const showErrorToast = useCallback((message: string) => {
    setToast({ message, type: "error" })
    setTimeout(() => setToast(null), 4000)
  }, [])

  const handlePay = useCallback(async (methods: PaymentMethod[]) => {
    const tableId = selectedTableId ?? `mostrador-${Date.now()}`
    try {
      const order = await createOrder(
        tableId,
        cart.map((item) => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
        }))
      )
      if (selectedTable?.status === "free" && selectedTableId) {
        await occupyTable(selectedTableId, "counter", order.id)
      }

      for (const method of methods) {
        await processPayment(order.id, Math.ceil(cartTotal / methods.length), `Pedido ${selectedTable ? `M${selectedTable.number}` : "mostrador"}`, method)
      }

      setScene("cierre")
    } catch (err) {
      console.error("[Counter] Payment failed:", err)
      showErrorToast("Error al procesar el pago. Intente nuevamente.")
    }
  }, [processPayment, cartTotal, cart, selectedTableId, selectedTable, createOrder, occupyTable])

  const handleNewSale = useCallback(() => {
    setCart([])
    setCustomer(null)
    setSelectedTableId(null)
    setSelectedCategory(null)
    setDiners(1)
    const defaults: Record<string, Scene> = {
      salon: "salon",
      mostrador: "mostrador_rapido",
      entrantes: "entrantes",
      reservaciones: "reservaciones",
    }
    setScene(defaults[view] ?? "salon")
  }, [view])

  // ============================================================================
  // DERIVED STATE
  // ============================================================================

  const filteredGatewayOrders = useMemo(() => {
    if (gatewayFilter === "all" || gatewayFilter === "delivery" || gatewayFilter === "takeaway" || gatewayFilter === "marketplace") return gatewayOrders
    if (gatewayFilter === "pending_payment") return gatewayOrders.filter((o) => o.status === "pending")
    return gatewayOrders
  }, [gatewayOrders, gatewayFilter])

  const gatewayPendingCount = useMemo(
    () => gatewayOrders.filter((o) => o.status === "pending" || o.externalStatus === "awaiting_payment").length,
    [gatewayOrders]
  )

  const gatewayPaidCount = useMemo(
    () => gatewayOrders.filter(
      (o) => o.source === "external" && ["confirmed", "preparing", "ready", "delivered"].includes(o.status)
    ).length,
    [gatewayOrders]
  )

  const gatewayFilterCounts = useMemo(() => ({
    all: gatewayOrders.length,
    delivery: 0,
    takeaway: 0,
    marketplace: 0,
    pending_payment: gatewayPendingCount,
  }), [gatewayOrders.length, gatewayPendingCount])

  const selectedOrder = useMemo(
    () => gatewayOrders.find((o) => o.id === selectedOrderId),
    [gatewayOrders, selectedOrderId]
  )

  // ============================================================================
  // CONTEXT PANEL + ACTION BAR PER SCENE
  // ============================================================================

  useEffect(() => {
    switch (scene) {
      case "salon":
      case "setup":
        setContextPanel(null)
        setActionBar(null)
        break

      case "productos":
        setContextPanel({
          title: `Mesa ${selectedTable?.number ?? "?"}`,
          subtitle: cart.length > 0 ? `${cart.length} items — ${formatCurrency(cartTotal)}` : "Sin productos",
          body: (
            <OrderPanel
              title={`Mesa ${selectedTable?.number ?? "?"}`}
              items={cart}
              onUpdateQuantity={handleUpdateQuantity}
              onRemoveItem={handleRemoveItem}
              total={cartTotal}
              primaryAction={{
                label: "Revisar pedido",
                onClick: () => setScene("revision"),
                disabled: cart.length === 0,
              }}
            />
          ),
        })
        setActionBar({
          left: (
            <button className="btn btn-ghost" onClick={() => setScene("salon")}>
              ← Volver
            </button>
          ),
          right: (
            <>
              {customer ? (
                <button className="btn btn-ghost btn-sm" onClick={() => setShowCustomerSearch(true)}>
                  👤 {customer.name}
                </button>
              ) : (
                <button className="btn btn-ghost btn-sm" onClick={() => setShowCustomerSearch(true)}>
                  + Cliente
                </button>
              )}
            </>
          ),
        })
        break

      case "configurar":
        setContextPanel(null)
        setActionBar(null)
        break

      case "revision":
        setContextPanel({
          title: "Resumen del pedido",
          subtitle: `Mesa ${selectedTable?.number ?? "?"}${customer ? ` — ${customer.name}` : ""}`,
          body: (
            <OrderPanel
              title="Resumen"
              items={cart}
              total={cartTotal}
              primaryAction={{
                label: "Cobrar",
                onClick: () => setScene("cobro"),
              }}
            />
          ),
        })
        setActionBar({
          left: (
            <button className="btn btn-ghost" onClick={() => setScene("productos")}>
              ← Agregar más
            </button>
          ),
        })
        break

      case "cobro":
        setContextPanel({
          title: "Resumen de cuenta",
          subtitle: `Mesa ${selectedTable?.number ?? "?"} — ${diners} comensal${diners > 1 ? "es" : ""}`,
          body: (
            <div style={{ padding: "var(--sp-2)" }}>
              <div style={{ marginBottom: "var(--sp-3)" }}>
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Total
                </div>
                <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700 }}>
                  {formatCurrency(cartTotal)}
                </div>
              </div>
              {diners > 1 && (
                <div>
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Por comensal
                  </div>
                  <div style={{ fontSize: "var(--font-size-xl)", fontWeight: 600 }}>
                    {formatCurrency(Math.round(cartTotal / diners))}
                  </div>
                </div>
              )}
            </div>
          ),
        })
        setActionBar({
          left: (
            <button className="btn btn-ghost" onClick={() => setScene("revision")}>
              ← Volver
            </button>
          ),
          center: (
            <span style={{ fontSize: "var(--font-size-xl)", fontWeight: 700, color: "var(--brand-orange)" }}>
              {formatCurrency(cartTotal)}
            </span>
          ),
        })
        break

      case "entrantes":
        if (entrantesSubView === "gateway") {
          // Gateway context panel
          switch (gatewayScene) {
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
                          {gatewayOrders.length}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                          Pendientes
                        </div>
                        <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: gatewayPendingCount > 0 ? "var(--warning)" : "var(--text-primary)" }}>
                          {gatewayPendingCount}
                        </div>
                      </div>
                    </div>
                  </div>
                ),
              })
              setActionBar({
                right: gatewayPendingCount > 0 ? (
                  <button className="btn btn-primary btn-sm" onClick={handleConfirmAllPaid}>
                    Confirmar todos
                  </button>
                ) : undefined,
              })
              break

            case "validation":
              if (!selectedOrder) {
                handleGatewayBack()
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
                  <button className="btn btn-ghost" onClick={handleGatewayBack}>
                    ← Volver
                  </button>
                ),
                center: selectedOrder && (
                  <button className="btn btn-danger" onClick={() => handleRejectOrder(selectedOrder.id)}>
                    Rechazar pedido
                  </button>
                ),
                right: (
                  <button className="btn btn-primary" onClick={() => setGatewayScene("transform")}>
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
                  <button className="btn btn-ghost" onClick={handleGatewayBack}>
                    ← Volver a bandeja
                  </button>
                ) : (
                  <button className="btn btn-ghost" onClick={() => setGatewayScene("validation")}>
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
        } else {
          // Kanban context panel
          const selectedKanbanOrder = selectedKanbanOrderId ? kanbanOrders.find((o) => o.id === selectedKanbanOrderId) : null

          if (selectedKanbanOrder) {
            // Detail view for selected order
            const nextStatus: Record<string, { label: string; handler: () => void } | null> = {
              confirmed: { label: "Iniciar Preparación", handler: () => handlePrepareExternal(selectedKanbanOrder.id) },
              preparing: { label: "Marcar Listo", handler: () => handleMarkReadyExternal(selectedKanbanOrder.id) },
              ready: selectedKanbanOrder.source === "delivery"
                ? { label: "En Ruta", handler: () => handleSetEnRutaExternal(selectedKanbanOrder.id) }
                : { label: "Entregado", handler: () => handleDeliverExternal(selectedKanbanOrder.id) },
              en_ruta: { label: "Llegó", handler: () => handleSetArrivedExternal(selectedKanbanOrder.id) },
              arrived: { label: "Entregado", handler: () => handleDeliverExternal(selectedKanbanOrder.id) },
            }
            const next = nextStatus[selectedKanbanOrder.status] ?? null

            setContextPanel({
              title: `Pedido #${selectedKanbanOrder.id.slice(0, 8)}`,
              subtitle: selectedKanbanOrder.source === "delivery" ? "Delivery" : "Take Away",
              body: (
                <div style={{ padding: "var(--sp-2)" }}>
                  <div style={{ marginBottom: "var(--sp-3)" }}>
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "var(--sp-1)" }}>
                      Estado
                    </div>
                    <div style={{
                      fontSize: "var(--font-size-sm)", fontWeight: 600,
                      color: selectedKanbanOrder.status === "confirmed" ? "var(--text-primary)" :
                             selectedKanbanOrder.status === "preparing" ? "var(--warning)" :
                             selectedKanbanOrder.status === "ready" ? "var(--success)" :
                             selectedKanbanOrder.status === "en_ruta" ? "var(--info)" :
                             selectedKanbanOrder.status === "arrived" ? "var(--brand-orange)" : "var(--text-muted)",
                    }}>
                      {selectedKanbanOrder.status === "confirmed" && "Por preparar"}
                      {selectedKanbanOrder.status === "preparing" && "Preparando"}
                      {selectedKanbanOrder.status === "ready" && "Listo"}
                      {selectedKanbanOrder.status === "en_ruta" && "En Ruta"}
                      {selectedKanbanOrder.status === "arrived" && "Llegó"}
                    </div>
                  </div>
                  <div style={{ marginBottom: "var(--sp-3)" }}>
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "var(--sp-1)" }}>
                      Items ({selectedKanbanOrder.items.length})
                    </div>
                    {selectedKanbanOrder.items.map((item, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "var(--sp-1) 0", borderBottom: "1px solid var(--border)", fontSize: "var(--font-size-sm)" }}>
                        <span>{item.quantity}× {item.name}</span>
                        <span style={{ fontWeight: 600 }}>{formatCurrency(item.total)}</span>
                      </div>
                    ))}
                  </div>
                  {selectedKanbanOrder.surchargeAmount && selectedKanbanOrder.surchargeAmount > 0 ? (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "var(--sp-2)", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                        <span>Precio de carta</span>
                        <span style={{ fontWeight: 500 }}>{formatCurrency(selectedKanbanOrder.baseTotal ?? selectedKanbanOrder.total - selectedKanbanOrder.surchargeAmount)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--font-size-xs)", color: "var(--warning)" }}>
                        <span>Recargo MP</span>
                        <span style={{ fontWeight: 500 }}>+{formatCurrency(selectedKanbanOrder.surchargeAmount)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "var(--sp-2)", borderTop: "2px solid var(--text-primary)", fontWeight: 700 }}>
                        <span>Total cobrado</span>
                        <span>{formatCurrency(selectedKanbanOrder.total)}</span>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "var(--sp-2)", borderTop: "2px solid var(--text-primary)", fontWeight: 700 }}>
                      <span>Total</span>
                      <span>{formatCurrency(selectedKanbanOrder.total)}</span>
                    </div>
                  )}
                  <div style={{ marginTop: "var(--sp-2)", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                    {selectedKanbanOrder.paymentMethod === "mercadopago" ? "💙 MercadoPago" :
                     selectedKanbanOrder.paymentMethod === "transfer" ? "🏦 Transferencia" :
                     selectedKanbanOrder.paymentMethod}
                  </div>
                </div>
              ),
            })
            setActionBar({
              left: (
                <button className="btn btn-ghost" onClick={() => setSelectedKanbanOrderId(null)}>
                  ← Volver
                </button>
              ),
              right: next ? (
                <button className="btn btn-primary" onClick={next.handler}>
                  {next.label}
                </button>
              ) : undefined,
            })
          } else {
            // Summary counts
            const pendingCount = kanbanOrders.filter((o) => o.status === "confirmed").length
            const preparingCount = kanbanOrders.filter((o) => o.status === "preparing").length
            const readyCount = kanbanOrders.filter((o) => o.status === "ready").length
            const enRutaCount = kanbanOrders.filter((o) => o.status === "en_ruta").length
            const arrivedCount = kanbanOrders.filter((o) => o.status === "arrived").length
            setContextPanel({
              title: "Pedidos Entrantes",
              subtitle: "Órdenes del ecosistema en operación",
              body: (
                <div style={{ padding: "var(--sp-2)" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
                    <div>
                      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Por preparar
                      </div>
                      <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700 }}>
                        {pendingCount}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        En preparación
                      </div>
                      <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: "var(--warning)" }}>
                        {preparingCount}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Listos
                      </div>
                      <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: "var(--success)" }}>
                        {readyCount}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        En ruta
                      </div>
                      <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: "var(--info)" }}>
                        {enRutaCount}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Llegaron
                      </div>
                      <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: "var(--brand-orange)" }}>
                        {arrivedCount}
                      </div>
                    </div>
                  </div>
                </div>
              ),
            })
            setActionBar(null)
          }
        }
        break

      case "cierre":
        setContextPanel({
          title: view === "mostrador" ? "Venta completada" : "Mesa cerrada",
          subtitle: view === "mostrador" ? "" : `Mesa ${selectedTable?.number ?? "?"}`,
          body: (
            <div style={{ padding: "var(--sp-2)" }}>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "var(--sp-2)" }}>
                Total cobrado
              </div>
              <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: "var(--brand-orange)" }}>
                {formatCurrency(cartTotal)}
              </div>
              {customer && (
                <div style={{ marginTop: "var(--sp-3)" }}>
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Cliente
                  </div>
                  <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 600 }}>
                    {customer.name}
                  </div>
                </div>
              )}
              <div style={{ marginTop: "var(--sp-3)" }}>
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Comensales
                </div>
                <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 600 }}>
                  {diners}
                </div>
              </div>
            </div>
          ),
        })
        setActionBar({
          center: (
            <button className="btn btn-primary" onClick={handleNewSale}>
              Nueva venta
            </button>
          ),
        })
        break
    }
  }, [scene, view, selectedTable, cart, cartTotal, customer, diners, entrantesSubView, gatewayScene, gatewayOrders, kanbanOrders, gatewayPendingCount, gatewayPaidCount, connected, selectedOrder, selectedKanbanOrderId, validationItems, transformResult, transforming, setContextPanel, setActionBar, handleUpdateQuantity, handleRemoveItem, handleNewSale, handleConfirmAllPaid, handleGatewayBack, handleRejectOrder, handleTransform, handlePrepareExternal, handleMarkReadyExternal, handleDeliverExternal, handleSetEnRutaExternal, handleSetArrivedExternal])

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <>
      {/* View Bar */}
      <WorkspaceViewBar views={COUNTER_VIEWS} activeView={view} onChange={handleViewChange} />

      {/* ================================================ */}
      {/* VIEW: SALÓN */}
      {/* ================================================ */}
      {view === "salon" && (
        <>
          {scene === "setup" && <SalonSetup onDone={() => setScene("salon")} />}

          {scene === "configurar" && configProduct && (
            <ProductConfigurationPanel
              product={configProduct}
              onConfirm={handleConfigConfirm}
              onCancel={() => { setConfigProduct(null); setScene("productos") }}
            />
          )}

          {scene === "salon" && (
            <>
              <div className="workspace-header">
                <div>
                  <div className="workspace-title">Salón</div>
                  <div className="workspace-subtitle">
                    {tables.length === 0
                      ? "Configurá tu salón para comenzar"
                      : "Seleccioná una mesa para comenzar"}
                  </div>
                </div>
                <div className="workspace-actions">
                  {tables.length === 0 && (
                    <button className="btn btn-primary btn-sm" onClick={() => setScene("setup")}>
                      Configurar salón
                    </button>
                  )}
                </div>
              </div>
              <div className="salon-content">
                {tables.length === 0 ? (
                  <div className="empty-state" style={{ padding: "var(--sp-12) var(--sp-6)" }}>
                    <div className="empty-state-icon">🪑</div>
                    <div className="empty-state-text">No hay mesas configuradas</div>
                    <button className="btn btn-primary" onClick={() => setScene("setup")} style={{ marginTop: "var(--sp-4)" }}>
                      Configurar salón
                    </button>
                  </div>
                ) : (
                  [...new Set(tables.map((t) => t.section || "Sala Principal"))].map(
                    (section) => (
                      <div key={section} className="sector">
                        <div className="sector-header">{section}</div>
                        <div className="sector-grid">
                          {tables
                            .filter((t) => (t.section || "Sala Principal") === section)
                            .map((table) => (
                              <MesaCard
                                key={table.id}
                                table={table}
                                variant="counter"
                                onClick={handleSelectTable}
                              />
                            ))}
                        </div>
                      </div>
                    )
                  )
                )}
              </div>
            </>
          )}

          {scene === "productos" && (
            <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div className="workspace-header">
                <div>
                  <div className="workspace-title">Mesa {selectedTable?.number ?? "?"}</div>
                  <div className="workspace-subtitle">Agregá productos al pedido</div>
                </div>
              </div>
              <ProductSelector
                products={products}
                categories={categories}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                onSelectProduct={handleAddProduct}
              />
            </div>
          )}

          {scene === "revision" && (
            <div style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "auto" }}>
              <div className="workspace-header">
                <div>
                  <div className="workspace-title">Revisión del pedido</div>
                  <div className="workspace-subtitle">
                    Mesa {selectedTable?.number ?? "?"}{customer && ` — ${customer.name}`}
                  </div>
                </div>
              </div>
              <div className="p-6">
                <div className="card">
                  <div className="card-header"><span className="card-title">Items ({cart.length})</span></div>
                  <div className="order-items">
                    {cart.map((item, idx) => (
                      <div key={`${item.productId}-${idx}`} className="order-item-card">
                        <div className="order-item-main">
                          <div className="order-item-top">
                            <span className="order-item-name">{item.name}</span>
                            <span className="order-item-qty">×{item.quantity}</span>
                            <span className="order-item-total">{formatCurrency(item.total)}</span>
                          </div>
                          {item.modifiers && item.modifiers.length > 0 && (
                            <div className="order-item-modifiers">
                              {item.modifiers.map((m, i) => (
                                <span key={i} className="order-item-modifier">
                                  {m.name}{m.price > 0 ? ` (+${formatCurrency(m.price)})` : ""}
                                </span>
                              ))}
                            </div>
                          )}
                          {item.notes && <div className="order-item-notes">{item.notes}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {scene === "cobro" && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "auto" }}>
              <div className="workspace-header">
                <div>
                  <div className="workspace-title">Cobro</div>
                  <div className="workspace-subtitle">
                    Mesa {selectedTable?.number ?? "?"} — {formatCurrency(cartTotal)}
                  </div>
                </div>
                <div className="workspace-actions">
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
                    <span className="text-sm text-muted">Comensales:</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => setDiners(Math.max(1, diners - 1))} disabled={diners <= 1} style={{ width: 32, height: 32, padding: 0 }}>−</button>
                    <span style={{ fontWeight: 600, minWidth: 24, textAlign: "center" }}>{diners}</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => setDiners(Math.min(20, diners + 1))} style={{ width: 32, height: 32, padding: 0 }}>+</button>
                  </div>
                </div>
              </div>
              <div className="p-6" style={{ maxWidth: 520, margin: "0 auto", width: "100%" }}>
                {diners === 1 ? (
                  <PaymentSelector total={cartTotal} onSelect={(m) => handlePay([m])} />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
                    <div className="card" style={{ padding: "var(--sp-4)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-3)" }}>
                        <span style={{ fontWeight: 600 }}>Total</span>
                        <span style={{ fontWeight: 700, fontSize: "var(--font-size-lg)" }}>{formatCurrency(cartTotal)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--border)" }}>
                        <span className="text-sm text-muted">Por comensal</span>
                        <span style={{ fontWeight: 600 }}>{formatCurrency(Math.round(cartTotal / diners))}</span>
                      </div>
                    </div>
                    {Array.from({ length: diners }).map((_, i) => (
                      <div key={i} className="card" style={{ padding: "var(--sp-4)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-2)" }}>
                          <span style={{ fontWeight: 600 }}>Comensal {i + 1}</span>
                          <span style={{ fontWeight: 600 }}>{formatCurrency(Math.round(cartTotal / diners))}</span>
                        </div>
                        <PaymentSelector total={Math.round(cartTotal / diners)} onSelect={(method) => {
                          handlePay(Array.from({ length: diners }).map((_, j) => j === i ? method : "cash"))
                        }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {scene === "cierre" && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "center", justifyContent: "center" }}>
              <div className="text-center">
                <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
                <div className="workspace-title" style={{ marginBottom: 8 }}>Mesa cerrada</div>
                <div className="workspace-subtitle" style={{ marginBottom: 8 }}>
                  {formatCurrency(cartTotal)} — Mesa {selectedTable?.number ?? "?"}
                </div>
                <div className="text-sm text-muted" style={{ marginBottom: 24 }}>
                  {diners > 1 ? `${diners} comensales — ${formatCurrency(Math.round(cartTotal / diners))} c/u` : "1 comensal"}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ================================================ */}
      {/* VIEW: MOSTRADOR */}
      {/* ================================================ */}
      {view === "mostrador" && (
        <>
          {scene === "configurar" && configProduct && (
            <ProductConfigurationPanel
              product={configProduct}
              onConfirm={handleConfigConfirm}
              onCancel={() => { setConfigProduct(null); setScene("mostrador_rapido") }}
            />
          )}

          {scene === "mostrador_rapido" && (
            <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div className="workspace-header">
                <div>
                  <div className="workspace-title">Mostrador</div>
                  <div className="workspace-subtitle">Venta rápida — seleccioná productos</div>
                </div>
              </div>
              <ProductSelector
                products={products}
                categories={categories}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                onSelectProduct={handleAddProduct}
              />
            </div>
          )}

          {scene === "revision" && (
            <div style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "auto" }}>
              <div className="workspace-header">
                <div>
                  <div className="workspace-title">Revisión del pedido</div>
                  <div className="workspace-subtitle">
                    Mostrador — {cart.length} items
                  </div>
                </div>
              </div>
              <div className="p-6">
                <div className="card">
                  <div className="card-header"><span className="card-title">Items ({cart.length})</span></div>
                  <div className="order-items">
                    {cart.map((item, idx) => (
                      <div key={`${item.productId}-${idx}`} className="order-item-card">
                        <div className="order-item-main">
                          <div className="order-item-top">
                            <span className="order-item-name">{item.name}</span>
                            <span className="order-item-qty">×{item.quantity}</span>
                            <span className="order-item-total">{formatCurrency(item.total)}</span>
                          </div>
                          {item.modifiers && item.modifiers.length > 0 && (
                            <div className="order-item-modifiers">
                              {item.modifiers.map((m, i) => (
                                <span key={i} className="order-item-modifier">
                                  {m.name}{m.price > 0 ? ` (+${formatCurrency(m.price)})` : ""}
                                </span>
                              ))}
                            </div>
                          )}
                          {item.notes && <div className="order-item-notes">{item.notes}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {scene === "cobro" && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "auto" }}>
              <div className="workspace-header">
                <div>
                  <div className="workspace-title">Cobro — Mostrador</div>
                  <div className="workspace-subtitle">
                    {formatCurrency(cartTotal)}
                  </div>
                </div>
              </div>
              <div className="p-6" style={{ maxWidth: 520, margin: "0 auto", width: "100%" }}>
                <PaymentSelector total={cartTotal} onSelect={(m) => handlePay([m])} />
              </div>
            </div>
          )}

          {scene === "cierre" && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "center", justifyContent: "center" }}>
              <div className="text-center">
                <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
                <div className="workspace-title" style={{ marginBottom: 8 }}>Venta completada</div>
                <div className="workspace-subtitle" style={{ marginBottom: 8 }}>
                  {formatCurrency(cartTotal)} — Mostrador
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ================================================ */}
      {/* VIEW: ENTRANTES (Gateway + Kanban) */}
      {/* ================================================ */}
      {view === "entrantes" && (
        <>
          {/* Sub-tabs: Recibir / Operar */}
          <div style={{
            display: "flex",
            gap: "var(--sp-2)",
            padding: "var(--sp-3) var(--sp-4)",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-primary)",
          }}>
            <button
              className={`btn btn-sm ${entrantesSubView === "gateway" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setEntrantesSubView("gateway")}
              style={{ position: "relative" }}
            >
              {gatewayOrders.length > 0 && (
                <span className="pulse-dot" />
              )}
              Recibir
              {gatewayOrders.length > 0 && (
                <span style={{
                  marginLeft: "var(--sp-1)",
                  background: entrantesSubView === "gateway" ? "rgba(255,255,255,0.3)" : "var(--warning)",
                  color: entrantesSubView === "gateway" ? "white" : "white",
                  padding: "1px 6px",
                  borderRadius: 10,
                  fontSize: "var(--font-size-xs)",
                  fontWeight: 700,
                }}>
                  {gatewayOrders.length}
                </span>
              )}
            </button>
            <button
              className={`btn btn-sm ${entrantesSubView === "kanban" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setEntrantesSubView("kanban")}
              style={{ position: "relative" }}
            >
              Operar
              {kanbanOrders.length > 0 && (
                <span style={{
                  marginLeft: "var(--sp-1)",
                  background: entrantesSubView === "kanban" ? "rgba(255,255,255,0.3)" : "var(--info)",
                  color: entrantesSubView === "kanban" ? "white" : "white",
                  padding: "1px 6px",
                  borderRadius: 10,
                  fontSize: "var(--font-size-xs)",
                  fontWeight: 700,
                }}>
                  {kanbanOrders.length}
                </span>
              )}
            </button>
          </div>

          {/* ── GATEWAY: Cola de pedidos del SaaS ── */}
          {entrantesSubView === "gateway" && (
            <>
              <div className="workspace-header">
                <div>
                  <div className="workspace-title">
                    {gatewayScene === "queue" ? "Pedidos Externos" : gatewayScene === "validation" ? "Validar pedido" : "Transformar a local"}
                  </div>
                  <div className="workspace-subtitle">
                    {gatewayScene === "queue"
                      ? "Pedidos del ecosistema TakeasyGO — Recibir → Validar → Transformar"
                      : gatewayScene === "validation" && selectedOrder
                        ? `#${selectedOrder.id.slice(0, 8)} — ${formatCurrency(selectedOrder.total)}`
                        : gatewayScene === "transform" && selectedOrder
                          ? `#${selectedOrder.id.slice(0, 8)}`
                          : ""}
                  </div>
                </div>
                <div className="workspace-actions">
                  {gatewayScene === "queue" && (
                    <>
                      <GatewayStats urgent={0} pendingPayment={gatewayPendingCount} paid={gatewayPaidCount} urgentDisabled />
                      <AutoConfirmToggle />
                      <SocketStatus connected={connected} />
                    </>
                  )}
                  {gatewayScene === "validation" && (
                    <span className="status-badge">
                      {validationItems.filter((v) => v.status === "needs_attention").length > 0
                        ? `${validationItems.filter((v) => v.status === "needs_attention").length} pendiente(s)`
                        : "Todos OK"}
                    </span>
                  )}
                </div>
              </div>

              <div className="p-6" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                {gatewayScene === "queue" && (
                  <>
                    <GatewayFilters active={gatewayFilter} counts={gatewayFilterCounts} onChange={setGatewayFilter} />
                    {filteredGatewayOrders.length === 0 ? (
                      <div className="empty-state">
                        <span className="empty-state-icon">📦</span>
                        <span className="empty-state-text">
                          No hay pedidos externos pendientes
                        </span>
                      </div>
                    ) : (
                      <div className="orders-list">
                        {filteredGatewayOrders.map((order) => (
                          <OrderCard
                            key={order.id}
                            order={order}
                            onClick={handleSelectOrder}
                            onConfirmTransfer={handleConfirmTransfer}
                            showLifecycleButtons={false}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}

                {gatewayScene === "validation" && selectedOrder && (
                  <OrderValidationPanel
                    order={selectedOrder}
                    items={validationItems}
                    onToggleItem={handleToggleItemStatus}
                  />
                )}

                {gatewayScene === "transform" && selectedOrder && (
                  <OrderTransformPanel
                    order={selectedOrder}
                    transformResult={transformResult}
                    transforming={transforming}
                    onTransform={handleTransform}
                    onReturn={handleGatewayBack}
                  />
                )}
              </div>
            </>
          )}

          {/* ── KANBAN: Pedidos integrados en operación ── */}
          {entrantesSubView === "kanban" && (
            <>
              <div className="workspace-header">
                <div>
                  <div className="workspace-title">Pedidos Entrantes</div>
                  <div className="workspace-subtitle">Órdenes del ecosistema en operación</div>
                </div>
              </div>
              <div className="p-6" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                {kanbanOrders.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-state-icon">📦</span>
                    <span className="empty-state-text">No hay pedidos en operación</span>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "var(--sp-3)", height: "100%" }}>
                    {/* Columna: Por preparar (confirmed) */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                      <div style={{
                        padding: "var(--sp-2)",
                        background: "var(--surface-secondary)",
                        borderRadius: "var(--radius)",
                        fontWeight: 600,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}>
                        <span>Por preparar</span>
                        <span style={{
                          background: "var(--warning-bg, #fff3cd)",
                          color: "var(--warning)",
                          padding: "2px 8px",
                          borderRadius: 12,
                          fontSize: "var(--font-size-xs)"
                        }}>
                          {kanbanOrders.filter((o) => o.status === "confirmed").length}
                        </span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                        {kanbanOrders.filter((o) => o.status === "confirmed").map((order) => (
                          <KanbanOrderCard
                            key={order.id}
                            order={order}
                            onClick={setSelectedKanbanOrderId}
                            onPrepare={handlePrepareExternal}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Columna: Preparando */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                      <div style={{
                        padding: "var(--sp-2)",
                        background: "var(--surface-secondary)",
                        borderRadius: "var(--radius)",
                        fontWeight: 600,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}>
                        <span>Preparando</span>
                        <span style={{
                          background: "var(--info-bg, #e3f2fd)",
                          color: "var(--info)",
                          padding: "2px 8px",
                          borderRadius: 12,
                          fontSize: "var(--font-size-xs)"
                        }}>
                          {kanbanOrders.filter((o) => o.status === "preparing").length}
                        </span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                        {kanbanOrders.filter((o) => o.status === "preparing").map((order) => (
                          <KanbanOrderCard
                            key={order.id}
                            order={order}
                            onClick={setSelectedKanbanOrderId}
                            onMarkReady={handleMarkReadyExternal}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Columna: Listos */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                      <div style={{
                        padding: "var(--sp-2)",
                        background: "var(--surface-secondary)",
                        borderRadius: "var(--radius)",
                        fontWeight: 600,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}>
                        <span>Listos</span>
                        <span style={{
                          background: "var(--success-bg, #e6f7e6)",
                          color: "var(--success)",
                          padding: "2px 8px",
                          borderRadius: 12,
                          fontSize: "var(--font-size-xs)"
                        }}>
                          {kanbanOrders.filter((o) => o.status === "ready").length}
                        </span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                        {kanbanOrders.filter((o) => o.status === "ready").map((order) => (
                          <KanbanOrderCard
                            key={order.id}
                            order={order}
                            onClick={setSelectedKanbanOrderId}
                            onSetEnRuta={handleSetEnRutaExternal}
                            onDeliver={handleDeliverExternal}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Columna: En Ruta */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                      <div style={{
                        padding: "var(--sp-2)",
                        background: "var(--surface-secondary)",
                        borderRadius: "var(--radius)",
                        fontWeight: 600,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}>
                        <span>En Ruta</span>
                        <span style={{
                          background: "var(--info-bg, #e3f2fd)",
                          color: "var(--info)",
                          padding: "2px 8px",
                          borderRadius: 12,
                          fontSize: "var(--font-size-xs)"
                        }}>
                          {kanbanOrders.filter((o) => o.status === "en_ruta").length}
                        </span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                        {kanbanOrders.filter((o) => o.status === "en_ruta").map((order) => (
                          <KanbanOrderCard
                            key={order.id}
                            order={order}
                            onClick={setSelectedKanbanOrderId}
                            onSetArrived={handleSetArrivedExternal}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Columna: Llegaron */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                      <div style={{
                        padding: "var(--sp-2)",
                        background: "var(--surface-secondary)",
                        borderRadius: "var(--radius)",
                        fontWeight: 600,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}>
                        <span>Llegaron</span>
                        <span style={{
                          background: "var(--brand-orange-bg, #fff3e0)",
                          color: "var(--brand-orange)",
                          padding: "2px 8px",
                          borderRadius: 12,
                          fontSize: "var(--font-size-xs)"
                        }}>
                          {kanbanOrders.filter((o) => o.status === "arrived").length}
                        </span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                        {kanbanOrders.filter((o) => o.status === "arrived").map((order) => (
                          <KanbanOrderCard
                            key={order.id}
                            order={order}
                            onClick={setSelectedKanbanOrderId}
                            onDeliver={handleDeliverExternal}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ================================================ */}
      {/* VIEW: MIS PEDIDS (POS-created orders kanban) */}
      {/* ================================================ */}
      {view === "mis_pedidos" && (
        <>
          <div className="workspace-header">
            <div>
              <div className="workspace-title">Mis Pedidos</div>
              <div className="workspace-subtitle">Pedidos creados en el POS</div>
            </div>
          </div>
          <div className="p-6" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {posOrders.length === 0 ? (
              <div className="empty-state">
                <span className="empty-state-icon">📋</span>
                <span className="empty-state-text">No hay pedidos activos</span>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--sp-3)", height: "100%" }}>
                {/* Columna: Pendientes */}
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                  <div style={{
                    padding: "var(--sp-2)",
                    background: "var(--surface-secondary)",
                    borderRadius: "var(--radius)",
                    fontWeight: 600,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}>
                    <span>Pendientes</span>
                    <span style={{
                      background: "var(--warning-bg, #fff3cd)",
                      color: "var(--warning)",
                      padding: "2px 8px",
                      borderRadius: 12,
                      fontSize: "var(--font-size-xs)"
                    }}>
                      {posOrders.filter((o) => o.status === "pending").length}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                    {posOrders.filter((o) => o.status === "pending").map((order) => (
                      <PosOrderCard
                        key={order.id}
                        order={order}
                        onConfirm={handleConfirmPosOrder}
                      />
                    ))}
                  </div>
                </div>

                {/* Columna: Por preparar */}
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                  <div style={{
                    padding: "var(--sp-2)",
                    background: "var(--surface-secondary)",
                    borderRadius: "var(--radius)",
                    fontWeight: 600,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}>
                    <span>Por preparar</span>
                    <span style={{
                      background: "var(--info-bg, #e3f2fd)",
                      color: "var(--info)",
                      padding: "2px 8px",
                      borderRadius: 12,
                      fontSize: "var(--font-size-xs)"
                    }}>
                      {posOrders.filter((o) => o.status === "confirmed").length}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                    {posOrders.filter((o) => o.status === "confirmed").map((order) => (
                      <PosOrderCard
                        key={order.id}
                        order={order}
                        onPrepare={handlePreparePosOrder}
                      />
                    ))}
                  </div>
                </div>

                {/* Columna: Preparando */}
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                  <div style={{
                    padding: "var(--sp-2)",
                    background: "var(--surface-secondary)",
                    borderRadius: "var(--radius)",
                    fontWeight: 600,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}>
                    <span>Preparando</span>
                    <span style={{
                      background: "var(--warning-bg, #fff3cd)",
                      color: "var(--warning)",
                      padding: "2px 8px",
                      borderRadius: 12,
                      fontSize: "var(--font-size-xs)"
                    }}>
                      {posOrders.filter((o) => o.status === "preparing").length}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                    {posOrders.filter((o) => o.status === "preparing").map((order) => (
                      <PosOrderCard
                        key={order.id}
                        order={order}
                        onMarkReady={handleMarkReadyPosOrder}
                      />
                    ))}
                  </div>
                </div>

                {/* Columna: Listos */}
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                  <div style={{
                    padding: "var(--sp-2)",
                    background: "var(--surface-secondary)",
                    borderRadius: "var(--radius)",
                    fontWeight: 600,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}>
                    <span>Listos</span>
                    <span style={{
                      background: "var(--success-bg, #e6f7e6)",
                      color: "var(--success)",
                      padding: "2px 8px",
                      borderRadius: 12,
                      fontSize: "var(--font-size-xs)"
                    }}>
                      {posOrders.filter((o) => o.status === "ready").length}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                    {posOrders.filter((o) => o.status === "ready").map((order) => (
                      <PosOrderCard
                        key={order.id}
                        order={order}
                        onDeliver={handleDeliverPosOrder}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ================================================ */}
      {/* VIEW: RESERVACIONES */}
      {/* ================================================ */}
      {view === "reservaciones" && (
        <div className="feature-disabled" style={{ position: "relative", textAlign: "center", padding: 48 }}>
          <div className="empty-state-icon" style={{ fontSize: 40 }}>📅</div>
          <div className="empty-state-text">Reservaciones</div>
          <span className="feature-disabled-tooltip">Próximamente</span>
        </div>
      )}

      {/* Modals */}
      {showCustomerSearch && (
        <CustomerSearch
          onSelect={(c) => { setCustomer(c); setShowCustomerSearch(false) }}
          onClose={() => setShowCustomerSearch(false)}
        />
      )}

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

// ============================================================================
// KanbanOrderCard - Componente para pedidos en el kanban de operación
// ============================================================================

interface KanbanOrderCardProps {
  order: Order
  onClick?: (orderId: string) => void
  onPrepare?: (orderId: string) => void
  onMarkReady?: (orderId: string) => void
  onSetEnRuta?: (orderId: string) => void
  onSetArrived?: (orderId: string) => void
  onDeliver?: (orderId: string) => void
}

function KanbanOrderCard({ order, onClick, onPrepare, onMarkReady, onSetEnRuta, onSetArrived, onDeliver }: KanbanOrderCardProps) {
  const isDelivery = order.source === "delivery"
  const minutes = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000)
  const isUrgent = minutes > 5

  function getNextAction() {
    switch (order.status) {
      case "pending":
      case "confirmed":
        return { label: "Iniciar Preparación", action: onPrepare }
      case "preparing":
        return { label: "Marcar Listo", action: onMarkReady }
      case "ready":
        if (isDelivery) {
          return { label: "En Ruta", action: onSetEnRuta }
        }
        return { label: "Entregado", action: onDeliver }
      case "en_ruta":
        return { label: "Llegó", action: onSetArrived }
      case "arrived":
        return { label: "Entregado", action: onDeliver }
      default:
        return { label: null, action: null }
    }
  }

  const nextAction = getNextAction()

  return (
    <div
      className={`order-card ${isUrgent ? "urgent" : ""}`}
      style={{ cursor: "pointer" }}
      onClick={() => onClick?.(order.id)}
    >
      <div className="order-card-left">
        <div className="order-card-header">
          <div className={`order-card-source ${isDelivery ? "delivery" : "pickup"}`}>
            {isDelivery ? "🚚" : "🥡"}
          </div>
          <div>
            <div className="order-card-title">
              #{order.id.slice(0, 8)}
            </div>
            <div className="order-card-meta">
              <span>{isDelivery ? "Delivery" : "Take Away"}</span>
              <span className={`order-card-payment ${order.paymentMethod === "mercadopago" ? "mercadopago" : "other"}`}>
                💙 MP
              </span>
              <span style={{
                fontSize: "var(--font-size-xs)",
                color: order.status === "pending" || order.status === "confirmed" ? "var(--text-muted)" :
                       order.status === "preparing" ? "var(--warning)" :
                       order.status === "ready" ? "var(--success)" :
                       order.status === "en_ruta" ? "var(--info)" :
                       order.status === "arrived" ? "var(--brand-orange)" : "var(--text-muted)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}>
                {(order.status === "pending" || order.status === "confirmed") && "Por preparar"}
                {order.status === "preparing" && "Preparando"}
                {order.status === "ready" && "Listo"}
                {order.status === "en_ruta" && "En Ruta"}
                {order.status === "arrived" && "Llegó"}
              </span>
            </div>
          </div>
        </div>
        <div className="order-card-items">
          {order.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
        </div>
        {nextAction.action && (
          <button
            className="btn btn-primary btn-sm"
            style={{ marginTop: "var(--sp-2)" }}
            onClick={() => nextAction.action?.(order.id)}
          >
            {nextAction.label}
          </button>
        )}
      </div>
      <div className="order-card-right">
        <span className={`order-card-time ${isUrgent ? "urgent" : ""}`}>
          {isUrgent ? `⚠ ${minutes} min` : timeAgo(order.createdAt)}
        </span>
        <span className="order-card-total">{formatCurrency(order.total)}</span>
      </div>
    </div>
  )
}

// ============================================================================
// PosOrderCard - Componente para pedidos creados en el POS (Mis Pedidos)
// ============================================================================

interface PosOrderCardProps {
  order: Order
  onConfirm?: (orderId: string) => void
  onPrepare?: (orderId: string) => void
  onMarkReady?: (orderId: string) => void
  onDeliver?: (orderId: string) => void
}

function PosOrderCard({ order, onConfirm, onPrepare, onMarkReady, onDeliver }: PosOrderCardProps) {
  const minutes = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000)
  const isUrgent = minutes > 5

  function getNextAction() {
    switch (order.status) {
      case "pending":
        return { label: "Confirmar", action: onConfirm }
      case "confirmed":
        return { label: "Iniciar Preparación", action: onPrepare }
      case "preparing":
        return { label: "Marcar Listo", action: onMarkReady }
      case "ready":
        return { label: "Entregado", action: onDeliver }
      default:
        return { label: null, action: null }
    }
  }

  const nextAction = getNextAction()

  return (
    <div className={`order-card ${isUrgent ? "urgent" : ""}`} style={{ cursor: "default" }}>
      <div className="order-card-left">
        <div className="order-card-header">
          <div className="order-card-source pickup">
            🍽️
          </div>
          <div>
            <div className="order-card-title">
              #{order.id.slice(0, 8)}
            </div>
            <div className="order-card-meta">
              <span>Mesa {order.tableId ?? "—"}</span>
              <span style={{
                fontSize: "var(--font-size-xs)",
                color: order.status === "pending" ? "var(--text-muted)" :
                       order.status === "confirmed" ? "var(--info)" :
                       order.status === "preparing" ? "var(--warning)" :
                       order.status === "ready" ? "var(--success)" : "var(--text-muted)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}>
                {order.status === "pending" && "Pendiente"}
                {order.status === "confirmed" && "Por preparar"}
                {order.status === "preparing" && "Preparando"}
                {order.status === "ready" && "Listo"}
              </span>
            </div>
          </div>
        </div>
        <div className="order-card-items">
          {order.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
        </div>
        {nextAction.action && (
          <button
            className="btn btn-primary btn-sm"
            style={{ marginTop: "var(--sp-2)" }}
            onClick={() => nextAction.action?.(order.id)}
          >
            {nextAction.label}
          </button>
        )}
      </div>
      <div className="order-card-right">
        <span className={`order-card-time ${isUrgent ? "urgent" : ""}`}>
          {isUrgent ? `⚠ ${minutes} min` : timeAgo(order.createdAt)}
        </span>
        <span className="order-card-total">{formatCurrency(order.total)}</span>
      </div>
    </div>
  )
}
