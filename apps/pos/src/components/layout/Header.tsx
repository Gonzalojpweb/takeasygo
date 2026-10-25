import { useState, useEffect, useCallback } from "react"
import { ExternalLink, RefreshCw, VolumeX, AlertTriangle, MapPin, Cloud, CloudOff, ZoomIn, ZoomOut } from "lucide-react"
import { useUiZoom } from "../../hooks/useUiZoom"
import { getSocket } from "../../services/socket-client"
import { useAuth } from "../../hooks/useAuth"
import { requestSsoToken } from "../../services/sso"
import { isAudioUnlocked, unlockAudio } from "../../services/notification-sound"
import { CURRENT_BUILD, versionLabel } from "../../services/app-update"
import { useLayout } from "./LayoutContext"

// ============================================================================
// Header — identidad permanente: ¿dónde estoy? (W0S §2, VLS §3)
// ============================================================================
// Izquierda: marca + local + sede. Centro: contexto activo. Derecha: estado
// (conexión, sonido, sesión), reloj y usuario con su rol. Nunca contiene
// acciones operativas: "Ir al SaaS" y "Refrescar" son de sistema.
// Antes el centro mostraba el ObjectId del tenant y el usuario era "Operador".
// ============================================================================

interface HeaderProps {
  tenantName: string
  locationName?: string | null
  userName: string
  roleLabel: string
  contextTitle: string
  /** "Ir al SaaS" solo en la terminal de caja (el Sync lo niega a celulares). */
  showSaasLink?: boolean
}

export function Header({ tenantName, locationName, userName, roleLabel, contextTitle, showSaasLink = true }: HeaderProps) {
  const { headerCenter } = useLayout()
  const uiZoom = useUiZoom()
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
    if (!socket) {
      // Celular del mozo: sin socket. El estado es la conectividad del equipo.
      const update = () => setConnected(navigator.onLine)
      update()
      window.addEventListener("online", update)
      window.addEventListener("offline", update)
      return () => {
        window.removeEventListener("online", update)
        window.removeEventListener("offline", update)
      }
    }
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

  const initials = (userName || "?")
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <header className="header">
      <div className="header-left">
        <div className="brand" title={locationName ? `${tenantName} · ${locationName}` : tenantName}>
          <div className="brand-icon" aria-hidden>T</div>
          <div className="brand-text">
            <span className="brand-tenant">{tenantName || "TakeasyGO"}</span>
            {locationName && (
              <span className="brand-location">
                <MapPin size={12} aria-hidden /> {locationName}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Centro: las vistas / filtros del contexto. Obs. UX 25/10: el título
          del contexto ya no se muestra (la navegación dice dónde estás y
          ocupaba lugar); queda solo para lectores de pantalla. */}
      <div className="header-center">
        <h1 className="sr-only">{contextTitle}</h1>
        {headerCenter}
      </div>

      <div className="header-right">
        {showSaasLink && (
          <button
            type="button"
            className="btn btn-ghost btn-sm header-saas-link"
            onClick={handleGoToSaas}
            disabled={ssoLoading}
            title="Abrir el panel del SaaS"
          >
            <ExternalLink size={16} aria-hidden />
            <span className="sr-only">{ssoLoading ? "Abriendo…" : "Ir al SaaS"}</span>
          </button>
        )}
        {/* Zoom de la interfaz (obs. 24/10): achica o agranda todo el POS. */}
        <div className="header-zoom" role="group" aria-label="Zoom de la interfaz">
          <button type="button" className="header-zoom-btn" onClick={uiZoom.zoomOut} disabled={!uiZoom.canZoomOut} aria-label="Achicar la interfaz" title="Achicar">
            <ZoomOut size={16} aria-hidden />
          </button>
          <button type="button" className="header-zoom-value" onClick={uiZoom.reset} title="Volver a 100 %" aria-label={`Zoom ${uiZoom.percent} %, volver a 100 %`}>
            {uiZoom.percent}%
          </button>
          <button type="button" className="header-zoom-btn" onClick={uiZoom.zoomIn} disabled={!uiZoom.canZoomIn} aria-label="Agrandar la interfaz" title="Agrandar">
            <ZoomIn size={16} aria-hidden />
          </button>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => window.location.reload()}
          aria-label="Refrescar POS"
          title="Refrescar POS"
        >
          <RefreshCw size={16} aria-hidden />
        </button>
        {!audioReady && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => { void unlockAudio() }}
            title="El navegador bloquea el sonido hasta que toques la pantalla"
          >
            <VolumeX size={16} aria-hidden /> <span className="sr-only">Activar sonido</span>
          </button>
        )}
        {sessionWarning && (
          <button
            type="button"
            className="btn btn-sm header-session-warning"
            onClick={() => { void logout() }}
            title="No se pudo renovar la sesión automáticamente"
          >
            <AlertTriangle size={16} aria-hidden /> <span className="header-btn-label">Sesión por vencer — reingresar</span>
          </button>
        )}
        <div className={`sync-status ${connected ? "" : "disconnected"}`} role="status">
          {connected ? <Cloud size={14} aria-hidden /> : <CloudOff size={14} aria-hidden />}
          <span className="sr-only">{connected ? "Online" : "Sin conexión"}</span>
        </div>
        <div className="header-clock-block">
          <div className="header-clock">
            {time.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
          </div>
          <div className="header-clock-day" title={versionLabel()}>
            v{CURRENT_BUILD.version.slice(0, 7)}
          </div>
        </div>
        <div className="header-user" title={`${userName || "Operador"} · ${roleLabel}`}>
          <div className="header-avatar" aria-hidden>{initials}</div>
          <div className="header-user-text">
            <span className="header-user-name">{userName || "Operador"}</span>
            <span className="header-user-role">{roleLabel}</span>
          </div>
        </div>
      </div>
    </header>
  )
}
