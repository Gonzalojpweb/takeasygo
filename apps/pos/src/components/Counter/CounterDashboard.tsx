import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import type { ComponentType } from "react"
import type { Product, OrderItem, CustomerProfile, Order } from "@takeasygo/types"
import { calculateItemTotal, allocatePayments, type CheckoutPart, type AllocatedPayment } from "@takeasygo/business/browser"
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
import { CheckoutPanel } from "../shared/CheckoutPanel"
import { SalonMap } from "../shared/SalonMap"
import { MesaContextPanel } from "./MesaContextPanel"
import { useTableActivity } from "../../hooks/useTableActivity"
import { useNow } from "../../hooks/useNow"
import { WorkspaceViewBar } from "../shared/WorkspaceViewBar"
import { SalonSetup } from "./SalonSetup"
import { formatCurrency, timeAgo } from "../../utils/format"
import { prepareOrder, markReady, deliverOrder, recordPayments, settleToDelivered, setOrderCustomerPhone } from "../../services/order"
import { sendWaiterOrderToKitchen } from "../../services/waiter-order"
import { useKitchenCommands } from "../../hooks/useKitchenCommands"
import { PosApiError } from "../../services/pos-api"
import { playOrderNotification } from "../../services/notification-sound"
import { db } from "../../db/dexie"
import { connectSocket } from "../../services/socket-client"
import { UtensilsCrossed, Store, Package, Calendar, ClipboardList } from "lucide-react"
import { confirmTransferPayment, notifyStatusToSyncLayer } from "../../services/sync-api"
import { transformExternalOrder, cancelExternalOrder, updateExternalOrderStatus, advanceExternalOrder } from "../../services/external-orders"
import { OrderCard } from "../IncomingOrders/OrderCard"
import { OrderValidationPanel } from "../IncomingOrders/OrderValidationPanel"
import { OrderTransformPanel } from "../IncomingOrders/OrderTransformPanel"
import { GatewayStats } from "../IncomingOrders/GatewayStats"
import { GatewayFilters } from "../IncomingOrders/GatewayFilters"
import { AutoConfirmToggle } from "../IncomingOrders/AutoConfirmToggle"
import { SocketStatus } from "../IncomingOrders/SocketStatus"
import type { FilterOption } from "../IncomingOrders/GatewayFilters"
import {
  OFF_CONFIG,
  defaultInvoiceChoice,
  getFiscalConfig,
  invoiceOrder,
  type FiscalConfig,
  type FiscalDocumentSummary,
  type InvoiceChoice,
} from "../../services/fiscal"
import { chargeOnPoint, isPointEnabled, PointChargeError } from "../../services/mp-point"

type CounterView = "salon" | "mostrador" | "entrantes" | "mis_pedidos" | "reservaciones"
type Scene = "salon" | "mesa" | "productos" | "configurar" | "revision" | "cobro" | "cierre" | "setup" | "mostrador_rapido" | "entrantes" | "mis_pedidos" | "reservaciones"
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
  total: number
  status: "valid" | "needs_attention"
}


const SYNC_URL = import.meta.env.VITE_SYNC_URL

/**
 * Mensaje para el cajero. Los errores de negocio del server (400/409) traen
 * un mensaje en castellano que explica qué pasó (p. ej. "precio de carta
 * cambió"); antes se mostraba siempre el genérico (Auditoría §11.5-2).
 * Un 500 es opaco por diseño: se muestra el fallback.
 */
