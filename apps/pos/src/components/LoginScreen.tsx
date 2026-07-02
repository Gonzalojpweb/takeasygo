import { useState } from "react"
import type { FormEvent } from "react"

interface LoginScreenProps {
  onLogin: (
    mode: "pin" | "email",
    credentials: Record<string, string>
  ) => Promise<void>
  error?: string
  loading?: boolean
}

export function LoginScreen({ onLogin, error, loading }: LoginScreenProps) {
  const [mode, setMode] = useState<"pin" | "email">("pin")
  const [employeePin, setEmployeePin] = useState("")
  const [tenantId, setTenantId] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (mode === "pin") {
      await onLogin("pin", { employeePin, tenantId })
    } else {
      await onLogin("email", { email, password, tenantId })
    }
  }

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
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: "360px",
          padding: "2rem",
          backgroundColor: "#111",
          borderRadius: "12px",
          border: "1px solid #333",
        }}
      >
        <h1
          style={{
            fontSize: "1.5rem",
            fontWeight: 600,
            marginBottom: "0.5rem",
            textAlign: "center",
          }}
        >
          TakeasyGO POS
        </h1>
        <p
          style={{
            fontSize: "0.875rem",
            color: "#888",
            textAlign: "center",
            marginBottom: "1.5rem",
          }}
        >
          {mode === "pin"
            ? "Ingresá tu PIN de cajero"
            : "Ingresá tu cuenta"}
        </p>

        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            marginBottom: "1.25rem",
          }}
        >
          <button
            type="button"
            onClick={() => setMode("pin")}
            style={{
              flex: 1,
              padding: "0.5rem",
              backgroundColor: mode === "pin" ? "#fff" : "#222",
              color: mode === "pin" ? "#000" : "#888",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.875rem",
            }}
          >
            PIN
          </button>
          <button
            type="button"
            onClick={() => setMode("email")}
            style={{
              flex: 1,
              padding: "0.5rem",
              backgroundColor: mode === "email" ? "#fff" : "#222",
              color: mode === "email" ? "#000" : "#888",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.875rem",
            }}
          >
            Email
          </button>
        </div>

        {mode === "pin" ? (
          <>
            <input
              type="text"
              placeholder="PIN"
              value={employeePin}
              onChange={(e) => setEmployeePin(e.target.value)}
              style={{
                width: "100%",
                padding: "0.75rem",
                marginBottom: "0.75rem",
                backgroundColor: "#222",
                color: "#fff",
                border: "1px solid #444",
                borderRadius: "6px",
                fontSize: "1rem",
                boxSizing: "border-box",
                letterSpacing: "0.25em",
                textAlign: "center",
              }}
            />
            <input
              type="text"
              placeholder="Tenant ID"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              style={{
                width: "100%",
                padding: "0.75rem",
                marginBottom: "1.25rem",
                backgroundColor: "#222",
                color: "#fff",
                border: "1px solid #444",
                borderRadius: "6px",
                fontSize: "1rem",
                boxSizing: "border-box",
              }}
            />
          </>
        ) : (
          <>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%",
                padding: "0.75rem",
                marginBottom: "0.75rem",
                backgroundColor: "#222",
                color: "#fff",
                border: "1px solid #444",
                borderRadius: "6px",
                fontSize: "1rem",
                boxSizing: "border-box",
              }}
            />
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "0.75rem",
                marginBottom: "1.25rem",
                backgroundColor: "#222",
                color: "#fff",
                border: "1px solid #444",
                borderRadius: "6px",
                fontSize: "1rem",
                boxSizing: "border-box",
              }}
            />
          </>
        )}

        {error && (
          <p
            style={{
              color: "#ef4444",
              fontSize: "0.875rem",
              marginBottom: "1rem",
              textAlign: "center",
            }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "0.75rem",
            backgroundColor: loading ? "#555" : "#fff",
            color: loading ? "#888" : "#000",
            border: "none",
            borderRadius: "6px",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: "1rem",
          }}
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  )
}
