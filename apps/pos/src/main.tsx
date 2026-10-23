import React from "react"
import ReactDOM from "react-dom/client"
import { AuthProvider } from "./hooks/AuthContext"
import App from "./App"
import { ensureLatestBuild, registerAppUpdates } from "./services/app-update"

const root = document.getElementById("root")
if (!root) throw new Error("Root element not found")

function render() {
  ReactDOM.createRoot(root!).render(
    <React.StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
    </React.StrictMode>
  )
}

// Primero: ¿esta copia es la versión publicada? Si no, se limpia y recarga
// antes de mostrar nada (así nunca se ve una versión vieja). Sin red o si
// tarda más de 3 s, sigue con lo que hay.
ensureLatestBuild()
  .then((r) => {
    if (r === "ok") {
      registerAppUpdates()
      render()
    }
  })
  .catch(() => {
    registerAppUpdates()
    render()
  })
