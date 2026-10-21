import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { useLayout } from "./LayoutContext"
import type { RosContext } from "./contexts"

// ============================================================================
// Navigation — cambia de CONTEXTO, nunca ejecuta acciones (W0S §3)
// ============================================================================
// · Botones reales (teclado + lector de pantalla); antes eran <div onClick>.
// · Solo íconos Lucide: una sola familia (Foundation Standards cap. 7).
// · El badge muestra trabajo pendiente del contexto (reconocimiento > memoria).
// ============================================================================

interface NavigationProps {
  items: readonly RosContext[]
  activeId: string
  badges?: Partial<Record<string, number>>
  onSelect: (id: string) => void
  onLogout: () => void
}

export function Navigation({ items, activeId, badges = {}, onSelect, onLogout }: NavigationProps) {
  const { sidebarCollapsed, toggleSidebar } = useLayout()

  return (
    <nav className={`navigation${sidebarCollapsed ? " collapsed" : ""}`} aria-label="Contextos operativos">
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
        {items.map((item) => {
          const Icon = item.icon
          const isActive = activeId === item.id
          const badge = badges[item.id] ?? 0
          return (
            <li key={item.id}>
              <button
                type="button"
                className={`nav-item${isActive ? " active" : ""}`}
                onClick={() => onSelect(item.id)}
                aria-current={isActive ? "page" : undefined}
                aria-label={badge > 0 ? `${item.label}, ${badge} pendientes` : item.label}
              >
                <span className="nav-item-icon">
                  <Icon size={sidebarCollapsed ? 22 : 20} className="nav-item-svg" aria-hidden />
                </span>
                <span className="nav-item-label">{item.label}</span>
                {badge > 0 && <span className="nav-item-badge" aria-hidden>{badge}</span>}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="nav-spacer" />

      <button type="button" className="nav-item" onClick={onLogout}>
        <span className="nav-item-icon">
          <LogOut size={sidebarCollapsed ? 22 : 20} className="nav-item-svg" aria-hidden />
        </span>
        <span className="nav-item-label">Salir</span>
      </button>
    </nav>
  )
}
