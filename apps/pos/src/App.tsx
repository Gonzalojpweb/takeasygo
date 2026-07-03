import { useEffect } from "react"
import { useAuth } from "./hooks/useAuth"
import { LoginScreen } from "./components/LoginScreen"
import {
  startConnectivityMonitoring,
  stopConnectivityMonitoring,
  onReconnect,
} from "./services/connectivity"
import { flush } from "./services/event-queue"

function App() {
  const { state, login, logout } = useAuth()

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
      if (result.failed > 0) {
        console.warn(`[App] ${result.failed} events failed to flush`)
      }
    })

    return () => {
      unsubscribe()
      stopConnectivityMonitoring()
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
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#000",
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <p style={{ color: "#888" }}>Cargando...</p>
      </div>
    )
  }

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>TakeasyGO POS</h1>
      <p>Sesión activa — hub autenticado</p>
      <button
        onClick={logout}
        style={{
          marginTop: "1rem",
          padding: "0.5rem 1rem",
          backgroundColor: "#ef4444",
          color: "#fff",
          border: "none",
          borderRadius: "6px",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        Cerrar sesión
      </button>
    </main>
  )
}

export default App
