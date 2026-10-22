import { useState, useEffect, useMemo, useSyncExternalStore } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { useAuth } from "./hooks/useAuth"
import { db } from "./db/dexie"
import { LoginScreen } from "./components/LoginScreen"
import { CounterDashboard } from "./components/Counter/CounterDashboard"
import { WaiterDashboard } from "./components/Waiter/WaiterDashboard"
import { FlotaWidget } from "./components/Flota/FlotaWidget"
import { SalesDashboard } from "./components/Sales/SalesDashboard"
import { CashDashboard } from "./components/Cash/CashDashboard"
import { Header } from "./components/layout/Header"
import { Navigation } from "./components/layout/Navigation"
import { ContextPanel } from "./components/layout/ContextPanel"
import { ActionBar } from "./components/layout/ActionBar"
import { UpdateBanner } from "./components/layout/UpdateBanner"
import { applyAppUpdate, isAppUpdateReady, subscribeAppUpdate } from "./services/app-update"
import { LayoutProvider, useLayout } from "./components/layout/LayoutContext"
import { contextsForRole, findContext, roleLabel, type ContextId } from "./components/layout/contexts"
import type { SessionProfile } from "./services/auth-api"
import {
  startConnectivityMonitoring,
  stopConnectivityMonitoring,
  onReconnect,
} from "./services/connectivity"
import { flush } from "./services/event-queue"
import { startPosPolling, stopPosPolling } from "./services/polling"
import { connectSocket, disconnectSocket, onSocketEvent } from "./services/socket-client"
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
import { playOrderNotification, installAudioUnlock } from "./services/notification-sound"
import type { Order } from "@takeasygo/types"
import "./styles/pos.css"

