import { useState, useEffect } from "react"
import type { ComponentType } from "react"
import { useAuth } from "./hooks/useAuth"
import { LoginScreen } from "./components/LoginScreen"
import { CounterDashboard } from "./components/Counter/CounterDashboard"
import { WaiterDashboard } from "./components/Waiter/WaiterDashboard"
import { IncomingOrdersDashboard } from "./components/IncomingOrders/IncomingOrdersDashboard"
import { FlotaDashboard } from "./components/Flota/FlotaDashboard"
import { CustomersDashboard } from "./components/Customers/CustomersDashboard"
import { SalesDashboard } from "./components/Sales/SalesDashboard"
import { CashDashboard } from "./components/Cash/CashDashboard"
import { Header } from "./components/layout/Header"
import { Navigation } from "./components/layout/Navigation"
import { ContextPanel } from "./components/layout/ContextPanel"
import { ActionBar } from "./components/layout/ActionBar"
import { LayoutProvider, useLayout } from "./components/layout/LayoutContext"
import { QuickAccessPanel } from "./components/shared/QuickAccessPanel"
import {
  LayoutGrid, Users, Utensils, ShoppingBag, Bike, Banknote, BarChart3,
} from "lucide-react"
import {
  startConnectivityMonitoring,
  stopConnectivityMonitoring,
  onReconnect,
} from "./services/connectivity"
import { flush } from "./services/event-queue"
import { disconnectSocket, onSocketEvent } from "./services/socket-client"
import { handleTakeasyGOSale } from "./services/sync-cash"
import type { TakeasyGOSalePayload } from "./services/sync-cash"
import {
  acknowledgeCashSale,
  fetchFailedCashSaleEvents,
  fetchPendingOrders,
} from "./services/sync-api"
import {
  persistExternalOrder,
  updateExternalOrderStatus,
  cancelExternalOrder,
  cleanupPendingStatusUpdates,
} from "./services/external-orders"
import { playOrderNotification } from "./services/notification-sound"
import type { Order } from "@takeasygo/types"
import "./styles/pos.css"

type Context = "counter" | "customers" | "waiter" | "incoming" | "flota" | "caja" | "ventas"

interface NavItem {
  id: string
  icon: ComponentType<{ size?: number; className?: string }>
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { id: "counter", icon: LayoutGrid, label: "Counter" },
  { id: "customers", icon: Users, label: "Clientes" },
  { id: "waiter", icon: Utensils, label: "Waiter" },
  { id: "incoming", icon: ShoppingBag, label: "Pedidos" },
  { id: "flota", icon: Bike, label: "Flota" },
  { id: "caja", icon: Banknote, label: "Caja" },
  { id: "ventas", icon: BarChart3, label: "Ventas" },
]

