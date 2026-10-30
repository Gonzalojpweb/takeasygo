import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import type { ComponentType } from "react"
import type { ItemCourse, Product, OrderItem, CustomerProfile, Order } from "@takeasygo/types"
import { calculateItemTotal, allocatePayments, type CheckoutPart, type AllocatedPayment } from "@takeasygo/business/browser"
import { useLiveQuery } from "dexie-react-hooks"
import { useTables } from "../../hooks/useTables"
import { useMenu } from "../../hooks/useMenu"
import { useEscapeBack } from "../../hooks/useEscapeBack"
import { setItemAvailability } from "../../services/menu"
import { usePayments } from "../../hooks/usePayments"
import { useOrders } from "../../hooks/useOrders"
import { useLayout } from "../layout/LayoutContext"
import { useAuth } from "../../hooks/useAuth"
import { ProductSelector } from "../shared/ProductSelector"
import { ProductConfigurationPanel } from "../shared/ProductConfigurationPanel"
import { OrderPanel } from "../shared/OrderPanel"
import { OrderReview } from "../shared/OrderReview"
import { CustomerSearch } from "../shared/CustomerSearch"
import { SaleDoneModal } from "../shared/SaleDoneModal"
import { CheckoutPanel } from "../shared/CheckoutPanel"
import { SalonMap, SalonHeaderBar, useSalonView } from "../shared/SalonMap"
import { TableDetail } from "./TableDetail"
import { ContextActionPanel, type ContextActionGroup } from "../shared/ContextActionPanel"
import { useTableActivity } from "../../hooks/useTableActivity"
import { useNow } from "../../hooks/useNow"
import { usePopularProducts } from "../../hooks/usePopularProducts"
import { WorkspaceViewBar } from "../shared/WorkspaceViewBar"
import { SalonSetup } from "./SalonSetup"
import { ReservationsView } from "./ReservationsView"
import { useReservations } from "../../hooks/useReservations"
import { actOnReservation, markReservationsSeen, type PosReservation, type ReservationAction } from "../../services/reservations"
import { isAppOrder, isExternalDeliveryOrder, DELIVERY_PLATFORMS } from "../../services/channels"
import { GuestsDialog } from "../shared/GuestsDialog"
import { VoidItemDialog } from "../shared/VoidItemDialog"
import { ConfirmDialog } from "../shared/ConfirmDialog"
import { DiscountDialog } from "../shared/DiscountDialog"
import { formatCurrency, timeAgo } from "../../utils/format"
import { recordPayments, settleToDelivered, setOrderCustomerPhone, voidSentItem, type ItemVoidReason, discountOrderLine, removeOrderLineDiscount, discountTable, removeTableDiscounts, type DiscountRequest, discountOrder, expectedDiscountCents, DISCOUNT_REASONS } from "../../services/order"
import { printPrecuenta } from "../../services/table"
import { sendWaiterOrderToKitchen } from "../../services/waiter-order"
import { useKitchenCommands } from "../../hooks/useKitchenCommands"
import { PosApiError } from "../../services/pos-api"
import { playOrderNotification } from "../../services/notification-sound"
import { db } from "../../db/dexie"
import { connectSocket } from "../../services/socket-client"
import {
  UtensilsCrossed, Store, Calendar, Smartphone, Bike, PackageCheck,
  Plus, Users, Receipt, Unlock, Printer, Wallet, Split, Percent, ArrowLeftRight, CalendarClock, DoorOpen, UserCheck, UserX, Unlink,
} from "lucide-react"
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

type CounterView = "salon" | "mostrador" | "entrantes" | "delivery" | "reservaciones"
type Scene = "salon" | "mesa" | "mover" | "productos" | "configurar" | "revision" | "cobro" | "cierre" | "setup" | "mostrador_rapido" | "mostrador_entregas" | "entrantes" | "delivery" | "reservaciones"
type EntrantesSubView = "gateway" | "kanban"
type GatewayScene = "queue" | "validation" | "transform"

interface ViewDef {
  id: string
  label: string
  icon: ComponentType<{ size?: number; className?: string }>
}