function App() {
  const { state, login, logout } = useAuth()

  // Desbloquea el audio en el primer gesto del usuario (autoplay, §7.4).
  useEffect(() => installAudioUnlock(), [])
  const [activeContext, setActiveContext] = useState<ContextId>("counter")
  const updateReady = useSyncExternalStore(subscribeAppUpdate, isAppUpdateReady)

  // Versión nueva sin sesión activa (login, carga o justo después de cerrar
  // sesión): se aplica sola. Con sesión activa se avisa (UpdateBanner).
  useEffect(() => {
    if (updateReady && state.status !== "authenticated") applyAppUpdate()
  }, [updateReady, state.status])

  useEffect(() => {
    if (state.status !== "authenticated" || !state.tenantId || !state.jwt) {
      return
    }

    // ── Celular del mozo (token handheld, rol waiter) ──────────────────────
    // Solo opera el Salón: polling de mesas y órdenes, sin caja (el server se
    // la niega) y sin socket (ventas de caja y pedidos externos no son suyos;
    // los estados de cocina le llegan por el polling de órdenes).
    if (decodeRole(state.jwt.accessToken) === "waiter") {
      startConnectivityMonitoring()
      startPosPolling(state.tenantId, { includeCash: false })
      return () => {
        stopConnectivityMonitoring()
        stopPosPolling()
      }
    }

    startConnectivityMonitoring()

    // ── M6: diff-then-put de mesas/órdenes/cajas contra el SaaS ──
    // Sin esto cada terminal solo ve lo que ella misma escribió (D14).
    // El primer tick corre adentro de startPosPolling, sin esperar el intervalo.
    startPosPolling(state.tenantId)

    // ── Connect socket at root level (CRITICAL) ──
    connectSocket(state.jwt.accessToken)

    // ── Disconnect socket on auth expiry ──
    const onAuthExpired = () => disconnectSocket()
    window.addEventListener("auth:expired", onAuthExpired)

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
    // These MUST be in App.tsx, not in the "Entrantes" view of the Counter,
    // because that view is unmounted when the user is on any other view.
    // If these listeners lived only in the view, orders and
    // status updates would be silently lost when the user is on Counter, Caja, etc.

    // Cleanup pending status updates from previous sessions (TTL 24h)
    cleanupPendingStatusUpdates().catch(() => {})

    // Fetch pending orders from SyncLayer on connect/reconnect
    fetchPendingOrders(state.jwt!.accessToken).then((pending) => {
      if (pending.length > 0) {
        pending.forEach((o) => {
          persistExternalOrder({
            orderId: o.orderId,
            tenantId: o.tenantId,
            source: "external",
            status: (o.status as Order["status"]) ?? "pending",
            externalStatus: (o.status as Order["externalStatus"]) ?? "awaiting_payment",
            paymentMethod: o.paymentMethod as Order["paymentMethod"],
            orderMode: o.orderMode,
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
      const event = data as { orderId: string; items: unknown[]; total: number; baseTotal?: number; surchargeAmount?: number; source?: string; paymentMethod?: string; orderMode?: string }
      const orderSource = (event.source as Order["source"]) || "external"

      persistExternalOrder({
        orderId: event.orderId,
        tenantId: state.tenantId!,
        source: orderSource,
        status: "pending",
        externalStatus: "awaiting_payment",
        paymentMethod: event.paymentMethod as Order["paymentMethod"],
        orderMode: event.orderMode,
        items: event.items as Order["items"],
        total: event.total,
        baseTotal: event.baseTotal,
        surchargeAmount: event.surchargeAmount,
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
      fetchPendingOrders(state.jwt!.accessToken).then((pending) => {
        if (pending.length > 0) {
          pending.forEach((o) => {
            persistExternalOrder({
              orderId: o.orderId,
              tenantId: o.tenantId,
              source: "external",
              status: (o.status as Order["status"]) ?? "pending",
              externalStatus: (o.status as Order["externalStatus"]) ?? "awaiting_payment",
              paymentMethod: o.paymentMethod as Order["paymentMethod"],
              orderMode: o.orderMode,
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
        state.jwt!.accessToken
      )
      if (failedEvents.length > 0) {
        // Ya están expuestos: Caja → "Pendientes" los lista con badge y botón
        // de reintento (CashDashboard → retryCashSaleEvent).
        console.warn(`[App] ${failedEvents.length} failed cash sale events found (ver Caja → Pendientes)`)
      }
    })

    return () => {
      window.removeEventListener("auth:expired", onAuthExpired)
      unsubCashSale()
      unsubOrderCreated()
      unsubOrderConfirmed()
      unsubOrderStatusUpdated()
      unsubOrderCancelled()
      unsubscribe()
      stopConnectivityMonitoring()
      stopPosPolling()
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

  return (
    <LayoutProvider>
      <AppShell
        tenantId={state.tenantId}
        profile={state.jwt?.profile}
        tokenRole={decodeRole(state.jwt?.accessToken)}
        activeContext={activeContext}
        setActiveContext={setActiveContext}
        logout={logout}
      />
      {updateReady && <UpdateBanner />}
    </LayoutProvider>
  )
}

/** Rol del token (fallback si el Sync todavía no devuelve `profile`). Solo para la UI. */
function decodeRole(token: string | undefined): string | undefined {
  if (!token) return undefined
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))
    return typeof payload.role === "string" ? payload.role : undefined
  } catch {
    return undefined
  }
}

function AppShell({
  tenantId,
  profile,
  tokenRole,
  activeContext,
  setActiveContext,
  logout,
}: {
  tenantId?: string
  profile?: SessionProfile
  tokenRole?: string
  activeContext: ContextId
  setActiveContext: (ctx: ContextId) => void
  logout: () => void
}) {
  const { sidebarCollapsed } = useLayout()
  const role = profile?.role ?? tokenRole
  const contexts = useMemo(() => contextsForRole(role), [role])

  // Un rol que perdió acceso al contexto activo vuelve al primero permitido.
  const current = contexts.some((c) => c.id === activeContext)
    ? findContext(activeContext)
    : contexts[0]

  // Badge de trabajo pendiente: pedidos externos sin integrar (Entrantes vive
  // dentro de Counter). Reconocimiento > memoria (Axioma 03).
  const pendingIncoming = useLiveQuery(
    () => (tenantId
      ? db.orders
          .where("tenantId")
          .equals(tenantId)
          .and((o) => o.source === "external" && !o.integratedAt && o.status !== "cancelled" && o.status !== "delivered")
          .count()
      : 0),
    [tenantId]
  ) ?? 0

  return (
    <div className={`ros-app${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <Header
        tenantName={profile?.tenantName ?? ""}
        locationName={profile?.locationName}
        userName={profile?.userName ?? ""}
        roleLabel={roleLabel(role)}
        contextTitle={current.title}
        showSaasLink={role !== "waiter"}
      />

      <Navigation
        items={contexts}
        activeId={current.id}
        badges={{ counter: pendingIncoming }}
        onSelect={(id) => setActiveContext(id as ContextId)}
        onLogout={logout}
      />

      <main className="workspace" aria-label={current.title}>
        {current.id === "counter" && <CounterDashboard />}
        {current.id === "waiter" && <WaiterDashboard />}
        {current.id === "flota" && <FlotaWidget />}
        {current.id === "caja" && <CashDashboard />}
        {current.id === "ventas" && <SalesDashboard />}
      </main>

      <ContextPanel empty={current.empty} />
      <ActionBar />
    </div>
  )
}

export default App