function describePosError(err: unknown, fallback: string): string {
  if (err instanceof PosApiError && err.status >= 400 && err.status < 500 && err.status !== 401) {
    return err.message || fallback
  }
  return fallback
}

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
  // Cobro: `paying` bloquea el doble click; `pendingOrderIdRef` fija el posId
  // de la orden ANTES del primer intento para que un reintento no la duplique.
  const [paying, setPaying] = useState(false)
  const [sendToKitchen, setSendToKitchen] = useState(true)
  /** Celular del cliente para el club (opcional, se pide al cobrar). */
  const [clubPhone, setClubPhone] = useState("")
  const [lastSale, setLastSale] = useState<{ total: number; sentToKitchen: boolean; invoices?: FiscalDocumentSummary[] } | null>(null)
  // Factura electrónica (Fase 5): config del comercio y elección del cobro actual.
  const [fiscalConfig, setFiscalConfig] = useState<FiscalConfig>(OFF_CONFIG)
  const [invoiceChoice, setInvoiceChoice] = useState<InvoiceChoice>(() => defaultInvoiceChoice(OFF_CONFIG))

  // MercadoPago Point (Fase 6): posnet integrado de la sede. Los pagos ya
  // aprobados se recuerdan por parte: si el registro del cobro falla y el
  // cajero reintenta, NO se vuelve a cobrar en el posnet.
  const [pointEnabled, setPointEnabled] = useState(false)
  const pointPaidRef = useRef(new Map<string, string>())
  useEffect(() => {
    if (!tenantId) return
    let alive = true
    isPointEnabled(tenantId).then((enabled) => alive && setPointEnabled(enabled))
    return () => {
      alive = false
    }
  }, [tenantId])

  useEffect(() => {
    if (!tenantId) return
    let alive = true
    getFiscalConfig(tenantId).then((config) => {
      if (!alive) return
      setFiscalConfig(config)
      setInvoiceChoice(defaultInvoiceChoice(config))
    })
    return () => {
      alive = false
    }
  }, [tenantId])
  const pendingOrderIdRef = useRef<string | null>(null)
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
  const [selectedKanbanOrderId, setSelectedKanbanOrderId] = useState<string | null>(null)

  const showToast = useCallback((message: string, type: string) => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const { setContextPanel, setActionBar } = useLayout()
  const { tables, occupyTable, freeTable, reserveTable, occupyTableForLoading, bindTableOrder } = useTables()
  const tableActivity = useTableActivity(tenantId)
  const now = useNow()
  const { products, categories } = useMenu()
  const { processPayment } = usePayments()
  const { createOrder, confirmOrder } = useOrders()
  const { confirmAndSendToKitchen } = useKitchenCommands()

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
  const gatewayOrdersLive = useLiveQuery(
    () => (tenantId
      ? db.orders
          .where("tenantId")
          .equals(tenantId)
          .and((o) => o.source === "external" && !o.integratedAt && o.status !== "cancelled" && o.status !== "delivered")
          .toArray()
      : []),
    [tenantId]
  )
  const gatewayOrders = useMemo(() => gatewayOrdersLive ?? [], [gatewayOrdersLive])

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
  const posOrdersLive = useLiveQuery(
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
  )
  const posOrders = useMemo(() => posOrdersLive ?? [], [posOrdersLive])

  // ── Aviso de pedidos nuevos (sonido único: services/notification-sound) ──
  // Con refs y no con estado: el aviso es un efecto externo, no algo que se
  // renderice. Entrantes suena también con la cola inicial (son pedidos
  // esperando respuesta). Mis Pedidos NO suena por el lote inicial ni por
  // las órdenes que creó esta misma terminal (antes: toast + sonido por cada
  // venta propia y por todas las órdenes al abrir la vista).
  const seenGatewayRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const fresh = gatewayOrders.filter((o) => !seenGatewayRef.current.has(o.id))
    if (fresh.length === 0) return
    fresh.forEach((o) => seenGatewayRef.current.add(o.id))
    playOrderNotification()
  }, [gatewayOrders])

  const ownOrderIdsRef = useRef<Set<string>>(new Set())
  const seenPosRef = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (posOrdersLive === undefined) return
    if (seenPosRef.current === null) {
      seenPosRef.current = new Set(posOrdersLive.map((o) => o.id))
      return
    }
    const seen = seenPosRef.current
    const fresh = posOrdersLive.filter((o) => !seen.has(o.id))
    if (fresh.length === 0) return
    fresh.forEach((o) => seen.add(o.id))
    const foreign = fresh.filter((o) => !ownOrderIdsRef.current.has(o.id))
    if (foreign.length === 0) return
    playOrderNotification()
    showToast(`Nuevo pedido POS: #${foreign[0].id.slice(0, 8)}`, "info")
  }, [posOrdersLive, showToast])

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
        total: item.total,
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

  // Ciclo de vida de pedidos EXTERNOS: el id del POS es el `_id` del SyncLayer,
  // por eso van por advanceExternalOrder() (Sync → SaaS con externalOrderId)
  // y nunca por PATCH /api/[tenant]/pos/orders/:id, que responde 404.
  const handlePrepareExternal = useCallback(async (orderId: string) => {
    if (!tenantId) return
    try {
      await advanceExternalOrder(orderId, tenantId, "preparing", state.jwt?.accessToken)
      showToast("Pedido en preparación", "success")
    } catch {
      showToast("Error al iniciar preparación", "error")
    }
  }, [tenantId, state.jwt?.accessToken])

  const handleMarkReadyExternal = useCallback(async (orderId: string) => {
    if (!tenantId) return
    try {
      await advanceExternalOrder(orderId, tenantId, "ready", state.jwt?.accessToken)
      showToast("Pedido listo", "success")
    } catch {
      showToast("Error al marcar listo", "error")
    }
  }, [tenantId, state.jwt?.accessToken])

  const handleDeliverExternal = useCallback(async (orderId: string) => {
    if (!tenantId) return
    try {
      await advanceExternalOrder(orderId, tenantId, "delivered", state.jwt?.accessToken)
      showToast("Pedido entregado", "success")
    } catch {
      showToast("Error al entregar", "error")
    }
  }, [tenantId, state.jwt?.accessToken])

  const handleSetEnRutaExternal = useCallback(async (orderId: string) => {
    if (!tenantId) return
    try {
      await advanceExternalOrder(orderId, tenantId, "en_ruta", state.jwt?.accessToken)
      showToast("Pedido en ruta", "success")
    } catch {
      showToast("Error al marcar en ruta", "error")
    }
  }, [tenantId, state.jwt?.accessToken])

  const handleSetArrivedExternal = useCallback(async (orderId: string) => {
    if (!tenantId) return
    try {
      await advanceExternalOrder(orderId, tenantId, "arrived", state.jwt?.accessToken)
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

  // Órdenes POS abiertas de la mesa elegida (rondas que ya se mandaron a
  // cocina — desde el Salón del cajero o desde la terminal del mozo). Antes
  // el Counter abría la mesa con el carrito vacío y no había forma de
  // cobrarlas.
  const tableOrdersLive = useLiveQuery(
    () => (tenantId && selectedTableId
      ? db.orders
          .where("tenantId")
          .equals(tenantId)
          .and((o) =>
            o.source === "pos" &&
            o.tableId === selectedTableId &&
            o.status !== "delivered" &&
            o.status !== "cancelled"
          )
          .toArray()
      : []),
    [tenantId, selectedTableId]
  )
  const tableOrders = useMemo(() => tableOrdersLive ?? [], [tableOrdersLive])

  const unpaidTableOrders = useMemo(
    () => tableOrders.filter((o) => !o.payments?.length),
    [tableOrders]
  )

  /** Lo que se cobra: rondas sin cobrar de la mesa + el carrito actual. */
  const chargeTotal = useMemo(
    () => cartTotal + unpaidTableOrders.reduce((sum, o) => sum + o.total, 0),
    [cartTotal, unpaidTableOrders]
  )

  // Si el carrito cambia, la orden del próximo intento es otra.
  useEffect(() => {
    pendingOrderIdRef.current = null
  }, [cart])

  // ── Mesa ocupada al cargar (sin cobro) ─────────────────────────────────
  // El Salón muestra la mesa ocupada en cuanto el cajero empieza a cargar,
  // aunque nunca cobre: ocupación "draft" = server-first, occupied SIN orden
  // (services/table.ts). Las mutaciones de mesa se encolan en serie porque
  // occupy y free pueden cruzarse (se carga y se vacía el carrito en el
  // mismo tick) y en paralelo el 409 de concurrencia optimista del server
  // haría fallar la que llegara segundo.
  const tableOpChainRef = useRef<Promise<void>>(Promise.resolve())

  const queueTableOp = useCallback((op: () => Promise<void>) => {
    tableOpChainRef.current = tableOpChainRef.current
      .catch(() => {})
      .then(op)
      .catch((err) => console.warn("[Counter] table operation failed:", err))
  }, [])

  /** Draft = occupied sin currentOrderId (nadie cobró todavía). */
  const isDraftOccupied = useCallback(
    (tableId: string | null): boolean => {
      if (!tableId) return false
      const t = tables.find((x) => x.id === tableId)
      return Boolean(t && t.status === "occupied" && !t.currentOrderId)
    },
    [tables]
  )

  const maybeOccupyForLoading = useCallback(
    (tableId: string | null) => {
      if (!tenantId || !tableId) return
      const t = tables.find((x) => x.id === tableId)
      if (!t || t.status !== "free") return
      queueTableOp(() => occupyTableForLoading(tableId, "counter"))
    },
    [tenantId, tables, queueTableOp, occupyTableForLoading]
  )

  const maybeFreeDraft = useCallback(
    (tableId: string | null) => {
      if (!tenantId || !tableId || !isDraftOccupied(tableId)) return
      queueTableOp(() => freeTable(tableId))
    },
    [tenantId, isDraftOccupied, queueTableOp, freeTable]
  )

  const handleViewChange = useCallback((viewId: string) => {
    // El carrito muere acá: si la mesa quedó ocupada en draft, suéltala.
    maybeFreeDraft(selectedTableId)
    setView(viewId as CounterView)
    setCart([])
    setCustomer(null)
    setSelectedTableId(null)
    setSelectedCategory(null)
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
  }, [selectedTableId, maybeFreeDraft])

  const handleSelectTable = useCallback((tableId: string) => {
    if (selectedTableId && selectedTableId !== tableId) {
      // Cambiar de mesa (el carrito viaja a la nueva): el draft anterior
      // queda suelto o se clava ocupada para siempre.
      maybeFreeDraft(selectedTableId)
    } else if (tableId === selectedTableId && cart.length === 0) {
      // Reentrar con el carrito vacío sanea un draft huérfano.
      maybeFreeDraft(tableId)
    }
    if (cart.length > 0) {
      // El carrito ya tiene items: el trigger del primer item no vuelve a
      // correr, así que la mesa nueva se ocupa acá.
      maybeOccupyForLoading(tableId)
    }
    setSelectedTableId(tableId)
    // Escena "Mesa seleccionada" (Scene Architecture §13): primero se ve la
    // mesa y su cuenta; agregar productos es una decisión. Si el carrito ya
    // viaja de otra mesa, se sigue cargando.
    setScene(cart.length > 0 ? "productos" : "mesa")
  }, [selectedTableId, cart.length, maybeFreeDraft, maybeOccupyForLoading])

  /** Reservar / liberar desde la escena de mesa. El server valida la transición. */
  const handleTableTransition = useCallback(async (kind: "reserve" | "free") => {
    if (!selectedTableId) return
    try {
      if (kind === "reserve") await reserveTable(selectedTableId)
      else await freeTable(selectedTableId)
      showToast(kind === "reserve" ? "Mesa reservada" : "Mesa liberada", "success")
    } catch (err) {
      showToast(describePosError(err, "No se pudo cambiar el estado de la mesa"), "error")
    }
  }, [selectedTableId, reserveTable, freeTable, showToast])

  const handleAddProduct = useCallback((product: Product) => {
    const hasModifiers = product.modifiers && product.modifiers.length > 0
    if (hasModifiers) {
      setConfigProduct(product)
      setScene("configurar")
      return
    }
    const isFirstItem = cart.length === 0
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id)
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id
            ? { ...i, quantity: i.quantity + 1, total: calculateItemTotal({ ...i, quantity: i.quantity + 1 }) }
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
    if (isFirstItem) maybeOccupyForLoading(selectedTableId)
  }, [cart.length, selectedTableId, maybeOccupyForLoading])

  const handleUpdateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      const isEmptying = cart.length === 1
      setCart((prev) => prev.filter((i) => i.productId !== productId))
      if (isEmptying) maybeFreeDraft(selectedTableId)
      return
    }
    setCart((prev) =>
      prev.map((i) =>
        i.productId === productId
          ? { ...i, quantity, total: calculateItemTotal({ ...i, quantity }) }
          : i
      )
    )
  }, [cart.length, selectedTableId, maybeFreeDraft])

  const handleRemoveItem = useCallback((productId: string) => {
    const isEmptying = cart.length === 1
    setCart((prev) => prev.filter((i) => i.productId !== productId))
    if (isEmptying) maybeFreeDraft(selectedTableId)
  }, [cart.length, selectedTableId, maybeFreeDraft])

  const handleConfigConfirm = useCallback((item: OrderItem) => {
    if (!configProduct) return
    const isFirstItem = cart.length === 0
    setCart((prev) => [...prev, { ...item, product: configProduct }])
    setConfigProduct(null)
    // En Mostrador la grilla de productos es la escena "mostrador_rapido";
    // volver a "productos" dejaba la pantalla en blanco.
    setScene(view === "mostrador" ? "mostrador_rapido" : "productos")
    if (isFirstItem) maybeOccupyForLoading(selectedTableId)
  }, [configProduct, cart.length, selectedTableId, maybeOccupyForLoading, view])

  const showErrorToast = useCallback((message: string) => {
    setToast({ message, type: "error" })
    setTimeout(() => setToast(null), 4000)
  }, [])

  /** Items del carrito tal como viajan al server (con modifiers y notas). */
  const cartToOrderItems = useCallback(
    (): OrderItem[] =>
      cart.map((item) => ({
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total,
        // Auditoría §4.3: antes handlePay descartaba modifiers y notas → el
        // server rechazaba por descuadre o la comanda salía sin detalle.
        ...(item.modifiers?.length ? { modifiers: item.modifiers } : {}),
        ...(item.notes ? { notes: item.notes } : {}),
      })),
    [cart]
  )

  // ── Salón: mandar la ronda a cocina SIN cobrar ─────────────────────────
  // Mismo orquestador que el mozo: crea la orden, ata la mesa, la confirma
  // (el server genera la comanda para el printer-agent) y deja la comanda
  // local. La mesa queda abierta y se cobra después (handlePay).
  const handleSendToKitchen = useCallback(async () => {
    if (!tenantId || !selectedTableId || cart.length === 0 || paying) return
    setPaying(true)
    try {
      await tableOpChainRef.current.catch(() => {})
      // id fijado antes: la orden llega a Dexie (y al aviso de "pedido
      // nuevo") antes de que esta función vuelva.
      const roundId = crypto.randomUUID()
      ownOrderIdsRef.current.add(roundId)
      await sendWaiterOrderToKitchen(
        {
          createOrder: (tableId, items) => createOrder(tableId, items, undefined, undefined, { id: roundId }),
          readTable: (tableId) => db.diningTable.get(tableId),
          occupyTable,
          bindTableOrder,
          confirmOrder,
          sendToKitchen: confirmAndSendToKitchen,
        },
        { tableId: selectedTableId, items: cartToOrderItems(), serverId: "counter" }
      )
      setCart([])
      showToast("✓ Ronda enviada a cocina", "success")
      setScene("productos")
    } catch (err) {
      console.error("[Counter] sendToKitchen failed:", err)
      showErrorToast(describePosError(err, "Error al enviar a cocina"))
    } finally {
      setPaying(false)
    }
  }, [tenantId, selectedTableId, cart.length, paying, createOrder, occupyTable, bindTableOrder, confirmOrder, confirmAndSendToKitchen, cartToOrderItems, showToast, showErrorToast])

  // ── Cobro ────────────────────────────────────────────────────────────────
  // 1. Si hay carrito, crea su orden (posId fijo → reintento idempotente).
  //    Mostrador + "Enviar a cocina" ⇒ nace `confirmed` (comanda).
  // 2. Reparte las partes entre las órdenes a cobrar (rondas de la mesa +
  //    la nueva) y registra el cobro en cada orden (el server valida que la
  //    suma cierre contra SU total).
  // 3. Deja un movimiento de caja por parte (cualquier método).
  // 4. Cierra: mesa / venta inmediata → `delivered` por el grafo legal; el
  //    mostrador enviado a cocina queda en Mis Pedidos.
  const handlePay = useCallback(async (parts: CheckoutPart[]) => {
    if (!tenantId || paying) return
    const keepForKitchen = view === "mostrador" && sendToKitchen
    const tableId = selectedTableId ?? `mostrador-${Date.now()}`
    setPaying(true)
    try {
      // Espera las mutaciones de mesa en vuelo (draft-occupy del primer
      // item): sin esto la ocupación real llegaría antes que el draft, el
      // server respondería 409 por concurrencia optimista y el cobro se
      // cortaría con la orden creada a medio camino.
      await tableOpChainRef.current.catch(() => {})

      const toCharge: Order[] = [...unpaidTableOrders]

      if (cart.length > 0) {
        const orderId = pendingOrderIdRef.current ?? crypto.randomUUID()
        pendingOrderIdRef.current = orderId
        ownOrderIdsRef.current.add(orderId)
        const order = await createOrder(tableId, cartToOrderItems(), undefined, undefined, {
          id: orderId,
          status: keepForKitchen ? "confirmed" : "pending",
        })

        // La mesa ya puede estar ocupada por la carga en curso (draft, sin
        // orden): re-leer el read model local decide si ocupar de nuevo o
        // solo vincular. occupied con OTRA orden no se toca.
        if (selectedTableId) {
          const fresh = await db.diningTable.get(selectedTableId)
          if (fresh?.status === "free") {
            await occupyTable(selectedTableId, "counter", order.id)
          } else if (fresh?.status === "occupied" && !fresh.currentOrderId) {
            await bindTableOrder(selectedTableId, "counter", order.id)
          }
          // En Salón la orden ya existe y es visible en la mesa: si un paso
          // siguiente falla, el reintento la cobra desde ahí (no desde el
          // carrito), así que el carrito se vacía ya para no duplicarla.
          setCart([])
        }
        if (!toCharge.some((o) => o.id === order.id)) toCharge.push(order)
      }

      if (toCharge.length === 0) {
        showErrorToast("No hay nada para cobrar")
        return
      }

      let allocation: Map<string, AllocatedPayment[]>
      try {
        allocation = allocatePayments(
          toCharge.map((o) => ({ id: o.id, total: o.total })),
          parts
        )
      } catch {
        showErrorToast("El total cambió (precios o rondas nuevas). Revisá el cobro y confirmá de nuevo.")
        return
      }

      const label = selectedTable ? `M${selectedTable.number}` : "mostrador"
      let clubPhoneFailed = false
      for (const order of toCharge) {
        const allocated = allocation.get(order.id) ?? []
        if (pointEnabled) {
          for (const part of allocated) {
            if (part.method !== "mercadopago" || part.reference) continue
            const known = pointPaidRef.current.get(part.id)
            const paymentId = known ?? (await chargeOnPoint(tenantId, order.id, part.amount))
            pointPaidRef.current.set(part.id, paymentId)
            part.reference = `MP Point ${paymentId}`
          }
        }
        await recordPayments(tenantId, order.id, allocated, `Pedido ${label}`)

        // Club: el celular viaja ANTES de entregar, así el pedido entregado
        // suma los puntos del cliente. Si falla, el cobro sigue: es un extra.
        if (clubPhone.replace(/\D/g, "").length >= 8) {
          try {
            await setOrderCustomerPhone(tenantId, order.id, clubPhone)
          } catch (err) {
            console.warn("[Counter] No se pudo guardar el celular del club:", err)
            clubPhoneFailed = true
          }
        }

        // Registro en caja por parte: relatedOrderId lleva `#n` cuando la
        // orden tiene varias partes (el índice único del server es por
        // relatedOrderId + type: sin el sufijo, la parte 2 chocaría con la 1).
        for (let i = 0; i < allocated.length; i++) {
          const part = allocated[i]
          const isSplit = allocated.length > 1
          await processPayment(
            order.id,
            part.amount,
            `Pedido ${label}` + (isSplit ? ` (parte ${i + 1}/${allocated.length})` : ""),
            part.method,
            isSplit ? `${order.id}#${i}` : undefined
          )
        }
      }

      if (!keepForKitchen) {
        // También se cierran las rondas ya cobradas que seguían abiertas.
        const toClose = [
          ...toCharge,
          ...tableOrders.filter((o) => !toCharge.some((c) => c.id === o.id)),
        ]
        for (const order of toClose) {
          await settleToDelivered(tenantId, order.id, jwt)
        }
        // El server libera la mesa solo si currentOrderId coincide; con
        // varias rondas (o una ocupación draft) puede seguir ocupada.
        if (selectedTableId) {
          const fresh = await db.diningTable.get(selectedTableId)
          if (fresh && fresh.status !== "free") await freeTable(selectedTableId)
        }
      }

      // Factura (Fase 5): una por orden cobrada. Nunca corta la venta: si ARCA
      // no responde, queda pendiente y se reintenta sola.
      const invoices: FiscalDocumentSummary[] = []
      if (fiscalConfig.enabled && invoiceChoice.type !== "none") {
        for (const order of toCharge) {
          try {
            invoices.push(await invoiceOrder(tenantId, order.id, invoiceChoice))
          } catch (err) {
            invoices.push({
              id: order.id,
              kind: "invoice",
              letter: "",
              status: "retrying",
              label: "Factura",
              cae: null,
              totalCents: order.total,
              message: describePosError(err, "No se pudo facturar"),
            })
          }
        }
      }

      pointPaidRef.current.clear()
      setLastSale({ total: parts.reduce((s, p) => s + p.amount, 0), sentToKitchen: keepForKitchen, invoices })
      setInvoiceChoice(defaultInvoiceChoice(fiscalConfig))
      if (clubPhoneFailed) showErrorToast("El cobro quedó registrado, pero no se pudo guardar el celular del club.")
      setClubPhone("")
      pendingOrderIdRef.current = null
      setCart([])
      setScene("cierre")
    } catch (err) {
      console.error("[Counter] Payment failed:", err)
      if (err instanceof PointChargeError) {
        showErrorToast(err.canceled ? "Cobro con posnet cancelado: la venta sigue abierta." : err.message)
        return
      }
      showErrorToast(describePosError(err, "Error al procesar el pago. Intente nuevamente."))
    } finally {
      setPaying(false)
    }
  }, [tenantId, paying, view, sendToKitchen, clubPhone, selectedTableId, selectedTable, unpaidTableOrders, tableOrders, cart.length, cartToOrderItems, createOrder, occupyTable, bindTableOrder, freeTable, processPayment, jwt, showErrorToast, fiscalConfig, invoiceChoice, pointEnabled])

  const handleNewSale = useCallback(() => {
    maybeFreeDraft(selectedTableId)
    setCart([])
    setCustomer(null)
    setSelectedTableId(null)
    setSelectedCategory(null)
    setLastSale(null)
    setSendToKitchen(true)
    setClubPhone("")
    const defaults: Record<string, Scene> = {
      salon: "salon",
      mostrador: "mostrador_rapido",
      entrantes: "entrantes",
      reservaciones: "reservaciones",
    }
    setScene(defaults[view] ?? "salon")
  }, [view, selectedTableId, maybeFreeDraft])

  // ============================================================================
  // DERIVED STATE
  // ============================================================================

  // Filtros por modo del pedido: el orderMode viaja SaaS → Sync → POS
  // (antes delivery/take away estaban fijos en 0 y no filtraban nada).
  // Marketplaces sigue deshabilitado: no hay integración.
  const filteredGatewayOrders = useMemo(() => {
    switch (gatewayFilter) {
      case "delivery":
        return gatewayOrders.filter((o) => o.orderMode === "delivery")
      case "takeaway":
        return gatewayOrders.filter((o) => o.orderMode === "takeaway")
      case "pending_payment":
        return gatewayOrders.filter((o) => o.status === "pending")
      default:
        return gatewayOrders
    }
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
    delivery: gatewayOrders.filter((o) => o.orderMode === "delivery").length,
    takeaway: gatewayOrders.filter((o) => o.orderMode === "takeaway").length,
    marketplace: 0,
    pending_payment: gatewayPendingCount,
  }), [gatewayOrders, gatewayPendingCount])

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

      case "mesa": {
        if (!selectedTable) {
          setContextPanel(null)
          setActionBar(null)
          break
        }
        const activity = tableActivity.get(selectedTable.id)
        const unpaid = activity?.unpaid ?? 0
        const canRelease = !activity && (selectedTable.status === "reserved" || selectedTable.status === "occupied")
        setContextPanel({
          title: `Mesa ${selectedTable.number}`,
          subtitle: selectedTable.section || "Sala Principal",
          body: <MesaContextPanel table={selectedTable} activity={activity} orders={tableOrders} now={now} />,
          openOnMobile: true,
        })
        // Action Bar con slots fijos (Axioma 04): izquierda = entidad/total,
        // centro = secundarias, derecha = la ÚNICA acción principal.
        setActionBar({
          left: (
            <div className="action-bar-total">
              <span className="action-bar-total-label">Cuenta Mesa {selectedTable.number}</span>
              <span className="action-bar-total-value">{formatCurrency(activity?.total ?? 0)}</span>
            </div>
          ),
          center: (
            <>
              <button className="btn btn-ghost" onClick={() => { setSelectedTableId(null); setScene("salon") }}>
                ← Salón
              </button>
              {unpaid > 0 && (
                <button className="btn btn-secondary" onClick={() => setScene("productos")}>
                  + Agregar productos
                </button>
              )}
              {selectedTable.status === "free" && (
                <button className="btn btn-secondary" onClick={() => handleTableTransition("reserve")}>
                  Reservar
                </button>
              )}
              {canRelease && (
                <button className="btn btn-secondary" onClick={() => handleTableTransition("free")}>
                  Liberar mesa
                </button>
              )}
            </>
          ),
          right: unpaid > 0 ? (
            <button className="btn btn-primary btn-lg" onClick={() => setScene("cobro")}>
              Cobrar {formatCurrency(unpaid)}
            </button>
          ) : (
            <button className="btn btn-primary btn-lg" onClick={() => setScene("productos")}>
              + Agregar productos
            </button>
          ),
        })
        break
      }

      case "productos":
      case "mostrador_rapido": {
        // Salón (productos) y Mostrador (mostrador_rapido) comparten panel:
        // antes "mostrador_rapido" no tenía case y la venta rápida quedaba
        // sin carrito ni botón de cobro (Auditoría §4.1).
        const isMostrador = scene === "mostrador_rapido"
        const title = isMostrador ? "Mostrador" : `Mesa ${selectedTable?.number ?? "?"}`
        const openTotal = chargeTotal - cartTotal
        setContextPanel({
          title,
          subtitle: cart.length > 0
            ? `${cart.length} items — ${formatCurrency(cartTotal)}`
            : openTotal > 0 ? `Cuenta abierta — ${formatCurrency(openTotal)}` : "Sin productos",
          body: (
            <>
              {!isMostrador && tableOrders.length > 0 && (
                <div className="card" style={{ padding: "var(--sp-3)", margin: "var(--sp-2)" }}>
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Ya enviado a cocina ({tableOrders.length} {tableOrders.length === 1 ? "ronda" : "rondas"})
                  </div>
                  {tableOrders.flatMap((o) => o.items).map((item, idx) => (
                    <div key={`${item.productId}-${idx}`} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--font-size-sm)", marginTop: 4 }}>
                      <span>{item.quantity}× {item.name}</span>
                      <span>{formatCurrency(item.total)}</span>
                    </div>
                  ))}
                </div>
              )}
              <OrderPanel
                title={tableOrders.length > 0 && !isMostrador ? "Nueva ronda" : title}
                items={cart}
                onUpdateQuantity={handleUpdateQuantity}
                onRemoveItem={handleRemoveItem}
                total={cartTotal}
                primaryAction={{
                  label: cart.length > 0 ? "Revisar pedido" : "Cobrar cuenta",
                  onClick: () => setScene(cart.length > 0 ? "revision" : "cobro"),
                  disabled: cart.length === 0 && chargeTotal === 0,
                }}
              />
            </>
          ),
        })
        setActionBar({
          left: isMostrador ? undefined : (
            <button className="btn btn-ghost" onClick={() => setScene(cart.length > 0 ? "salon" : "mesa")}>
              ← {cart.length > 0 ? "Salón" : `Mesa ${selectedTable?.number ?? ""}`}
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
      }

      case "configurar":
        setContextPanel(null)
        setActionBar(null)
        break

      case "revision": {
        const isMostrador = view === "mostrador"
        setContextPanel({
          title: "Resumen del pedido",
          subtitle: `${isMostrador ? "Mostrador" : `Mesa ${selectedTable?.number ?? "?"}`}${customer ? ` — ${customer.name}` : ""}`,
          body: (
            <OrderPanel
              title={isMostrador ? "Resumen" : "Nueva ronda"}
              items={cart}
              total={cartTotal}
              primaryAction={{
                label: `Cobrar ${formatCurrency(chargeTotal)}`,
                onClick: () => setScene("cobro"),
                disabled: chargeTotal === 0 || paying,
              }}
            />
          ),
        })
        setActionBar({
          left: (
            <button className="btn btn-ghost" onClick={() => setScene(isMostrador ? "mostrador_rapido" : "productos")}>
              ← Agregar más
            </button>
          ),
          right: !isMostrador && cart.length > 0 ? (
            <button className="btn btn-secondary btn-sm" onClick={handleSendToKitchen} disabled={paying}>
              {paying ? "Enviando…" : "Enviar a cocina (sin cobrar)"}
            </button>
          ) : undefined,
        })
        break
      }

      case "cobro":
        setContextPanel({
          title: "Resumen de cuenta",
          subtitle: view === "mostrador" ? "Mostrador" : `Mesa ${selectedTable?.number ?? "?"}`,
          body: (
            <div style={{ padding: "var(--sp-2)" }}>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Total
              </div>
              <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700 }}>
                {formatCurrency(chargeTotal)}
              </div>
              {chargeTotal !== cartTotal && (
                <div className="text-sm text-muted" style={{ marginTop: "var(--sp-2)" }}>
                  Incluye {unpaidTableOrders.length} {unpaidTableOrders.length === 1 ? "ronda enviada" : "rondas enviadas"} a cocina
                </div>
              )}
            </div>
          ),
        })
        setActionBar({
          left: (
            <div className="action-bar-total">
              <span className="action-bar-total-label">Total a cobrar</span>
              <span className="action-bar-total-value">{formatCurrency(chargeTotal)}</span>
            </div>
          ),
          center: (
            <button className="btn btn-ghost" onClick={() => setScene(cart.length > 0 ? "revision" : view === "mostrador" ? "mostrador_rapido" : "productos")} disabled={paying}>
              ← Volver
            </button>
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
                          {formatCurrency(item.total)}
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
                             selectedKanbanOrder.status === "arrived" ? "var(--primary-action)" : "var(--text-muted)",
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
                        <span>Costos operativos y/o comerciales</span>
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
                      <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: "var(--primary-action)" }}>
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
              <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: "var(--primary-action)" }}>
                {formatCurrency(lastSale?.total ?? 0)}
              </div>
              {lastSale?.sentToKitchen && (
                <div className="text-sm" style={{ marginTop: "var(--sp-2)" }}>
                  Enviado a cocina — se entrega desde <strong>Mis Pedidos</strong>.
                </div>
              )}
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
            </div>
          ),
        })
        setActionBar({
          right: (
            <button className="btn btn-primary" onClick={handleNewSale}>
              Nueva venta
            </button>
          ),
        })
        break
    }
  }, [scene, view, selectedTable, tableActivity, now, handleTableTransition, cart, cartTotal, chargeTotal, tableOrders, unpaidTableOrders, paying, lastSale, handleSendToKitchen, customer, entrantesSubView, gatewayScene, gatewayOrders, kanbanOrders, gatewayPendingCount, gatewayPaidCount, connected, selectedOrder, selectedKanbanOrderId, validationItems, transformResult, transforming, setContextPanel, setActionBar, handleUpdateQuantity, handleRemoveItem, handleNewSale, handleConfirmAllPaid, handleGatewayBack, handleRejectOrder, handleTransform, handlePrepareExternal, handleMarkReadyExternal, handleDeliverExternal, handleSetEnRutaExternal, handleSetArrivedExternal])

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

          {(scene === "salon" || scene === "mesa") && (
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
                  <>
                    <SalonMap
                      tables={tables}
                      variant="counter"
                      activity={tableActivity}
                      selectedTableId={selectedTableId}
                      onSelectTable={handleSelectTable}
                    />
                  </>
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
                    Mesa {selectedTable?.number ?? "?"} — {formatCurrency(chargeTotal)}
                  </div>
                </div>
              </div>
              <div className="p-6" style={{ maxWidth: 520, margin: "0 auto", width: "100%" }}>
                {/* key: si el total cambia (ronda nueva por polling) el cobro arranca de cero */}
                <CheckoutPanel
                  key={chargeTotal}
                  total={chargeTotal}
                  busy={paying}
                  onConfirm={handlePay}
                  clubPhone={{ value: clubPhone, onChange: setClubPhone }}
                  invoice={{ config: fiscalConfig, value: invoiceChoice, onChange: setInvoiceChoice }}
                />
              </div>
            </div>
          )}

          {scene === "cierre" && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "center", justifyContent: "center" }}>
              <div className="text-center">
                <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
                <div className="workspace-title" style={{ marginBottom: 8 }}>Mesa cerrada</div>
                <div className="workspace-subtitle" style={{ marginBottom: 24 }}>
                  {formatCurrency(lastSale?.total ?? 0)} — Mesa {selectedTable?.number ?? "?"}
                </div>
                <InvoiceResults invoices={lastSale?.invoices} />
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
                    {formatCurrency(chargeTotal)}
                  </div>
                </div>
              </div>
              <div className="p-6" style={{ maxWidth: 520, margin: "0 auto", width: "100%" }}>
                <CheckoutPanel
                  key={chargeTotal}
                  total={chargeTotal}
                  busy={paying}
                  onConfirm={handlePay}
                  sendToKitchen={{ value: sendToKitchen, onChange: setSendToKitchen }}
                  clubPhone={{ value: clubPhone, onChange: setClubPhone }}
                  invoice={{ config: fiscalConfig, value: invoiceChoice, onChange: setInvoiceChoice }}
                />
              </div>
            </div>
          )}

          {scene === "cierre" && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "center", justifyContent: "center" }}>
              <div className="text-center">
                <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
                <div className="workspace-title" style={{ marginBottom: 8 }}>Venta completada</div>
                <div className="workspace-subtitle" style={{ marginBottom: 8 }}>
                  {formatCurrency(lastSale?.total ?? 0)} — Mostrador
                </div>
                {lastSale?.sentToKitchen && (
                  <div className="text-sm text-muted">Enviado a cocina — entregalo desde Mis Pedidos.</div>
                )}
                <InvoiceResults invoices={lastSale?.invoices} />
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
                          background: "var(--primary-action-light)",
                          color: "var(--primary-action)",
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
  const now = useNow()
  const minutes = Math.floor((now - new Date(order.createdAt).getTime()) / 60000)
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
                       order.status === "arrived" ? "var(--primary-action)" : "var(--text-muted)",
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
  const now = useNow()
  const minutes = Math.floor((now - new Date(order.createdAt).getTime()) / 60000)
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

/** Resultado de la factura en la pantalla de venta completada (Fase 5). */
function InvoiceResults({ invoices }: { invoices?: FiscalDocumentSummary[] }) {
  if (!invoices || invoices.length === 0) return null
  return (
    <div className="invoice-results">
      {invoices.map((doc) => (
        <div key={doc.id} className={`invoice-result ${doc.status}`}>
          {doc.status === "authorized"
            ? `${doc.label} · CAE ${doc.cae}`
            : doc.status === "rejected"
              ? `ARCA rechazó la factura: ${doc.message ?? "revisá los datos"}`
              : "Factura esperando a ARCA — se emite sola en cuanto responda"}
        </div>
      ))}
    </div>
  )
}
