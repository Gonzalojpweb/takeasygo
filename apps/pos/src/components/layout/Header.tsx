import { useState, useEffect } from "react"
import { Zap } from "lucide-react"
import { getSocket } from "../../services/socket-client"

interface HeaderProps {
  tenantName: string
  userName: string
  onQuickAccess?: () => void
}

export function Header({ tenantName, userName, onQuickAccess }: HeaderProps) {
  const [time, setTime] = useState(new Date())
  const [connected, setConnected] = useState(() => getSocket()?.connected ?? false)

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
        {onQuickAccess && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={onQuickAccess}
            title="Accesos rápidos"
            style={{
              fontSize: "var(--font-size-xs)",
              padding: "4px 8px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <Zap size={14} />
            Accesos
          </button>
        )}
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
