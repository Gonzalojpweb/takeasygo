import { useState } from "react"
import type { FormEvent } from "react"
import { getLocations, loginWithPin, loginWithEmail } from "../services/auth-api"
import type { PosLocation } from "../services/auth-api"

interface LoginScreenProps {
  onLogin: (
    mode: "pin" | "email",
    credentials: Record<string, string>
  ) => Promise<void>
  error?: string
  loading?: boolean
}

interface PendingCredentials {
  mode: "pin" | "email"
  credentials: Record<string, string>
}

export function LoginScreen({ onLogin, error, loading }: LoginScreenProps) {
  const [mode, setMode] = useState<"pin" | "email">("pin")
  const [employeePin, setEmployeePin] = useState("")
  const [tenantId, setTenantId] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [locations, setLocations] = useState<PosLocation[] | null>(null)
  const [pending, setPending] = useState<PendingCredentials | null>(null)

  const busy = submitting || !!loading

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (locations || busy) return

    const credentials: Record<string, string> =
      mode === "pin"
        ? { employeePin, tenantId }
        : { email, password, tenantId }

    setSubmitting(true)
    try {
      // ── Login temporal: solo para descubrir sedes del tenant ──
      const token =
        mode === "pin"
          ? (await loginWithPin(employeePin, tenantId)).accessToken
          : (await loginWithEmail(email, password)).accessToken

      const locs = await getLocations(token)

      if (locs.length > 1) {
        // Multi-sede: mostrar el selector antes de autenticar la sesión real.
        setPending({ mode, credentials })
        setLocations(locs)
        return
      }

      // Single-sede (o sin sedes activas): login final con la sede resuelta.
      const locationId = locs[0]?.id
      await onLogin(mode, { ...credentials, ...(locationId ? { locationId } : {}) })
    } catch {
      // Fallo del login temporal → déjalo pasar por el flujo normal de sesión
      // (onLogin muestra el error de credenciales en la UI).
      await onLogin(mode, { ...credentials })
    } finally {
      setSubmitting(false)
    }
  }

  const handleSelectLocation = async (locationId: string) => {
    if (!pending || busy) return
    setSubmitting(true)
    try {
      await onLogin(pending.mode, { ...pending.credentials, locationId })
    } finally {
      setSubmitting(false)
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
      {locations ? (
        <div
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
            Seleccioná tu sede
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              color: "#888",
              textAlign: "center",
              marginBottom: "1.5rem",
            }}
          >
            Este tenant tiene varias sucursales
          </p>
          {locations.map((loc) => (
            <button
              key={loc.id}
              type="button"
              disabled={busy}
              onClick={() => handleSelectLocation(loc.id)}
              style={{
                display: "block",
                width: "100%",
                padding: "0.75rem",
                marginBottom: "0.75rem",
                backgroundColor: loc.acceptsOrders ? "#222" : "#1a1a1a",
                color: "#fff",
                border: "1px solid #444",
                borderRadius: "6px",
                cursor: loc.acceptsOrders && !busy ? "pointer" : "not-allowed",
                fontWeight: 600,
                fontSize: "1rem",
                textAlign: "left",
              }}
            >
              {loc.name}
              {!loc.acceptsOrders && (
                <span style={{ fontSize: "0.75rem", color: "#888", display: "block" }}>
                  No está aceptando pedidos
                </span>
              )}
            </button>
          ))}
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
        </div>
      ) : (
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
            disabled={busy}
            style={{
              width: "100%",
              padding: "0.75rem",
              backgroundColor: busy ? "#555" : "#fff",
              color: busy ? "#888" : "#000",
              border: "none",
              borderRadius: "6px",
              cursor: busy ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: "1rem",
            }}
          >
            {busy ? "Entrando..." : "Entrar"}
          </button>
        </form>
      )}
    </div>
  )
}