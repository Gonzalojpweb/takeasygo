import { useLayout } from "./LayoutContext"

export function ContextPanel() {
  const { contextPanel } = useLayout()

  if (!contextPanel) {
    return (
      <aside className="context-panel context-panel--empty">
        <div className="context-panel-empty-state">
          <div style={{ fontSize: '40px', marginBottom: '8px', opacity: 0.3 }}>🍽</div>
          <span className="context-panel-empty-text" style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>
            Seleccioná una mesa
          </span>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: '4px', textAlign: 'center', lineHeight: 1.5 }}>
            Tocá una mesa del mapa para ver su detalle y gestionar el pedido
          </span>
        </div>
      </aside>
    )
  }

  return (
    <aside className="context-panel">
      <div className="context-panel-header">
        <div>
          <div className="context-panel-title" style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--brand-orange)' }}>
            {contextPanel.title}
          </div>
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