function App() {
  const { state, login, logout } = useAuth()
  const [activeContext, setActiveContext] = useState<Context>("counter")
  const [showQuickAccess, setShowQuickAccess] = useState(false)

  useEffect(() => {
    if (state.status !== "authenticated" || !state.tenantId || !state.jwt) {
      return
    }

    startConnectivityMonitoring()

    const unsubCashSale = onSocketEvent("cash_sale", (data: unknown) => {
      const payload = data as TakeasyGOSalePayload
      handleTakeasyGOSale(payload)
        .then((result) => {
          if (payload.eventId && state.jwt) {
            acknowledgeCashSale(payload.eventId, state.jwt.accessToken)
          }
          if (result.status !== "duplicate") {
            console.log(`[App] cash_sale ${result.status}:`, payload.orderId)
          }
        })
        .catch((err) => {
          console.error("[App] cash_sale processing failed:", err)
        })
    })

    // ── External order socket listeners (root level — always active) ──
    // These MUST be in App.tsx, not in IncomingOrdersDashboard, because
    // IncomingOrdersDashboard is unmounted when the user is on any other view.
    // If these listeners lived only in IncomingOrdersDashboard, orders and
    // status updates would be silently lost when the user is on Counter, Caja, etc.

    // Cleanup pending status updates from previous sessions (TTL 24h)
    cleanupPendingStatusUpdates().catch(() => {})

    // Fetch pending orders from SyncLayer on connect/reconnect
    fetchPendingOrders(state.tenantId!, state.jwt!.accessToken).then((pending) => {
      if (pending.length > 0) {
        pending.forEach((o) => {
          persistExternalOrder({
            orderId: o.orderId,
            tenantId: o.tenantId,
            source: "external",
            status: (o.status as Order["status"]) ?? "pending",
            externalStatus: (o.status as Order["externalStatus"]) ?? "awaiting_payment",
            paymentMethod: o.paymentMethod as Order["paymentMethod"],
            items: o.items as Order["items"],
            total: o.total,
          }).catch(() => {})
        })

        // Reconcile: mirror terminal SaaS statuses to local status for existing records
        // This handles the case where POS was offline when delivery was completed
        // (e.g., delivery driver marked delivered in SaaS while POS was disconnected).
        // updateExternalOrderStatus has a monotony guard — stale events are discarded.
        pending.forEach((o) => {
          if (o.status === "delivered" || o.status === "cancelled") {
            updateExternalOrderStatus(o.orderId, o.tenantId, o.status as Order["externalStatus"]).catch(() => {})
          }
        })

        console.log(`[App] persisted ${pending.length} pending orders from SyncLayer`)
      }
    }).catch(() => {})

    const unsubOrderCreated = onSocketEvent("order:created", (data: unknown) => {
      const event = data as { orderId: string; items: unknown[]; total: number; source?: string; paymentMethod?: string }
      const orderSource = (event.source as Order["source"]) || "external"

      persistExternalOrder({
        orderId: event.orderId,
        tenantId: state.tenantId!,
        source: orderSource,
        status: "pending",
        externalStatus: "awaiting_payment",
        paymentMethod: event.paymentMethod as Order["paymentMethod"],
        items: event.items as Order["items"],
        total: event.total,
      }).then(() => {
        console.log(`[App] order:created persisted: ${event.orderId}`)
      }).catch((err) => {
        console.error("[App] order:created persist failed:", err)
      })

      playOrderNotification()
    })

    const unsubOrderConfirmed = onSocketEvent("order:confirmed", (data: unknown) => {
      const event = data as { orderId: string }
      updateExternalOrderStatus(event.orderId, state.tenantId!, "confirmed")
        .then(() => {
          console.log(`[App] order:confirmed persisted: ${event.orderId}`)
        })
        .catch(() => {})
    })

    const unsubOrderStatusUpdated = onSocketEvent("order:status_updated", (data: unknown) => {
      const event = data as { orderId: string; externalStatus: string }
      updateExternalOrderStatus(event.orderId, state.tenantId!, event.externalStatus as Order["externalStatus"])
        .catch(() => {})
    })

    const unsubOrderCancelled = onSocketEvent("order:cancelled", (data: unknown) => {
      const event = data as { orderId: string; reason?: string }
      cancelExternalOrder(event.orderId, state.tenantId!, event.reason)
        .then(() => {
          console.log(`[App] order:cancelled persisted: ${event.orderId}`)
        })
        .catch(() => {})
    })

    const unsubscribe = onReconnect(async () => {
      console.log("[App] reconnect detected, flushing events...")
      const result = await flush(state.tenantId!, state.jwt!.accessToken)
      if (result.synced > 0) {
        console.log(`[App] flushed ${result.synced} events`)
      }

      // ── Fetch pending orders from SyncLayer on reconnect ──
      fetchPendingOrders(state.tenantId!, state.jwt!.accessToken).then((pending) => {
        if (pending.length > 0) {
          pending.forEach((o) => {
            persistExternalOrder({
              orderId: o.orderId,
              tenantId: o.tenantId,
              source: "external",
              status: (o.status as Order["status"]) ?? "pending",
              externalStatus: (o.status as Order["externalStatus"]) ?? "awaiting_payment",
              paymentMethod: o.paymentMethod as Order["paymentMethod"],
              items: o.items as Order["items"],
              total: o.total,
            }).catch(() => {})
          })

          // Reconcile terminal SaaS statuses (delivery completed while offline)
          pending.forEach((o) => {
            if (o.status === "delivered" || o.status === "cancelled") {
              updateExternalOrderStatus(o.orderId, o.tenantId, o.status as Order["externalStatus"]).catch(() => {})
            }
          })

          console.log(`[App] reconnected: persisted ${pending.length} pending orders`)
        }
      }).catch(() => {})

      // ── Fetch eventos fallidos del Sync Layer ──────────────────────
      // Cuando el Hub reconecta, busca eventos que el Sync Layer no
      // pudo entregar (status: "failed") y los muestra en Pendientes
      // para que el manager los asigne manualmente.
      const failedEvents = await fetchFailedCashSaleEvents(
        state.tenantId!,
        state.jwt!.accessToken
      )
      if (failedEvents.length > 0) {
        console.warn(`[App] ${failedEvents.length} failed cash sale events found`)
        // TODO: exponer failedEvents al CashDashboard para que el manager
        // los vea en la escena "Pendientes" y pueda reintentar o asignar.
      }
    })

    return () => {
      unsubCashSale()
      unsubOrderCreated()
      unsubOrderConfirmed()
      unsubOrderStatusUpdated()
      unsubOrderCancelled()
      unsubscribe()
      stopConnectivityMonitoring()
      disconnectSocket()
    }
  }, [state.status, state.tenantId, state.jwt])

  if (state.status === "login" || state.status === "error") {
    return (
      <LoginScreen
        onLogin={login}
        error={state.status === "error" ? state.error : undefined}
        loading={false}
      />
    )
  }

  if (state.status === "loading") {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--surface-secondary)",
        fontFamily: "var(--font-family)",
      }}>
        <div className="loading-state">
          <span className="spinner" />
          Cargando...
        </div>
      </div>
    )
  }

  const tenantName = state.tenantId ?? "Restaurante"

  return (
    <LayoutProvider>
      <AppShell
        tenantName={tenantName}
        activeContext={activeContext}
        setActiveContext={setActiveContext}
        logout={logout}
        showQuickAccess={showQuickAccess}
        setShowQuickAccess={setShowQuickAccess}
      />
    </LayoutProvider>
  )
}

