import type { ComponentType } from "react"

interface ViewDefinition {
  id: string
  label: string
  icon: ComponentType<{ size?: number; className?: string }> | string
  /** Trabajo pendiente en la vista (p. ej. reservas nuevas). 0/ausente = sin badge. */
  badge?: number
}

interface WorkspaceViewBarProps {
  views: ViewDefinition[]
  activeView: string
  onChange: (viewId: string) => void
}

export function WorkspaceViewBar({ views, activeView, onChange }: WorkspaceViewBarProps) {
  return (
    <nav className="workspace-views" aria-label="Vistas">
      {views.map((view) => {
        const Icon = view.icon
        const isComponent = typeof Icon !== "string"
        return (
          <button
            key={view.id}
            type="button"
            className={`view-tab${activeView === view.id ? " active" : ""}`}
            aria-current={activeView === view.id ? "page" : undefined}
            aria-label={view.badge ? `${view.label}, ${view.badge} nuevas` : view.label}
            title={view.label}
            onClick={() => onChange(view.id)}
          >
            {isComponent ? <Icon size={18} className="nav-item-svg" aria-hidden /> : Icon}
            <span className="view-tab-label">{view.label}</span>
            {view.badge ? <span className="view-tab-badge" aria-hidden>{view.badge}</span> : null}
          </button>
        )
      })}
    </nav>
  )
}
