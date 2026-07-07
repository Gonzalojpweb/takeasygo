import { useState, useEffect } from "react"
import { useAuth } from "./hooks/useAuth"
import { LoginScreen } from "./components/LoginScreen"
import { CounterDashboard } from "./components/Counter/CounterDashboard"
import { WaiterDashboard } from "./components/Waiter/WaiterDashboard"
import { IncomingOrdersDashboard } from "./components/IncomingOrders/IncomingOrdersDashboard"
import { FlotaDashboard } from "./components/Flota/FlotaDashboard"
import { CustomersDashboard } from "./components/Customers/CustomersDashboard"
import { Header } from "./components/layout/Header"
import { Navigation } from "./components/layout/Navigation"
import { ContextPanel } from "./components/layout/ContextPanel"
import { ActionBar } from "./components/layout/ActionBar"
import { LayoutProvider } from "./components/layout/LayoutContext"
import {
  startConnectivityMonitoring,
  stopConnectivityMonitoring,
  onReconnect,
} from "./services/connectivity"
import { flush } from "./services/event-queue"
import { disconnectSocket } from "./services/socket-client"
import "./styles/pos.css"

type Context = "counter" | "customers" | "waiter" | "incoming" | "flota"

const NAV_ITEMS = [
  { id: "counter", icon: "🧮", label: "Counter" },
  { id: "customers", icon: "👥", label: "Clientes" },
  { id: "waiter", icon: "🍽️", label: "Waiter" },
  { id: "incoming", icon: "📦", label: "Pedidos" },
  { id: "flota", icon: "🛵", label: "Flota" },
]

function App() {
  const { state, login, logout } = useAuth()
  const [activeContext, setActiveContext] = useState<Context>("counter")

  useEffect(() => {
    if (state.status !== "authenticated" || !state.tenantId || !state.jwt) {
      return
    }

    startConnectivityMonitoring()

    const unsubscribe = onReconnect(async () => {
      console.log("[App] reconnect detected, flushing events...")
      const result = await flush(state.tenantId!, state.jwt!.accessToken)
      if (result.synced > 0) {
        console.log(`[App] flushed ${result.synced} events`)
      }
    })

    return () => {
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
        backgroundColor: "var(--surface-elevated)",
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
  const userName = "Operador"

  return (
    <LayoutProvider>
      <div className="ros-app">
        <Header tenantName={tenantName} userName={userName} />

        <Navigation
          items={NAV_ITEMS}
          activeId={activeContext}
          onSelect={(id) => setActiveContext(id as Context)}
          onLogout={logout}
        />

        <main className="workspace">
          {activeContext === "counter" && <CounterDashboard />}
          {activeContext === "customers" && <CustomersDashboard />}
          {activeContext === "waiter" && <WaiterDashboard />}
          {activeContext === "incoming" && <IncomingOrdersDashboard />}
          {activeContext === "flota" && <FlotaDashboard />}
        </main>

        <ContextPanel />
        <ActionBar />
      </div>
    </LayoutProvider>
  )
}

export default App
