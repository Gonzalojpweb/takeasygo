import type { ComponentType } from "react"
import { LogOut } from "lucide-react"
import { useLayout } from "./LayoutContext"

interface NavigationItem {
  id: string
  icon: ComponentType<{ size?: number; className?: string }>
  label: string
  badge?: number
}

interface NavigationProps {
  items: NavigationItem[]
  activeId: string
  onSelect: (id: string) => void
  onLogout: () => void
}

export function Navigation({ items, activeId, onSelect, onLogout }: NavigationProps) {
  const { sidebarCollapsed, toggleSidebar } = useLayout()

  return (
    <nav className={`navigation${sidebarCollapsed ? " collapsed" : ""}`}>
      <div className="nav-toggle" onClick={toggleSidebar}>
        <span className="nav-item-icon">{sidebarCollapsed ? "»" : "☰"}</span>
        {!sidebarCollapsed && <span>Colapsar</span>}
      </div>

      <div className="nav-label">Contextos</div>

      {items.map((item) => {
        const Icon = item.icon
        return (
          <div
            key={item.id}
            className={`nav-item ${activeId === item.id ? "active" : ""}`}
            onClick={() => onSelect(item.id)}
          >
            <div className="nav-item-icon">
              <Icon size={26} className="nav-item-svg" />
            </div>
            <span>{item.label}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <span className="nav-item-badge">{item.badge}</span>
            )}
          </div>
        )
      })}

      <div className="nav-spacer" />

      <div className="nav-item" onClick={onLogout}>
        <div className="nav-item-icon">
          <LogOut size={26} className="nav-item-svg" />
        </div>
        <span>Salir</span>
      </div>
    </nav>
  )
}
