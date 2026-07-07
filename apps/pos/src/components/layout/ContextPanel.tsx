import { useLayout } from "./LayoutContext"

export function ContextPanel() {
  const { contextPanel } = useLayout()

  if (!contextPanel) {
    return (
      <aside className="context-panel context-panel--empty">
        <div className="context-panel-empty-state">
          <span className="context-panel-empty-icon">📋</span>
          <span className="context-panel-empty-text">
            Seleccioná una mesa o contexto
          </span>
        </div>
      </aside>
    )
  }

  return (
    <aside className="context-panel">
      <div className="context-panel-header">
        <div>
          <div className="context-panel-title">{contextPanel.title}</div>
          {contextPanel.subtitle && (
            <div className="context-panel-subtitle">{contextPanel.subtitle}</div>
          )}
        </div>
      </div>
      <div className="context-panel-body">{contextPanel.body}</div>
      {contextPanel.footer && (
        <div className="context-panel-footer">{contextPanel.footer}</div>
      )}
    </aside>
  )
}