// Vistas del Counter (obs. 24/10):
//   · Pedidos App       = pedidos de la App TakeasyGO (SaaS online): aceptar y seguir.
//   · Delivery externo  = apps de delivery integradas (PedidosYa, Rappi…): canal propio.
//   · «Mis Pedidos» se eliminó: las rondas de mesa viven en el contexto Mesa y los
//     pedidos de Mostrador para entregar, en Mostrador → «Para entregar».
const COUNTER_VIEWS: ViewDef[] = [
  { id: "salon", label: "Salón", icon: UtensilsCrossed },
  { id: "mostrador", label: "Mostrador", icon: Store },
  { id: "entrantes", label: "Pedidos App", icon: Smartphone },
  { id: "delivery", label: "Delivery externo", icon: Bike },
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

export function CounterDashboard({ role }: { role?: string } = {}) {
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
  const [lastSale, setLastSale] = useState<{ total: number; sentToKitchen: boolean; invoices?: FiscalDocumentSummary[]; parts?: CheckoutPart[]; cashReceivedCents?: number | null } | null>(null)
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

  const { setContextPanel, setActionBar, setHeaderCenter } = useLayout()
  const popularIds = usePopularProducts(tenantId)
  // Obs. 24/10: reservas del día (badge en «Reservaciones», mesa reservada en el salón).
  const { reservations, unseen: unseenReservations, byTable: reservationsByTable, refresh: refreshReservations, clearUnseen } = useReservations(tenantId)
  const [reservationBusyId, setReservationBusyId] = useState<string | null>(null)
  const { tables, occupyTable, freeTable, reserveTable, occupyTableForLoading, occupyTableWithGuests, setTableGuests, bindTableOrder, markNeedsBill, moveTable, updateTableSetup } = useTables()
  // Fase C: quitar plato enviado (con motivo), cambiar / unir mesas.
  const [voidTarget, setVoidTarget] = useState<{ order: Order; item: OrderItem } | null>(null)
  const [voidBusy, setVoidBusy] = useState(false)
  const [joinTargetId, setJoinTargetId] = useState<string | null>(null)
  const [moveBusy, setMoveBusy] = useState(false)
  // Fase D: descuento a la cuenta de la mesa o a un plato.
  const [discountTarget, setDiscountTarget] = useState<{ scope: "table" } | { scope: "line"; order: Order; item: OrderItem } | null>(null)
  const [discountBusy, setDiscountBusy] = useState(false)
  // Fase E: descuento del Mostrador. Se elige ANTES de cobrar (la orden nace
  // al cobrar) y se aplica en el server justo después de crearla.
  const [mostradorDiscount, setMostradorDiscount] = useState<DiscountRequest | null>(null)
  const [mostradorDiscountOpen, setMostradorDiscountOpen] = useState(false)
  // Fase B: abrir la mesa pide comensales; también se corrigen desde la mesa.
  const [guestsPrompt, setGuestsPrompt] = useState<{ tableId: string; mode: "open" | "edit" } | null>(null)
  const [guestsBusy, setGuestsBusy] = useState(false)
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
          .and((o) => o.source === "external" && isAppOrder(o) && !o.integratedAt && o.status !== "cancelled" && o.status !== "delivered")
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
            isAppOrder(o) &&
            !!o.integratedAt &&
            o.status !== "delivered" &&
            o.status !== "cancelled" &&
            (o.status === "confirmed" || o.status === "preparing" || o.status === "ready" || o.status === "en_ruta" || o.status === "arrived")
          )
          .toArray()
      : []),
    [tenantId]
  ) ?? []

  // ── Pedidos del POS abiertos (source: "pos"). Los de Mostrador (sin
  //    mesa) que se mandaron a cocina se entregan desde «Para entregar». ──
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
  const pickupOrders = useMemo(
    () => posOrders.filter((o) => !o.tableId && o.status !== "pending").sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)),
    [posOrders]
  )

  // ── Delivery externo: pedidos de apps de delivery integradas ──────────
  const deliveryOrdersLive = useLiveQuery(
    () => (tenantId
      ? db.orders.where("tenantId").equals(tenantId)
          .and((o) => isExternalDeliveryOrder(o) && o.status !== "delivered" && o.status !== "cancelled")
          .toArray()
      : []),
    [tenantId]
  )
  const deliveryOrders = useMemo(() => deliveryOrdersLive ?? [], [deliveryOrdersLive])

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
  // Mostrador → «Para entregar»: un solo paso. La caja entrega lo que se
  // cobró y salió de cocina; no marca estados de cocina (obs. 24/10).
  // ============================================================================

  const handleHandOver = useCallback(async (orderId: string) => {
    if (!tenantId) return
    try {
      await settleToDelivered(tenantId, orderId, state.jwt?.accessToken)
      showToast("Pedido entregado", "success")
    } catch (err) {
      showToast(describePosError(err, "No se pudo marcar como entregado"), "error")
    }
  }, [tenantId, state.jwt?.accessToken, showToast])

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

  // Fuera de los bloques por vista (ahí TS ya acotó `view`).
  const isMostradorView = view === "mostrador"

  const mostradorDiscountCents = useMemo(
    () => (view === "mostrador" && mostradorDiscount && cart.length > 0 ? expectedDiscountCents(cart.map((i) => i.total), mostradorDiscount) : 0),
    [view, mostradorDiscount, cart]
  )

  // Fase D: platos de lo que se cobra (rondas sin cobrar + carrito), netos
  // de descuento, para «Dividir por platos». Si por algún motivo no suman el
  // total exacto, no se ofrece (nunca dividir sobre una cuenta que no cierra).
  const splitLines = useMemo(() => {
    const lines = [
      ...unpaidTableOrders.flatMap((o) =>
        o.items.map((i, idx) => ({ key: i.lineId ?? `${o.id}-${idx}`, name: i.name, quantity: i.quantity, total: i.total }))
      ),
      ...cart.map((i, idx) => ({ key: `cart-${idx}`, name: i.name, quantity: i.quantity, total: i.total })),
    ]
    return lines.reduce((s, l) => s + l.total, 0) === chargeTotal ? lines : undefined
  }, [unpaidTableOrders, cart, chargeTotal])

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
      // Con comensales la mesa se ABRIÓ a propósito (la gente está sentada
      // mirando la carta): no es un draft y no se suelta sola.
      return Boolean(t && t.status === "occupied" && !t.currentOrderId && !t.guests)
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
      delivery: "delivery",
      reservaciones: "reservaciones",
    }
    setScene(defaults[viewId] ?? "salon")
  }, [selectedTableId, maybeFreeDraft])

  // Fase A (2026-10): las vistas del Counter viven en el header (una sola
  // franja arriba), no en un renglón propio que le roba alto al workspace.
  const counterViews = useMemo(
    () => COUNTER_VIEWS.map((v) =>
      v.id === "reservaciones" ? { ...v, badge: unseenReservations }
      : v.id === "mostrador" ? { ...v, badge: pickupOrders.length }
      : v.id === "delivery" ? { ...v, badge: deliveryOrders.length }
      : v
    ),
    [unseenReservations, pickupOrders.length, deliveryOrders.length]
  )
  // ── Esc = volver (obs. UX 25/10): lo mismo que el «Volver» visible ────────
  const escapeBack = (() => {
    switch (scene) {
      case "mesa":
        return selectedTable ? () => { setSelectedTableId(null); setScene("salon") } : null
      case "mover":
        return moveBusy ? null : () => setScene("mesa")
      case "productos":
        return view === "salon" ? () => setScene(cart.length > 0 ? "salon" : "mesa") : null
      case "configurar":
        return () => { setConfigProduct(null); setScene(view === "mostrador" ? "mostrador_rapido" : "productos") }
      case "revision":
        return () => setScene(view === "mostrador" ? "mostrador_rapido" : "productos")
      case "cobro":
        return paying ? null : () => setScene(cart.length > 0 ? "revision" : view === "mostrador" ? "mostrador_rapido" : "productos")
      case "mostrador_entregas":
        return () => setScene("mostrador_rapido")
      case "setup":
        return () => setScene("salon")
      case "entrantes":
        if (entrantesSubView === "kanban") return selectedKanbanOrderId ? () => setSelectedKanbanOrderId(null) : null
        if (gatewayScene === "validation") return handleGatewayBack
        if (gatewayScene === "transform") return transformResult ? handleGatewayBack : () => setGatewayScene("validation")
        return null
      default:
        return null
    }
  })()
  useEscapeBack(escapeBack)

  // Obs. UX 25/10: el header superior lleva solo las vistas (opciones del
  // sistema); sectores, estados y configurar van en el encabezado del
  // workspace del salón (SalonHeaderBar, arriba del mapa).
  const salonView = useSalonView(tables)
  useEffect(() => {
    setHeaderCenter(<WorkspaceViewBar views={counterViews} activeView={view} onChange={handleViewChange} />)
  }, [setHeaderCenter, view, handleViewChange, counterViews])

  // Abrir Reservaciones marca vistas las nuevas (también para el panel del SaaS).
  useEffect(() => {
    if (view !== "reservaciones" || !tenantId) return
    markReservationsSeen(tenantId).then(clearUnseen).catch(() => {})
    void refreshReservations()
  }, [view, tenantId, clearUnseen, refreshReservations])
  useEffect(() => () => setHeaderCenter(null), [setHeaderCenter])

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
    } else if (tables.find((t) => t.id === tableId)?.status === "free") {
      // Fase B: una mesa libre se ABRE con sus comensales (un toque).
      setGuestsPrompt({ tableId, mode: "open" })
      return
    }
    setSelectedTableId(tableId)
    // Escena "Mesa seleccionada" (Scene Architecture §13): primero se ve la
    // mesa y su cuenta; agregar productos es una decisión. Si el carrito ya
    // viaja de otra mesa, se sigue cargando.
    setScene(cart.length > 0 ? "productos" : "mesa")
  }, [selectedTableId, cart.length, tables, maybeFreeDraft, maybeOccupyForLoading])

  const handleGuestsConfirm = useCallback(async (guests: number) => {
    if (!guestsPrompt || guestsBusy) return
    const { tableId, mode } = guestsPrompt
    setGuestsBusy(true)
    try {
      await tableOpChainRef.current.catch(() => {})
      if (mode === "open") {
        await occupyTableWithGuests(tableId, "counter", guests)
        setSelectedTableId(tableId)
        setScene("productos")
      } else {
        await setTableGuests(tableId, guests)
      }
      setGuestsPrompt(null)
    } catch (err) {
      showToast(describePosError(err, mode === "open" ? "No se pudo abrir la mesa" : "No se pudieron guardar los comensales"), "error")
    } finally {
      setGuestsBusy(false)
    }
  }, [guestsPrompt, guestsBusy, occupyTableWithGuests, setTableGuests, showToast])

  // ── Fase C: quitar un plato ya enviado (con motivo; PIN si es cajero) ────
  const handleVoidConfirm = useCallback(async (removeQuantity: number, reason: ItemVoidReason) => {
    if (!voidTarget || !tenantId || voidBusy || !voidTarget.item.lineId) return
    const { order, item } = voidTarget
    const lineId = item.lineId as string
    setVoidBusy(true)
    try {
      await voidSentItem(tenantId, order.id, { productId: item.productId, lineId }, item.quantity - removeQuantity, reason)
      setVoidTarget(null)
      showToast(`${removeQuantity}× ${item.name} quitado`, "success")
    } catch (err) {
      if (err instanceof PosApiError && err.code === "approval_cancelled") return
      showToast(describePosError(err, "No se pudo quitar el producto"), "error")
    } finally {
      setVoidBusy(false)
    }
  }, [voidTarget, tenantId, voidBusy, showToast])

  const handlePrintPrecuenta = useCallback(async (prefix = "Precuenta") => {
    if (!tenantId || !selectedTableId) return
    try {
      const { printerName } = await printPrecuenta(tenantId, selectedTableId)
      showToast(`${prefix} — precuenta enviada a ${printerName}`, "success")
    } catch (err) {
      showToast(`${prefix}. No se imprimió la precuenta: ${describePosError(err, "error de impresión")}`, "error")
    }
  }, [tenantId, selectedTableId, showToast])

  // ── Obs. 24/10: operar reservas (asignar mesa, sentar, no vino, soltar) ──
  const handleReservationAction = useCallback(async (r: PosReservation, action: ReservationAction, tablePosId?: string) => {
    if (!tenantId || reservationBusyId) return
    setReservationBusyId(r.id)
    try {
      const updated = await actOnReservation(tenantId, r.id, action, tablePosId)
      await refreshReservations()
      const labels: Record<ReservationAction, string> = {
        assign: "Mesa reservada",
        unassign: "Mesa liberada",
        seat: `${r.name} sentado/a`,
        no_show: "Marcada como no vino",
      }
      showToast(labels[action], "success")
      if (action === "seat" && updated.tablePosId) {
        // Directo a la mesa para empezar a tomar el pedido.
        setView("salon")
        setSelectedTableId(updated.tablePosId)
        setScene("mesa")
      }
    } catch (err) {
      showToast(describePosError(err, "No se pudo actualizar la reserva"), "error")
    } finally {
      setReservationBusyId(null)
    }
  }, [tenantId, reservationBusyId, refreshReservations, showToast])

  // ── Fase J: pausar / reanudar artículos (faltantes) desde el selector ─────
  const handleToggleAvailability = useCallback(async (product: Product) => {
    if (!tenantId) return
    try {
      await setItemAvailability(tenantId, product.id, !product.isAvailable)
      showToast(product.isAvailable ? `«${product.name}» marcado como faltante` : `«${product.name}» disponible otra vez`, "success")
    } catch (err) {
      showToast(describePosError(err, "No se pudo cambiar la disponibilidad"), "error")
    }
  }, [tenantId, showToast])

  // ── Fase C: pedir la cuenta / reabrir la mesa ─────────────────────────────
  const handleBillRequest = useCallback(async (needsBill: boolean) => {
    if (!selectedTableId) return
    try {
      // Reabrir pide el PIN de un encargado (lo resuelve pos-api con el diálogo).
      await markNeedsBill(selectedTableId, needsBill)
    } catch (err) {
      if (err instanceof PosApiError && err.code === "approval_cancelled") return
      showToast(describePosError(err, "No se pudo actualizar la mesa"), "error")
      return
    }
    if (!needsBill) {
      showToast("Mesa reabierta", "success")
      return
    }
    // Fase E: la precuenta sale por la impresora de caja. Si no se puede
    // imprimir, la cuenta igual queda pedida (se avisa, no se revierte).
    await handlePrintPrecuenta("Cuenta pedida")
  }, [selectedTableId, markNeedsBill, showToast, handlePrintPrecuenta])

  // ── Fase C: cambiar de mesa (destino libre) o unir (destino ocupado) ─────
  const doMoveTable = useCallback(async (toId: string, join: boolean) => {
    if (!selectedTableId || moveBusy) return
    const from = tables.find((t) => t.id === selectedTableId)
    const to = tables.find((t) => t.id === toId)
    setMoveBusy(true)
    try {
      await moveTable(selectedTableId, toId, join)
      setJoinTargetId(null)
      setSelectedTableId(toId)
      setScene("mesa")
      showToast(join ? `Mesas ${from?.number} y ${to?.number} unidas` : `Mesa ${from?.number} pasó a la ${to?.number}`, "success")
    } catch (err) {
      showToast(describePosError(err, "No se pudo mover la mesa"), "error")
    } finally {
      setMoveBusy(false)
    }
  }, [selectedTableId, moveBusy, tables, moveTable, showToast])

  // ── Fase D: descuentos (cajero: el server pide PIN de encargado) ─────────
  const runDiscount = useCallback(async (op: () => Promise<unknown>, okMessage: string) => {
    if (discountBusy) return
    setDiscountBusy(true)
    try {
      await op()
      setDiscountTarget(null)
      showToast(okMessage, "success")
    } catch (err) {
      if (err instanceof PosApiError && err.code === "approval_cancelled") return
      showToast(describePosError(err, "No se pudo aplicar el descuento"), "error")
    } finally {
      setDiscountBusy(false)
    }
  }, [discountBusy, showToast])

  const handleDiscountConfirm = useCallback((discount: DiscountRequest) => {
    if (!tenantId || !discountTarget) return
    if (discountTarget.scope === "table") {
      if (!selectedTableId) return
      void runDiscount(() => discountTable(tenantId, selectedTableId, discount), "Descuento aplicado a la cuenta")
    } else if (discountTarget.item.lineId) {
      const { order, item } = discountTarget
      void runDiscount(() => discountOrderLine(tenantId, order.id, item.lineId as string, discount), `Descuento aplicado a ${item.name}`)
    }
  }, [tenantId, discountTarget, selectedTableId, runDiscount])

  const handleDiscountRemove = useCallback(() => {
    if (!tenantId || !discountTarget) return
    if (discountTarget.scope === "table") {
      if (!selectedTableId) return
      void runDiscount(() => removeTableDiscounts(tenantId, selectedTableId), "Descuentos quitados")
    } else if (discountTarget.item.lineId) {
      const { order, item } = discountTarget
      void runDiscount(() => removeOrderLineDiscount(tenantId, order.id, item.lineId as string), "Descuento quitado")
    }
  }, [tenantId, discountTarget, selectedTableId, runDiscount])

  const handleMoveTarget = useCallback((tableId: string) => {
    if (tableId === selectedTableId) return
    const target = tables.find((t) => t.id === tableId)
    if (!target) return
    if (target.status === "free") void doMoveTable(tableId, false)
    else if (target.status === "occupied") setJoinTargetId(tableId)
    else showToast(`La mesa ${target.number} no está disponible`, "error")
  }, [selectedTableId, tables, doMoveTable, showToast])

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
      // Suma a la línea igual SIN opciones ni nota (una con nota es otro plato).
      const existing = prev.find((i) => i.productId === product.id && !i.modifiers?.length && !i.notes && !i.course)
      if (existing) {
        return prev.map((i) =>
          i === existing
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

  // Fase B: las líneas del carrito se tocan por POSICIÓN (dos líneas del
  // mismo producto con distinta nota u opciones son independientes).
  const handleUpdateQuantity = useCallback((index: number, quantity: number) => {
    if (quantity <= 0) {
      const isEmptying = cart.length === 1
      setCart((prev) => prev.filter((_, i) => i !== index))
      if (isEmptying) maybeFreeDraft(selectedTableId)
      return
    }
    setCart((prev) =>
      prev.map((item, i) =>
        i === index
          ? { ...item, quantity, total: calculateItemTotal({ ...item, quantity }) }
          : item
      )
    )
  }, [cart.length, selectedTableId, maybeFreeDraft])

  const handleRemoveItem = useCallback((index: number) => {
    const isEmptying = cart.length === 1
    setCart((prev) => prev.filter((_, i) => i !== index))
    if (isEmptying) maybeFreeDraft(selectedTableId)
  }, [cart.length, selectedTableId, maybeFreeDraft])

  const handleEditNote = useCallback((index: number, note: string, course: ItemCourse | undefined) => {
    setCart((prev) => prev.map((item, i) => (i === index ? { ...item, notes: note || undefined, course } : item)))
  }, [])

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
        ...(item.course ? { course: item.course } : {}),
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
  //    mostrador enviado a cocina queda en Mostrador → «Para entregar».
  const handlePay = useCallback(async (parts: CheckoutPart[], meta?: { cashReceivedCents: number | null }) => {
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
        let order = await createOrder(tableId, cartToOrderItems(), undefined, undefined, {
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
        // Fase E: descuento del Mostrador. El server lo aplica (y pide el PIN
        // si es cajero); el cobro sigue contra el total que él devuelve.
        if (!selectedTableId && mostradorDiscount) {
          order = await discountOrder(tenantId, order.id, mostradorDiscount)
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
      setLastSale({ total: parts.reduce((s, p) => s + p.amount, 0), sentToKitchen: keepForKitchen, invoices, parts, cashReceivedCents: meta?.cashReceivedCents ?? null })
      setInvoiceChoice(defaultInvoiceChoice(fiscalConfig))
      if (clubPhoneFailed) showErrorToast("El cobro quedó registrado, pero no se pudo guardar el celular del club.")
      setClubPhone("")
      pendingOrderIdRef.current = null
      setCart([])
      setMostradorDiscount(null)
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
  }, [tenantId, paying, view, sendToKitchen, clubPhone, selectedTableId, selectedTable, unpaidTableOrders, tableOrders, cart.length, cartToOrderItems, createOrder, occupyTable, bindTableOrder, freeTable, processPayment, jwt, showErrorToast, fiscalConfig, invoiceChoice, pointEnabled, mostradorDiscount])

  const handleNewSale = useCallback(() => {
    maybeFreeDraft(selectedTableId)
    setCart([])
    setCustomer(null)
    setSelectedTableId(null)
    setSelectedCategory(null)
    setLastSale(null)
    setSendToKitchen(true)
    setClubPhone("")
    setMostradorDiscount(null)
    const defaults: Record<string, Scene> = {
      salon: "salon",
      mostrador: "mostrador_rapido",
      entrantes: "entrantes",
      delivery: "delivery",
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
        // Contexto «Mesa» (obs. 24/10): el detalle vive en el workspace
        // (TableDetail) y TODAS las acciones de la mesa en el Context Panel,
        // agrupadas por tipo (registro de acciones: sumar una = una entrada).
        const activity = tableActivity.get(selectedTable.id)
        const unpaid = activity?.unpaid ?? 0
        const occupied = selectedTable.status === "occupied"
        const tableReservation = selectedTable.status === "reserved" ? reservationsByTable.get(selectedTable.id) : undefined
        // Mesa reservada por una reserva: se suelta desde la reserva (no «Liberar»).
        const canRelease = !activity && !tableReservation && (selectedTable.status === "reserved" || occupied)
        const resBusy = tableReservation ? reservationBusyId === tableReservation.id : false
        const actionGroups: ContextActionGroup[] = [
          {
            title: "Servicio",
            actions: [
              ...(!selectedTable.needsBill && (occupied || selectedTable.status === "free")
                ? [{ id: "add", label: "Agregar productos", icon: Plus, tone: "teal" as const, onClick: () => setScene("productos") }]
                : []),
              ...(occupied
                ? [{ id: "guests", label: "Comensales", hint: selectedTable.guests ? `${selectedTable.guests} personas` : "Sin cargar", icon: Users, tone: "gray" as const,
                    onClick: () => setGuestsPrompt({ tableId: selectedTable.id, mode: "edit" }) }]
                : []),
              ...(unpaid > 0 && !selectedTable.needsBill
                ? [{ id: "bill", label: "Pedir cuenta", hint: "Imprime la precuenta", icon: Receipt, tone: "amber" as const, onClick: () => { void handleBillRequest(true) } }]
                : []),
              ...(selectedTable.needsBill
                ? [
                    { id: "reopen", label: "Reabrir mesa", hint: "PIN de encargado", icon: Unlock, tone: "amber" as const, onClick: () => { void handleBillRequest(false) } },
                    { id: "reprint", label: "Reimprimir precuenta", icon: Printer, tone: "amber" as const, onClick: () => { void handlePrintPrecuenta() } },
                  ]
                : []),
            ],
          },
          {
            title: "Cuenta",
            actions: unpaid > 0
              ? [
                  { id: "charge", label: "Cobrar", hint: formatCurrency(unpaid), icon: Wallet, tone: "orange" as const, onClick: () => setScene("cobro") },
                  { id: "split", label: "Dividir cuenta", hint: "Por platos o comensal", icon: Split, tone: "orange" as const, onClick: () => setScene("cobro") },
                  { id: "discount", label: "Descuento", hint: "A toda la cuenta", icon: Percent, tone: "green" as const, onClick: () => setDiscountTarget({ scope: "table" }) },
                ]
              : [],
          },
          {
            title: "Mesa",
            actions: [
              ...(occupied ? [{ id: "move", label: "Cambiar / unir", icon: ArrowLeftRight, tone: "blue" as const, onClick: () => setScene("mover") }] : []),
              ...(selectedTable.status === "free" ? [{ id: "reserve", label: "Reservar", icon: CalendarClock, tone: "violet" as const, onClick: () => handleTableTransition("reserve") }] : []),
              ...(canRelease ? [{ id: "release", label: "Liberar mesa", icon: DoorOpen, tone: "red" as const, onClick: () => handleTableTransition("free") }] : []),
            ],
          },
          {
            title: "Reserva",
            actions: tableReservation
              ? [
                  { id: "seat", label: "Sentar", hint: `${tableReservation.name.split(" ")[0]} · ${tableReservation.partySize}p`, icon: UserCheck, tone: "teal" as const, disabled: resBusy,
                    onClick: () => { void handleReservationAction(tableReservation, "seat") } },
                  { id: "noshow", label: "No vino", icon: UserX, tone: "red" as const, disabled: resBusy, onClick: () => { void handleReservationAction(tableReservation, "no_show") } },
                  { id: "unassign", label: "Soltar mesa", icon: Unlink, tone: "gray" as const, disabled: resBusy, onClick: () => { void handleReservationAction(tableReservation, "unassign") } },
                ]
              : [],
          },
        ]
        setContextPanel({
          title: `Mesa ${selectedTable.number}`,
          subtitle: [selectedTable.section || "Sala principal", activity ? formatCurrency(activity.total) : null].filter(Boolean).join(" · "),
          body: <ContextActionPanel groups={actionGroups} />,
          openOnMobile: true,
        })
        // Barra inferior despejada: entidad/total, volver y UNA acción principal.
        setActionBar({
          left: (
            <div className="action-bar-total">
              <span className="action-bar-total-label">Cuenta Mesa {selectedTable.number}</span>
              <span className="action-bar-total-value">{formatCurrency(activity?.total ?? 0)}</span>
            </div>
          ),
          center: (
            <button className="btn btn-ghost" onClick={() => { setSelectedTableId(null); setScene("salon") }}>
              ← Salón
            </button>
          ),
          right: tableReservation ? (
            <button className="btn btn-primary btn-lg" disabled={resBusy} onClick={() => { void handleReservationAction(tableReservation, "seat") }}>
              Sentar a {tableReservation.name.split(" ")[0]} ({tableReservation.partySize})
            </button>
          ) : unpaid > 0 ? (
            <button className="btn btn-primary btn-lg" onClick={() => setScene("cobro")}>
              Cobrar {formatCurrency(unpaid)}
            </button>
          ) : selectedTable.needsBill ? (
            <button className="btn btn-primary btn-lg" onClick={() => { void handleBillRequest(false) }}>
              Reabrir mesa
            </button>
          ) : (
            <button className="btn btn-primary btn-lg" onClick={() => setScene("productos")}>
              + Agregar productos
            </button>
          ),
        })
        break
      }

      case "mostrador_entregas":
        setContextPanel({
          title: "Para entregar",
          subtitle: pickupOrders.length === 0 ? "Sin pedidos pendientes" : `${pickupOrders.length} ${pickupOrders.length === 1 ? "pedido" : "pedidos"} de Mostrador`,
          body: (
            <div className="mesa-panel">
              <p className="text-sm">Ventas de Mostrador ya cobradas y enviadas a cocina. Cuando el cliente retira, tocá <strong>Entregado</strong>.</p>
            </div>
          ),
        })
        setActionBar({
          left: (
            <button className="btn btn-ghost" onClick={() => setScene("mostrador_rapido")}>
              ← Volver a vender
            </button>
          ),
        })
        break

      case "delivery":
        setContextPanel(null)
        setActionBar(null)
        break

      case "mover": {
        if (!selectedTable) {
          setScene("salon")
          break
        }
        setContextPanel({
          title: `Cambiar Mesa ${selectedTable.number}`,
          subtitle: "Elegí la mesa destino en el salón",
          body: (
            <div className="mesa-panel">
              <p className="text-sm">
                <strong>Mesa libre:</strong> la cuenta entera (rondas, comensales y mozo) pasa a esa mesa.
              </p>
              <p className="text-sm" style={{ marginTop: "var(--sp-2)" }}>
                <strong>Mesa ocupada:</strong> se unen las cuentas y se suman los comensales (te pedimos confirmación).
              </p>
            </div>
          ),
          openOnMobile: true,
        })
        setActionBar({
          left: (
            <div className="action-bar-total">
              <span className="action-bar-total-label">Moviendo</span>
              <span className="action-bar-total-value">Mesa {selectedTable.number}</span>
            </div>
          ),
          right: (
            <button className="btn btn-ghost btn-lg" onClick={() => setScene("mesa")} disabled={moveBusy}>
              Cancelar
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
                onEditNote={handleEditNote}
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
          left: isMostrador ? (
            <button className="btn btn-secondary" onClick={() => setScene("mostrador_entregas")}>
              <PackageCheck size={18} aria-hidden /> Para entregar{pickupOrders.length > 0 ? ` (${pickupOrders.length})` : ""}
            </button>
          ) : undefined,
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
        // UI/UX 24/10: la lista vive en el workspace (OrderReview); el panel
        // solo resume, sin duplicarla.
        setContextPanel({
          title: isMostrador ? "Mostrador" : `Mesa ${selectedTable?.number ?? "?"}`,
          subtitle: customer ? customer.name : "Revisá y confirmá la ronda",
          body: (
            <div className="mesa-panel">
              <div className="mesa-panel-account">
                <div className="mesa-panel-account-label">Total de la cuenta</div>
                <div className="mesa-panel-account-total">{formatCurrency(chargeTotal)}</div>
                {chargeTotal !== cartTotal && (
                  <div className="text-sm text-muted">Incluye {formatCurrency(chargeTotal - cartTotal)} ya enviado a cocina</div>
                )}
              </div>
            </div>
          ),
        })
        setActionBar({
          left: (
            <button className="btn btn-secondary btn-lg" onClick={() => setScene(isMostrador ? "mostrador_rapido" : "productos")}>
              + Agregar más
            </button>
          ),
          center: !isMostrador && cart.length > 0 ? (
            <button className="btn btn-secondary" onClick={() => setScene("cobro")} disabled={paying || chargeTotal === 0}>
              Cobrar {formatCurrency(chargeTotal)}
            </button>
          ) : undefined,
          right: !isMostrador && cart.length > 0 ? (
            <button className="btn btn-primary btn-lg" onClick={handleSendToKitchen} disabled={paying}>
              {paying ? "Enviando…" : "Enviar a cocina"}
            </button>
          ) : (
            <button className="btn btn-primary btn-lg" onClick={() => setScene("cobro")} disabled={paying || chargeTotal === 0}>
              Cobrar {formatCurrency(chargeTotal)}
            </button>
          ),
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
              title: "Pedidos App",
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
                  Enviado a cocina — se entrega desde <strong>Mostrador → Para entregar</strong>.
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
  }, [scene, view, selectedTable, tableActivity, now, handleTableTransition, cart, cartTotal, chargeTotal, tableOrders, unpaidTableOrders, paying, lastSale, handleSendToKitchen, customer, entrantesSubView, gatewayScene, gatewayOrders, kanbanOrders, gatewayPendingCount, gatewayPaidCount, connected, selectedOrder, selectedKanbanOrderId, validationItems, transformResult, transforming, setContextPanel, setActionBar, handleUpdateQuantity, handleRemoveItem, handleEditNote, handleBillRequest, handlePrintPrecuenta, moveBusy, pickupOrders, reservationsByTable, reservationBusyId, handleReservationAction, handleNewSale, handleConfirmAllPaid, handleGatewayBack, handleRejectOrder, handleTransform, handlePrepareExternal, handleMarkReadyExternal, handleDeliverExternal, handleSetEnRutaExternal, handleSetArrivedExternal])

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <>
      {/* View Bar */}

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

          {scene === "mesa" && selectedTable && (
            <TableDetail
              table={selectedTable}
              activity={tableActivity.get(selectedTable.id)}
              orders={tableOrders}
              now={now}
              reservation={selectedTable.status === "reserved" ? reservationsByTable.get(selectedTable.id) : undefined}
              onVoidItem={(order, item) => setVoidTarget({ order, item })}
              onDiscountItem={(order, item) => setDiscountTarget({ scope: "line", order, item })}
              onAddProducts={() => setScene("productos")}
            />
          )}

          {(scene === "salon" || scene === "mover" || (scene === "mesa" && !selectedTable)) && (
            <>
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
                    <SalonHeaderBar view={salonView} onConfigure={scene === "mover" ? undefined : () => setScene("setup")} canEditLayout={scene !== "mover"} />
                    <SalonMap
                      view={salonView}
                      variant="counter"
                      activity={tableActivity}
                      selectedTableId={selectedTableId}
                      onSelectTable={scene === "mover" ? handleMoveTarget : handleSelectTable}
                      reservations={reservationsByTable}
                      showServer={role === "admin" || role === "manager"}
                      onLayoutChange={scene === "mover" ? undefined : (id, layout) => updateTableSetup(id, { layout })}
                    />
                  </>
                )}
              </div>
            </>
          )}

          {scene === "productos" && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
              <ProductSelector
                products={products}
                categories={categories}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                onSelectProduct={handleAddProduct}
                popularIds={popularIds}
                onToggleAvailability={handleToggleAvailability}
                back={{
                  label: cart.length > 0 ? "Salón" : `Mesa ${selectedTable?.number ?? ""}`,
                  onClick: () => setScene(cart.length > 0 ? "salon" : "mesa"),
                }}
              />
            </div>
          )}

          {scene === "revision" && (
            <OrderReview
              title={isMostradorView ? "Mostrador" : `Mesa ${selectedTable?.number ?? "?"}`}
              subtitle={[
                !isMostradorView && selectedTable?.guests ? `${selectedTable.guests} comensales` : null,
                customer ? customer.name : null,
              ].filter(Boolean).join(" · ") || undefined}
              items={cart}
              cartTotal={cartTotal}
              sentTotal={chargeTotal - cartTotal}
              busy={paying}
              onAddMore={() => setScene(isMostradorView ? "mostrador_rapido" : "productos")}
              onSendToKitchen={!isMostradorView && cart.length > 0 ? () => { void handleSendToKitchen() } : undefined}
              onCharge={() => setScene("cobro")}
            />
          )}

          {scene === "cobro" && (
            <div className="checkout-scene">
              <div className="checkout-scene-inner">
                {/* key: si el total cambia (ronda nueva por polling) el cobro arranca de cero */}
                <CheckoutPanel
                  key={chargeTotal}
                  total={chargeTotal}
                  busy={paying}
                  onConfirm={handlePay}
                  clubPhone={{ value: clubPhone, onChange: setClubPhone }}
                  invoice={{ config: fiscalConfig, value: invoiceChoice, onChange: setInvoiceChoice }}
                  splitLines={splitLines}
                  guests={selectedTable?.guests}
                />
              </div>
            </div>
          )}

          {scene === "cierre" && (
            <SaleDoneModal
              title="Mesa cerrada"
              subtitle={`Mesa ${selectedTable?.number ?? "?"}`}
              sale={lastSale}
              actionLabel="Volver al salón"
              onDone={handleNewSale}
            >
              <InvoiceResults invoices={lastSale?.invoices} />
            </SaleDoneModal>
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

          {scene === "mostrador_entregas" && (
            <div className="channel-view">
              {pickupOrders.length === 0 ? (
                <div className="empty-state channel-empty">
                  <PackageCheck size={40} aria-hidden />
                  <span className="empty-state-text">Nada para entregar</span>
                  <span className="text-sm text-muted">Las ventas de Mostrador enviadas a cocina aparecen acá hasta que se entregan.</span>
                </div>
              ) : (
                <div className="pickup-list">
                  {pickupOrders.map((order) => (
                    <article key={order.id} className="pickup-card">
                      <div className="pickup-head">
                        <span className="pickup-code">#{order.id.slice(0, 6).toUpperCase()}</span>
                        <span className="text-sm text-muted">
                          {new Date(order.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} · hace {timeAgo(order.createdAt)}
                        </span>
                      </div>
                      <div className="pickup-items">{order.items.map((i) => `${i.quantity}× ${i.name}`).join(" · ")}</div>
                      <div className="pickup-foot">
                        <span className="pickup-total">{formatCurrency(order.total)}</span>
                        <button type="button" className="btn btn-primary" onClick={() => { void handleHandOver(order.id) }}>
                          <PackageCheck size={18} aria-hidden /> Entregado
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {scene === "mostrador_rapido" && (
            <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
              <ProductSelector
                products={products}
                categories={categories}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                onSelectProduct={handleAddProduct}
                popularIds={popularIds}
                onToggleAvailability={handleToggleAvailability}
              />
            </div>
          )}

          {scene === "revision" && (
            <OrderReview
              title={isMostradorView ? "Mostrador" : `Mesa ${selectedTable?.number ?? "?"}`}
              subtitle={[
                !isMostradorView && selectedTable?.guests ? `${selectedTable.guests} comensales` : null,
                customer ? customer.name : null,
              ].filter(Boolean).join(" · ") || undefined}
              items={cart}
              cartTotal={cartTotal}
              sentTotal={chargeTotal - cartTotal}
              busy={paying}
              onAddMore={() => setScene(isMostradorView ? "mostrador_rapido" : "productos")}
              onSendToKitchen={!isMostradorView && cart.length > 0 ? () => { void handleSendToKitchen() } : undefined}
              onCharge={() => setScene("cobro")}
            />
          )}

          {scene === "cobro" && (
            <div className="checkout-scene">
              <div className="checkout-scene-inner">
                <CheckoutPanel
                  key={`${chargeTotal}-${mostradorDiscountCents}`}
                  total={chargeTotal - mostradorDiscountCents}
                  busy={paying}
                  onConfirm={handlePay}
                  discount={{
                    appliedCents: mostradorDiscountCents,
                    label: mostradorDiscount
                      ? (mostradorDiscount.kind === "percent" ? `${mostradorDiscount.value}%` : "") +
                        ` (${DISCOUNT_REASONS.find((r) => r.id === mostradorDiscount.reason)?.label ?? ""})`
                      : undefined,
                    onEdit: () => setMostradorDiscountOpen(true),
                  }}
                  sendToKitchen={{ value: sendToKitchen, onChange: setSendToKitchen }}
                  clubPhone={{ value: clubPhone, onChange: setClubPhone }}
                  invoice={{ config: fiscalConfig, value: invoiceChoice, onChange: setInvoiceChoice }}
                  splitLines={splitLines}
                />
              </div>
            </div>
          )}

          {scene === "cierre" && (
            <SaleDoneModal
              title="Venta completada"
              subtitle="Mostrador"
              sale={lastSale}
              actionLabel="Nueva venta"
              onDone={handleNewSale}
            >
              {lastSale?.sentToKitchen && (
                <div className="sale-done-note">Enviado a cocina — entregalo desde Mostrador → «Para entregar».</div>
              )}
              <InvoiceResults invoices={lastSale?.invoices} />
            </SaleDoneModal>
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
                    {gatewayScene === "queue" ? "Pedidos App" : gatewayScene === "validation" ? "Validar pedido" : "Transformar a local"}
                  </div>
                  <div className="workspace-subtitle">
                    {gatewayScene === "queue"
                      ? "Pedidos de la App TakeasyGO — Recibir → Validar → Transformar"
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
      {/* VIEW: DELIVERY EXTERNO (apps de delivery integradas) */}
      {/* ================================================ */}
      {view === "delivery" && (
        <div className="channel-view">
          {deliveryOrders.length === 0 ? (
            <div className="empty-state channel-empty">
              <Bike size={40} aria-hidden />
              <span className="empty-state-text">Delivery externo</span>
              <span className="text-sm text-muted channel-empty-text">
                Acá van a entrar los pedidos de las apps de delivery integradas ({DELIVERY_PLATFORMS.map((p) => p.label).join(", ")}),
                separados de los pedidos de la App TakeasyGO. Todavía no hay ninguna integración conectada en este local.
              </span>
            </div>
          ) : (
            <div className="pickup-list">
              {deliveryOrders.map((order) => (
                <article key={order.id} className="pickup-card">
                  <div className="pickup-head">
                    <span className="pickup-code">{DELIVERY_PLATFORMS.find((p) => p.id === order.channel)?.label ?? "Delivery"} · #{order.id.slice(0, 6)}</span>
                    <span className="text-sm text-muted">{new Date(order.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="pickup-items">{order.items.map((i) => `${i.quantity}× ${i.name}`).join(" · ")}</div>
                  <div className="pickup-foot"><span className="pickup-total">{formatCurrency(order.total)}</span></div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================================================ */}
      {/* VIEW: RESERVACIONES */}
      {/* ================================================ */}
      {view === "reservaciones" && (
        <ReservationsView
          reservations={reservations}
          tables={tables}
          busyId={reservationBusyId}
          canManage
          onAction={(r, action, tablePosId) => { void handleReservationAction(r, action, tablePosId) }}
          onOpenTable={(tableId) => { setView("salon"); setSelectedTableId(tableId); setScene("mesa") }}
        />
      )}

      {/* Modals */}
      {voidTarget && (
        <VoidItemDialog
          name={voidTarget.item.name}
          quantity={voidTarget.item.quantity}
          busy={voidBusy}
          onConfirm={(n, reason) => { void handleVoidConfirm(n, reason) }}
          onCancel={() => setVoidTarget(null)}
        />
      )}
      {mostradorDiscountOpen && (
        <DiscountDialog
          target="Mostrador, toda la venta"
          base={cartTotal}
          hasDiscount={Boolean(mostradorDiscount)}
          onConfirm={(d) => { setMostradorDiscount(d); setMostradorDiscountOpen(false) }}
          onRemove={() => { setMostradorDiscount(null); setMostradorDiscountOpen(false) }}
          onCancel={() => setMostradorDiscountOpen(false)}
        />
      )}
      {discountTarget && selectedTable && (() => {
        // Base = importe SIN descuentos (el nuevo reemplaza a los anteriores).
        const gross = (i: OrderItem) => i.total + (i.discount?.amount ?? 0)
        const lines = discountTarget.scope === "table" ? unpaidTableOrders.flatMap((o) => o.items) : [discountTarget.item]
        return (
          <DiscountDialog
            target={discountTarget.scope === "table" ? `Mesa ${selectedTable.number}, toda la cuenta` : discountTarget.item.name}
            base={lines.reduce((s, i) => s + gross(i), 0)}
            hasDiscount={lines.some((i) => i.discount)}
            busy={discountBusy}
            onConfirm={handleDiscountConfirm}
            onRemove={handleDiscountRemove}
            onCancel={() => setDiscountTarget(null)}
          />
        )
      })()}
      {joinTargetId && selectedTable && (
        <ConfirmDialog
          title="Unir mesas"
          message={`La mesa ${tables.find((t) => t.id === joinTargetId)?.number} está ocupada. ¿Unir la cuenta de la mesa ${selectedTable.number} con esa? Se suman las rondas y los comensales.`}
          confirmLabel="Unir mesas"
          busy={moveBusy}
          onConfirm={() => { void doMoveTable(joinTargetId, true) }}
          onCancel={() => setJoinTargetId(null)}
        />
      )}
      {guestsPrompt && (() => {
        const t = tables.find((x) => x.id === guestsPrompt.tableId)
        if (!t) return null
        return (
          <GuestsDialog
            tableNumber={t.number}
            capacity={t.capacity}
            initial={guestsPrompt.mode === "edit" ? t.guests ?? undefined : undefined}
            busy={guestsBusy}
            onConfirm={(n) => { void handleGuestsConfirm(n) }}
            onCancel={() => setGuestsPrompt(null)}
          />
        )
      })()}
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
