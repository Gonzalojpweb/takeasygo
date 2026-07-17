import { useLayout } from "./LayoutContext"

interface NavigationItem {
  id: string
  icon: string
  label: string
  badge?: number
}

interface NavigationProps {
  items: NavigationItem[]
  activeId: string
  onSelect: (id: string) => void
  onLogout: () => void
  onQuickAccess?: () => void
}

export function Navigation({ items, activeId, onSelect, onLogout, onQuickAccess }: NavigationProps) {
  const { sidebarCollapsed, toggleSidebar } = useLayout()

  return (
    <nav className={`navigation${sidebarCollapsed ? " collapsed" : ""}`}>
      <div className="nav-toggle" onClick={toggleSidebar}>
        <span className="nav-item-icon">{sidebarCollapsed ? "»" : "☰"}</span>
        {!sidebarCollapsed && <span>Colapsar</span>}
      </div>

      <div className="nav-label">Contextos</div>

      {items.map((item) => (
        <div
          key={item.id}
          className={`nav-item ${activeId === item.id ? "active" : ""}`}
          onClick={() => onSelect(item.id)}
        >
          <div className="nav-item-icon">{item.icon}</div>
          {!sidebarCollapsed && <span>{item.label}</span>}
          {!sidebarCollapsed && item.badge !== undefined && item.badge > 0 && (
            <span className="nav-item-badge">{item.badge}</span>
          )}
        </div>
      ))}

      <div className="nav-spacer" />

      {onQuickAccess && (
        <div className="nav-item" onClick={onQuickAccess}>
          <div className="nav-item-icon">⚡</div>
          {!sidebarCollapsed && <span>Accesos</span>}
        </div>
      )}

      <div className="nav-item" onClick={onLogout}>
        <div className="nav-item-icon">🚪</div>
        {!sidebarCollapsed && <span>Salir</span>}
      </div>
    </nav>
  )
}
