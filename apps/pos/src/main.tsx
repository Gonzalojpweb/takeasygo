import React from "react"
import ReactDOM from "react-dom/client"
import { AuthProvider } from "./hooks/AuthContext"
import App from "./App"

const root = document.getElementById("root")
if (!root) throw new Error("Root element not found")

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
)
