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
    <nav className={`navigation${sidebarCollapsed ? ' collapsed' : ''}`}>
      {/* Toggle colapsar */}
      <div className="nav-toggle" onClick={toggleSidebar}>
        <span className="nav-item-icon">{sidebarCollapsed ? '»' : '☰'}</span>
        {!sidebarCollapsed && <span>Colapsar</span>}
      </div>

      {!sidebarCollapsed && <div className="nav-label">Contextos</div>}

      {/* Items de navegación */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: sidebarCollapsed ? '4px' : '2px', padding: sidebarCollapsed ? '0 6px' : undefined }}>
        {items.map((item) => {
          const Icon = item.icon
          const isActive = activeId === item.id
          return (
            <div
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelect(item.id)}
              style={sidebarCollapsed ? {
                flexDirection: 'column',
                justifyContent: 'center',
                gap: '2px',
                padding: '10px 0',
                margin: '0 2px',
                fontSize: '9px',
                minHeight: '60px',
                textAlign: 'center',
                borderRadius: isActive ? '12px' : '8px',
                background: isActive ? 'var(--brand-orange-light)' : undefined,
              } : undefined}
            >
              <div className="nav-item-icon" style={sidebarCollapsed ? { width: '28px', height: '28px' } : undefined}>
                <Icon size={sidebarCollapsed ? 22 : 20} className="nav-item-svg" />
              </div>
              <span>{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="nav-item-badge">{item.badge}</span>
              )}
            </div>
          )
        })}
      </div>

      <div className="nav-spacer" />

      <div className="nav-item" onClick={onLogout} style={sidebarCollapsed ? {
        flexDirection: 'column',
        justifyContent: 'center',
        gap: '2px',
        padding: '10px 0',
        margin: '0 2px',
        fontSize: '9px',
        minHeight: '60px',
        textAlign: 'center',
      } : undefined}>
        <div className="nav-item-icon">
          <LogOut size={sidebarCollapsed ? 22 : 20} className="nav-item-svg" />
        </div>
        <span>Salir</span>
      </div>
    </nav>
  )
}