function AppShell({
  tenantName,
  activeContext,
  setActiveContext,
  logout,
  showQuickAccess,
  setShowQuickAccess,
}: {
  tenantName: string
  activeContext: Context
  setActiveContext: (ctx: Context) => void
  logout: () => void
  showQuickAccess: boolean
  setShowQuickAccess: (show: boolean) => void
}) {
  const { sidebarCollapsed } = useLayout()

  return (
    <div className={`ros-app${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <Header tenantName={tenantName} userName="Operador" />

      <Navigation
        items={NAV_ITEMS}
        activeId={activeContext}
        onSelect={(id) => setActiveContext(id as Context)}
        onLogout={logout}
        onQuickAccess={() => setShowQuickAccess(!showQuickAccess)}
      />

      <main className="workspace">
        {activeContext === "counter" && <CounterDashboard />}
        {activeContext === "customers" && <CustomersDashboard />}
        {activeContext === "waiter" && <WaiterDashboard />}
        {activeContext === "incoming" && <IncomingOrdersDashboard />}
        {activeContext === "flota" && <FlotaDashboard />}
        {activeContext === "caja" && <CashDashboard />}
        {activeContext === "ventas" && <SalesDashboard />}
      </main>

      <ContextPanel />
      <ActionBar />

      <QuickAccessPanel
        isOpen={showQuickAccess}
        onClose={() => setShowQuickAccess(false)}
      />
    </div>
  )
}

export default App
