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
  onSso?: () => void
}

export function Navigation({ items, activeId, onSelect, onLogout, onSso }: NavigationProps) {
  return (
    <nav className="navigation">
      <div className="nav-label">Contextos</div>

      {items.map((item) => (
        <div
          key={item.id}
          className={`nav-item ${activeId === item.id ? "active" : ""}`}
          onClick={() => onSelect(item.id)}
        >
          <div className="nav-item-icon">{item.icon}</div>
          <span>{item.label}</span>
          {item.badge !== undefined && item.badge > 0 && (
            <span className="nav-item-badge">{item.badge}</span>
          )}
        </div>
      ))}

      <div className="nav-spacer" />

      {onSso && (
        <div className="nav-item" onClick={onSso}>
          <div className="nav-item-icon">🔗</div>
          <span>Ir al SaaS</span>
        </div>
      )}

      <div className="nav-item" onClick={onLogout}>
        <div className="nav-item-icon">🚪</div>
        <span>Salir</span>
      </div>
    </nav>
  )
}
