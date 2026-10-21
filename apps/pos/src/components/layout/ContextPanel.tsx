import { Inbox } from "lucide-react"
import { useLayout } from "./LayoutContext"

// ============================================================================
// Context Panel — "¿Sobre qué estoy trabajando?" (W0S §5)
// ============================================================================
// Nunca desaparece. Sin entidad activa muestra el estado vacío DEL CONTEXTO
// actual (lo define components/layout/contexts.ts): antes decía "Seleccioná
// una mesa" también en Caja, Ventas y Flota.
// ============================================================================

interface ContextPanelProps {
  empty: { title: string; hint: string }
}

export function ContextPanel({ empty }: ContextPanelProps) {
  const { contextPanel } = useLayout()

  if (!contextPanel) {
    return (
      <aside className="context-panel context-panel--empty" aria-label="Contexto activo">
        <div className="context-panel-empty-state">
          <span className="context-panel-empty-icon" aria-hidden>
            <Inbox size={32} />
          </span>
          <span className="context-panel-empty-text">{empty.title}</span>
          <span className="context-panel-empty-hint">{empty.hint}</span>
        </div>
      </aside>
    )
  }

  return (
    <aside className="context-panel" aria-label={`Contexto activo: ${contextPanel.title}`}>
      <div className="context-panel-header">
        <div>
          <h2 className="context-panel-title">{contextPanel.title}</h2>
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
