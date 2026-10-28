import { Inbox, ChevronUp } from "lucide-react"
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
  const { contextPanel, panelOpen, setPanelOpen } = useLayout()

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
    <aside
      className={`context-panel${panelOpen ? " is-open" : ""}`}
      aria-label={`Contexto activo: ${contextPanel.title}`}
    >
      {/* En celular el encabezado es el asa de la hoja inferior: siempre
          visible (la entidad no desaparece) y despliega el detalle. En
          desktop el botón es inerte visualmente (CSS) y el panel está abierto. */}
      <button
        type="button"
        className="context-panel-header"
        onClick={() => setPanelOpen(!panelOpen)}
        aria-expanded={panelOpen}
      >
        <div>
          <h2 className="context-panel-title">{contextPanel.title}</h2>
          {contextPanel.subtitle && (
            <div className="context-panel-subtitle">{contextPanel.subtitle}</div>
          )}
        </div>
        <ChevronUp size={20} className="context-panel-chevron" aria-hidden />
      </button>
      <div className="context-panel-body">{contextPanel.body}</div>
      {contextPanel.footer && (
        <div className="context-panel-footer">{contextPanel.footer}</div>
      )}
    </aside>
  )
}
