import { useState, useEffect, useCallback } from "react"
import { ExternalLink } from "lucide-react"
import { getSocket } from "../../services/socket-client"
import { useAuth } from "../../hooks/useAuth"
import { requestSsoToken } from "../../services/sso"
import { isAudioUnlocked, unlockAudio } from "../../services/notification-sound"

interface HeaderProps {
  tenantName: string
  userName: string
}

export function Header({ tenantName, userName }: HeaderProps) {
  const { state, logout } = useAuth()
  const [time, setTime] = useState(new Date())
  const [connected, setConnected] = useState(() => getSocket()?.connected ?? false)
  const [ssoLoading, setSsoLoading] = useState(false)
  // Aviso de sesión: AuthContext emite `auth:expiring` cuando el refresh
  // automático no pudo renovar el token (antes nadie escuchaba el evento y el
  // cajero se enteraba recién cuando lo sacaba al login — Auditoría §1.5).
  const [sessionWarning, setSessionWarning] = useState(false)
  const [audioReady, setAudioReady] = useState(isAudioUnlocked)

  useEffect(() => {
    const onUnlocked = () => setAudioReady(true)
    window.addEventListener("audio:unlocked", onUnlocked)
    return () => window.removeEventListener("audio:unlocked", onUnlocked)
  }, [])

  useEffect(() => {
    const onExpiring = () => setSessionWarning(true)
    const onRefreshed = () => setSessionWarning(false)
    window.addEventListener("auth:expiring", onExpiring)
    window.addEventListener("auth:refreshed", onRefreshed)
    return () => {
      window.removeEventListener("auth:expiring", onExpiring)
      window.removeEventListener("auth:refreshed", onRefreshed)
    }
  }, [])

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
      // Sin fallback a localhost: en producción abriría la máquina del cajero.
      const saasUrl = import.meta.env.VITE_SAAS_URL
      if (!saasUrl) {
        console.error("[Header] VITE_SAAS_URL no está configurada en este build")
        alert("El POS no tiene configurada la URL del SaaS")
        setSsoLoading(false)
        return
      }
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
      {/* Izquierda: Brand */}
      <div className="header-left" style={{ flex: 1 }}>
        <div className="brand">
          <div className="brand-icon" style={{ borderRadius: '12px 12px 12px 0', fontSize: '15px' }}>🔥</div>
          <span style={{ fontSize: 'var(--font-size-base)', fontWeight: 600 }}>TakeasyGO</span>
        </div>
      </div>

      {/* Centro: Nombre tenant */}
      <div style={{ flex: 1, textAlign: 'center', fontSize: 'var(--font-size-lg)', fontWeight: 600, color: 'var(--text-primary)' }}>
        {tenantName}
      </div>

      {/* Derecha: Acciones + Estado */}
      <div className="header-right" style={{ flex: 1, justifyContent: 'flex-end' }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleGoToSaas}
          disabled={ssoLoading}
          title="Ir al SaaS"
          style={{ fontSize: 'var(--font-size-xs)', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px', opacity: ssoLoading ? 0.6 : 1 }}
        >
          <ExternalLink size={14} />
          {ssoLoading ? 'Abriendo...' : 'Ir al SaaS'}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => window.location.reload()}
          title="Refrescar POS"
          style={{ fontSize: 'var(--font-size-xs)', padding: '4px 8px' }}
        >
          ↻ Refrescar
        </button>
        {!audioReady && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { void unlockAudio() }}
            title="El navegador bloquea el sonido hasta que toques la pantalla"
            style={{ fontSize: 'var(--font-size-xs)', padding: '4px 8px' }}
          >
            🔇 Activar sonido
          </button>
        )}
        {sessionWarning && (
          <button
            className="btn btn-sm"
            onClick={() => { void logout() }}
            title="No se pudo renovar la sesión automáticamente"
            style={{ fontSize: 'var(--font-size-xs)', padding: '4px 8px', background: 'var(--warning)', color: 'white' }}
          >
            ⚠ Sesión por vencer — reingresar
          </button>
        )}
        <div className={`sync-status ${connected ? '' : 'disconnected'}`}>
          <div className="sync-dot" />
          <span>{connected ? 'Online' : 'Sin conexión'}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginRight: '4px' }}>
          <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {time.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
            {time.toLocaleDateString('es-AR', { weekday: 'long' })}
          </div>
        </div>
        <div className="header-avatar" title={userName} style={{ background: 'var(--brand-orange)', color: 'white' }}>
          {initials}
        </div>
      </div>
    </header>
  )
}
