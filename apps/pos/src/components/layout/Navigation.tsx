import { useEffect, useRef, useState, type ReactNode } from "react"
import { LogOut, MapPin, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react"
import { useLayout } from "./LayoutContext"
import type { RosContext } from "./contexts"
import { MOBILE_SHORTCUTS, TABLET_SHORTCUTS, splitNav } from "./navShortcuts"
import { useMediaQuery } from "../../hooks/useMediaQuery"

// ============================================================================
// Navigation — cambia de CONTEXTO, nunca ejecuta acciones (W0S §3)
// ============================================================================
// · Botones reales (teclado + lector de pantalla); antes eran <div onClick>.
// · Solo íconos Lucide: una sola familia (Foundation Standards cap. 7).
// · El badge muestra trabajo pendiente del contexto (reconocimiento > memoria).
// · Obs. UX 30/10: en celular (barra inferior) y tablet (columna) no entran
//   los 10 contextos. Quedan los más usados como atajos y «Más» abre un menú
//   lateral con TODOS, la marca, la sede y «Salir». Escritorio: sin cambios.
// ============================================================================

interface NavigationProps {
  /** Obs. UX 25/10: la marca vive arriba del sidebar (libera el header). */
  tenantName?: string
  locationName?: string | null
  items: readonly RosContext[]
  activeId: string
  badges?: Partial<Record<string, number>>
  /** Contextos con algo urgente (pedido de la App sin aceptar): el badge parpadea. */
  alerts?: Partial<Record<string, boolean>>
  onSelect: (id: string) => void
  onLogout: () => void
}

export function Navigation({ tenantName, locationName, items, activeId, badges = {}, alerts = {}, onSelect, onLogout }: NavigationProps) {
  const { sidebarCollapsed, toggleSidebar } = useLayout()
  const isMobile = useMediaQuery("(max-width: 768px)")
  const isTablet = useMediaQuery("(max-width: 1100px)") && !isMobile
  const compact = isMobile || isTablet
  const [drawerOpen, setDrawerOpen] = useState(false)
  const moreRef = useRef<HTMLButtonElement>(null)

  const { shortcuts, overflow } = compact
    ? splitNav(items, isMobile ? MOBILE_SHORTCUTS : TABLET_SHORTCUTS)
    : { shortcuts: [...items], overflow: [] as RosContext[] }
  const hasMore = overflow.length > 0
  const activeInMore = overflow.some((c) => c.id === activeId)
  const moreBadge = overflow.reduce((sum, c) => sum + (badges[c.id] ?? 0), 0)

  // Al volver a escritorio el menú no tiene sentido.
  useEffect(() => {
    if (!compact) setDrawerOpen(false)
  }, [compact])

  const closeDrawer = () => {
    setDrawerOpen(false)
    moreRef.current?.focus()
  }

  const renderItem = (item: RosContext, iconSize: number, extraClass = "") => {
    const Icon = item.icon
    const isActive = activeId === item.id
    const badge = badges[item.id] ?? 0
    return (
      <li key={item.id}>
        <button
          type="button"
          className={`nav-item${isActive ? " active" : ""}${extraClass}`}
          onClick={() => {
            onSelect(item.id)
            if (drawerOpen) setDrawerOpen(false)
          }}
          aria-current={isActive ? "page" : undefined}
          aria-label={badge > 0 ? `${item.label}, ${badge} pendientes` : item.label}
        >
          <span className="nav-item-icon">
            <Icon size={iconSize} className="nav-item-svg" aria-hidden />
          </span>
          <span className="nav-item-label">{item.label}</span>
          {badge > 0 && <span className={`nav-item-badge${alerts[item.id] ? " is-alert" : ""}`} aria-hidden>{badge}</span>}
        </button>
      </li>
    )
  }

  return (
    <>
      <nav
        className={`navigation${sidebarCollapsed ? " collapsed" : ""}${items.length <= 1 ? " navigation--single" : ""}${hasMore ? " navigation--has-more" : ""}`}
        aria-label="Contextos operativos"
      >
        {/* Marca + comercio + sede, a la altura del header (obs. UX 25/10). */}
        <div className="nav-brand" title={locationName ? `${tenantName || "TakeasyGO"} · ${locationName}` : tenantName || "TakeasyGO"}>
          <div className="brand-icon" aria-hidden>T</div>
          {!sidebarCollapsed && (
            <div className="nav-brand-text">
              <span className="nav-brand-tenant">{tenantName || "TakeasyGO"}</span>
              {locationName && <span className="nav-brand-location"><MapPin size={11} aria-hidden /> {locationName}</span>}
            </div>
          )}
        </div>

        <button
          type="button"
          className="nav-toggle"
          onClick={toggleSidebar}
          aria-expanded={!sidebarCollapsed}
          aria-label={sidebarCollapsed ? "Expandir navegación" : "Colapsar navegación"}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={20} aria-hidden /> : <PanelLeftClose size={20} aria-hidden />}
          {!sidebarCollapsed && <span>Colapsar</span>}
        </button>

        {!sidebarCollapsed && <div className="nav-label">Contextos</div>}

        <ul className="nav-list">
          {shortcuts.map((item) => renderItem(item, compact || sidebarCollapsed ? 22 : 20))}
          {hasMore && (
            <li>
              <button
                ref={moreRef}
                type="button"
                className={`nav-item nav-more${activeInMore ? " active" : ""}`}
                onClick={() => setDrawerOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={drawerOpen}
                aria-label={moreBadge > 0 ? `Más opciones, ${moreBadge} pendientes` : "Más opciones"}
              >
                <span className="nav-item-icon">
                  <Menu size={22} className="nav-item-svg" aria-hidden />
                </span>
                <span className="nav-item-label">Más</span>
                {moreBadge > 0 && <span className="nav-item-badge" aria-hidden>{moreBadge}</span>}
              </button>
            </li>
          )}
        </ul>

        <div className="nav-spacer" />

        {/* Con «Más», Salir vive en el menú lateral (libera la barra). */}
        {!hasMore && (
          <button type="button" className="nav-item nav-logout" onClick={onLogout}>
            <span className="nav-item-icon">
              <LogOut size={sidebarCollapsed ? 22 : 20} className="nav-item-svg" aria-hidden />
            </span>
            <span className="nav-item-label">Salir</span>
          </button>
        )}
      </nav>

      {drawerOpen && (
        <NavDrawer
          tenantName={tenantName}
          locationName={locationName}
          onClose={closeDrawer}
          onLogout={onLogout}
        >
          {items.map((item) => renderItem(item, 20, " nav-drawer-item"))}
        </NavDrawer>
      )}
    </>
  )
}

interface NavDrawerProps {
  tenantName?: string
  locationName?: string | null
  onClose: () => void
  onLogout: () => void
  children: ReactNode
}

/** Menú lateral (celular y tablet): todos los contextos, con nombre. */
function NavDrawer({ tenantName, locationName, onClose, onLogout, children }: NavDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const panel = panelRef.current
    panel?.querySelector<HTMLElement>(".nav-item.active, .nav-item")?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
        return
      }
      // Foco atrapado dentro del menú mientras está abierto.
      if (e.key !== "Tab" || !panel) return
      const focusable = [...panel.querySelectorAll<HTMLElement>("button")]
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div className="nav-drawer-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        className="nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Navegación"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="nav-drawer-head">
          <div className="brand-icon" aria-hidden>T</div>
          <div className="nav-brand-text">
            <span className="nav-brand-tenant">{tenantName || "TakeasyGO"}</span>
            {locationName && <span className="nav-brand-location"><MapPin size={11} aria-hidden /> {locationName}</span>}
          </div>
          <button type="button" className="nav-drawer-close" onClick={onClose} aria-label="Cerrar menú">
            <X size={20} aria-hidden />
          </button>
        </div>
        <div className="nav-label">Contextos</div>
        <ul className="nav-drawer-list">{children}</ul>
        <div className="nav-drawer-foot">
          <button type="button" className="nav-item nav-drawer-item" onClick={onLogout}>
            <span className="nav-item-icon"><LogOut size={20} className="nav-item-svg" aria-hidden /></span>
            <span className="nav-item-label">Salir</span>
          </button>
        </div>
      </div>
    </div>
  )
}
