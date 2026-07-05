import { useState, useEffect } from "react"
import { useAuth } from "./hooks/useAuth"
import { LoginScreen } from "./components/LoginScreen"
import { CounterDashboard } from "./components/Counter/CounterDashboard"
import { WaiterDashboard } from "./components/Waiter/WaiterDashboard"
import { IncomingOrdersDashboard } from "./components/IncomingOrders/IncomingOrdersDashboard"
import { FlotaDashboard } from "./components/Flota/FlotaDashboard"
import {
  startConnectivityMonitoring,
  stopConnectivityMonitoring,
  onReconnect,
} from "./services/connectivity"
import { flush } from "./services/event-queue"
import { disconnectSocket } from "./services/socket-client"
import "./styles/pos.css"

type Context = "counter" | "waiter" | "incoming" | "flota"

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
  const initials = userName.slice(0, 2).toUpperCase()

  return (
    <div className="ros-app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="brand">
            <div className="brand-icon">TG</div>
            <span>TakeasyGO</span>
          </div>
          <div className="header-divider" />
          <div className="header-info">
            <span>📍 {tenantName}</span>
            <span className="header-divider" />
            <span>🕐 {new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        </div>
        <div className="header-right">
          <div className="sync-status">
            <div className="sync-dot" />
            <span>Sincronizado</span>
          </div>
          <div className="header-avatar" title={userName}>
            {initials}
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="navigation">
        <div className="nav-label">Contextos</div>

        <div
          className={`nav-item ${activeContext === "counter" ? "active" : ""}`}
          onClick={() => setActiveContext("counter")}
        >
          <div className="nav-item-icon">🧮</div>
          <span>Counter</span>
        </div>

        <div
          className={`nav-item ${activeContext === "waiter" ? "active" : ""}`}
          onClick={() => setActiveContext("waiter")}
        >
          <div className="nav-item-icon">🍽️</div>
          <span>Waiter</span>
        </div>

        <div
          className={`nav-item ${activeContext === "incoming" ? "active" : ""}`}
          onClick={() => setActiveContext("incoming")}
        >
          <div className="nav-item-icon">📦</div>
          <span>Pedidos</span>
        </div>

        <div
          className={`nav-item ${activeContext === "flota" ? "active" : ""}`}
          onClick={() => setActiveContext("flota")}
        >
          <div className="nav-item-icon">🛵</div>
          <span>Flota</span>
        </div>

        <div className="nav-spacer" />

        <div
          className="nav-item"
          onClick={logout}
        >
          <div className="nav-item-icon">🚪</div>
          <span>Salir</span>
        </div>
      </nav>

      {/* Workspace — active context */}
      {activeContext === "counter" && <CounterDashboard />}
      {activeContext === "waiter" && <WaiterDashboard />}
      {activeContext === "incoming" && <IncomingOrdersDashboard />}
      {activeContext === "flota" && <FlotaDashboard />}
    </div>
  )
}

export default App
