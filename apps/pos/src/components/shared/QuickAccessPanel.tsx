import { useState, useCallback, type MouseEvent } from "react"
import { useAuth } from "../../hooks/useAuth"
import { requestSsoToken } from "../../services/sso"

interface SsoLink {
  id: string
  label: string
  icon: string
  route: string
  roles: string[]
}

const SSO_LINKS: SsoLink[] = [
  { id: "analytics", label: "Analytics", icon: "📊", route: "/analytics", roles: ["admin", "manager"] },
  { id: "ico",       label: "ICO",       icon: "🎯", route: "/ico",       roles: ["admin", "manager"] },
  { id: "tia",       label: "TIA",       icon: "🤖", route: "/tia",       roles: ["admin", "manager"] },
  { id: "cis",       label: "CIS",       icon: "🏢", route: "/cis",       roles: ["admin", "manager"] },
]

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split(".")[1]
    const json = atob(base64.replace(/-/g, "+").replace(/_/g, "/"))
    return JSON.parse(json)
  } catch {
    return null
  }
}

function showToast(message: string, type: "error" | "success" = "error") {
  const existing = document.getElementById("sso-toast")
  if (existing) existing.remove()

  const toast = document.createElement("div")
  toast.id = "sso-toast"
  toast.textContent = message
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%)",
    padding: "12px 24px",
    borderRadius: "16px",
    backgroundColor: type === "error" ? "#C94C4C" : "#4D8B55",
    color: "#fff",
    fontFamily: "var(--font-family)",
    fontSize: "14px",
    zIndex: "9999",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
  })
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 4000)
}

interface QuickAccessPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function QuickAccessPanel({ isOpen, onClose }: QuickAccessPanelProps) {
  const { state } = useAuth()
  const [loading, setLoading] = useState<string | null>(null)

  const posRole = (() => {
    if (state.status !== "authenticated" || !state.jwt?.accessToken) return null
    const payload = decodeJwtPayload(state.jwt.accessToken)
    return (payload?.role as string) ?? null
  })()

  const filteredLinks = SSO_LINKS.filter((link) =>
    posRole ? link.roles.includes(posRole) : false
  )

  const handleSsoClick = useCallback(
    async (e: MouseEvent, link: SsoLink) => {
      e.preventDefault()
      if (state.status !== "authenticated" || !state.jwt?.accessToken) {
        showToast("Sesión no disponible")
        return
      }

      setLoading(link.id)
      try {
        const saasUrl = import.meta.env.VITE_SAAS_URL ?? "http://localhost:3000"
        const newTab = window.open("", "_blank")
        if (!newTab) {
          showToast("Popup bloqueado — permití ventanas emergentes")
          setLoading(null)
          return
        }

        const { ssoToken, jti } = await requestSsoToken(state.jwt.accessToken)
        newTab.location.href = `${saasUrl}/api/auth/sso?token=${ssoToken}&jti=${jti}&callbackUrl=${encodeURIComponent(link.route)}`
        onClose()
      } catch (err) {
        console.error("[QuickAccess] SSO failed:", err)
        showToast("Error generando acceso SSO")
      } finally {
        setLoading(null)
      }
    },
    [state.status, state.jwt, onClose]
  )

  if (!isOpen || filteredLinks.length === 0) return null

  return (
    <div className="quick-access-panel">
      <div className="quick-access-header">
        <span>Accesos Rápidos</span>
        <button className="quick-access-close" onClick={onClose}>×</button>
      </div>
      <div className="quick-access-links">
        {filteredLinks.map((link) => (
          <button
            key={link.id}
            className="quick-access-link"
            disabled={loading !== null}
            onClick={(e) => handleSsoClick(e, link)}
          >
            <span className="quick-access-icon">{link.icon}</span>
            <span className="quick-access-label">{link.label}</span>
            {loading === link.id && <span className="spinner small" />}
          </button>
        ))}
      </div>
      {posRole && (
        <div className="quick-access-footer">
          Rol POS: {posRole}
        </div>
      )}
    </div>
  )
}
