interface ViewDefinition {
  id: string
  label: string
  icon: string
}

interface WorkspaceViewBarProps {
  views: ViewDefinition[]
  activeView: string
  onChange: (viewId: string) => void
}

export function WorkspaceViewBar({ views, activeView, onChange }: WorkspaceViewBarProps) {
  return (
    <div className="workspace-views">
      {views.map((view) => (
        <button
          key={view.id}
          className={`view-tab${activeView === view.id ? " active" : ""}`}
          onClick={() => onChange(view.id)}
        >
          {view.icon} {view.label}
        </button>
      ))}
    </div>
  )
}
