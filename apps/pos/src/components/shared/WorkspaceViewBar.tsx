import type { ComponentType } from "react"

interface ViewDefinition {
  id: string
  label: string
  icon: ComponentType<{ size?: number; className?: string }> | string
}

interface WorkspaceViewBarProps {
  views: ViewDefinition[]
  activeView: string
  onChange: (viewId: string) => void
}

export function WorkspaceViewBar({ views, activeView, onChange }: WorkspaceViewBarProps) {
  return (
    <div className="workspace-views">
      {views.map((view) => {
        const Icon = view.icon
        const isComponent = typeof Icon !== "string"
        return (
          <button
            key={view.id}
            className={`view-tab${activeView === view.id ? " active" : ""}`}
            onClick={() => onChange(view.id)}
          >
            {isComponent ? <Icon size={18} className="nav-item-svg" /> : Icon}
            {" "}
            {view.label}
          </button>
        )
      })}
    </div>
  )
}
