import { useState, useEffect, useCallback } from "react"
import { ExternalLink } from "lucide-react"
import { getSocket } from "../../services/socket-client"
import { useAuth } from "../../hooks/useAuth"
import { requestSsoToken } from "../../services/sso"

interface HeaderProps {
  tenantName: string
  userName: string
}

export function Header({ tenantName, userName }: HeaderProps) {
  const { state } = useAuth()
  const [time, setTime] = useState(new Date())
  const [connected, setConnected] = useState(() => getSocket()?.connected ?? false)
  const [ssoLoading, setSsoLoading] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return
    setConnected(socket.connected)
    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)
    socket.on("connect", onConnect)
    socket.on("disconnect", onDisconnect)
    return () => {
      socket.off("connect", onConnect)
      socket.off("disconnect", onDisconnect)
    }
  }, [])

  const handleGoToSaas = useCallback(async () => {
    if (state.status !== "authenticated" || !state.jwt?.accessToken) return

    setSsoLoading(true)
    try {
      const saasUrl = import.meta.env.VITE_SAAS_URL ?? "http://localhost:3000"
      const newTab = window.open("", "_blank")
      if (!newTab) {
        alert("Popup bloqueado — permití ventanas emergentes")
        setSsoLoading(false)
        return
      }

      const { ssoToken, jti } = await requestSsoToken(state.jwt.accessToken)
      newTab.location.href = `${saasUrl}/api/auth/sso?token=${ssoToken}&jti=${jti}&callbackUrl=${encodeURIComponent("/")}`
    } catch (err) {
      console.error("[Header] SSO failed:", err)
      alert("Error al conectar con SaaS")
    } finally {
      setSsoLoading(false)
    }
  }, [state.status, state.jwt])

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
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
          <span>
            🕐{" "}
            {time.toLocaleTimeString("es-AR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>
      <div className="header-right">
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleGoToSaas}
          disabled={ssoLoading}
          title="Ir al SaaS"
          style={{
            fontSize: "var(--font-size-xs)",
            padding: "4px 8px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            opacity: ssoLoading ? 0.6 : 1,
          }}
        >
          <ExternalLink size={14} />
          {ssoLoading ? "Abriendo..." : "Ir al SaaS"}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => window.location.reload()}
          title="Refrescar POS"
          style={{ fontSize: "var(--font-size-xs)", padding: "4px 8px" }}
        >
          ↻ Refrescar
        </button>
        <div className={`sync-status ${connected ? "" : "disconnected"}`}>
          <div className="sync-dot" />
          <span>{connected ? "Sincronizado" : "Sin conexión"}</span>
        </div>
        <div className="header-avatar" title={userName}>
          {initials}
        </div>
      </div>
    </header>
  )
}
