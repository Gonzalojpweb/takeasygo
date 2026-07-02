import { useAuth } from "./hooks/useAuth"
import { LoginScreen } from "./components/LoginScreen"

function App() {
  const { state, login, logout } = useAuth()

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
