import type { ReactNode } from "react"
import { Inbox, ChevronUp } from "lucide-react"
import { useLayout, type ActionBarContent } from "./LayoutContext"

// ============================================================================
// Context Panel — el detalle del contexto activo (columna derecha)
// ============================================================================
// Obs. UX 25/10: el footer (Action Bar) dejaba de existir. Le robaba alto al
// workspace, a la navegación y al detalle, y separaba las acciones de la
// entidad a la que pertenecen (el consumo de la mesa abajo de la navegación
// «no tiene sentido»). Ahora las acciones del contexto viven ACÁ, ancladas al
// pie del panel: total arriba, secundarias en grilla, principal a lo ancho.
// Las vistas siguen llamando setActionBar({ left, center, right }): el panel
// es quien las muestra.
//   left   → total / dato clave (p. ej. «Consumo $ 12.300»)
//   center → acciones secundarias (comensales, pedir cuenta, encargado…)
//   right  → acción principal (Tomar pedido, Cobrar, Abrir caja…)
// ============================================================================

interface ContextPanelProps {
  empty: { title: string; hint: string }
  /** Borde arrastrable para regular el ancho (PanelResizer). */
  resizer?: ReactNode
}

function ContextDock({ actions }: { actions: ActionBarContent }) {
  return (
    <div className="ctx-dock" role="group" aria-label="Acciones">
      {actions.left && <div className="ctx-dock-total">{actions.left}</div>}
      {actions.center && <div className="ctx-dock-secondary">{actions.center}</div>}
      {actions.right && <div className="ctx-dock-primary">{actions.right}</div>}
    </div>
  )
}

export function ContextPanel({ empty, resizer }: ContextPanelProps) {
  const { contextPanel, actionBar, panelOpen, setPanelOpen } = useLayout()
  const hasDock = Boolean(actionBar && (actionBar.left || actionBar.center || actionBar.right))

  if (!contextPanel) {
    return (
      <aside className={`context-panel context-panel--empty${hasDock ? " has-dock" : ""}`} aria-label="Contexto activo">
        {resizer}
        <div className="context-panel-empty-state">
          <span className="context-panel-empty-icon" aria-hidden>
            <Inbox size={32} />
          </span>
          <span className="context-panel-empty-text">{empty.title}</span>
          <span className="context-panel-empty-hint">{empty.hint}</span>
        </div>
        {hasDock && <ContextDock actions={actionBar!} />}
      </aside>
    )
  }

  return (
    <aside
      className={`context-panel${panelOpen ? " is-open" : ""}${hasDock ? " has-dock" : ""}`}
      aria-label={`Contexto activo: ${contextPanel.title}`}
    >
      {resizer}
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
      {hasDock && <ContextDock actions={actionBar!} />}
    </aside>
  )
}
