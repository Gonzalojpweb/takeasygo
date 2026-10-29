import type { ComponentType } from "react"

// ============================================================================
// Centro de acciones del contexto (observación 24/10)
// ============================================================================
// El Context Panel (lado opuesto al menú) agrupa TODAS las acciones del
// contexto abierto — hoy la mesa; mañana pedido, reserva, cliente… — como
// botones con ícono y color según el TIPO de acción. La barra inferior queda
// solo con la acción principal.
//
// Registro de acciones: cada contexto arma su lista de `ContextAction` (qué
// ícono, qué color, si se ve, qué hace). Sumar una acción nueva = agregar una
// entrada; no hay que rediseñar la pantalla.
//
// Tonos (significado, Visual Language System §13 — nunca solo color: cada
// botón lleva ícono + texto):
//   teal   = servicio / avanzar (agregar, sentar)
//   orange = cobro
//   amber  = cuenta / impresión (pedir cuenta, precuenta, reabrir)
//   green  = beneficio (descuento)
//   blue   = mover (cambiar / unir)
//   violet = agenda (reservar)
//   gray   = datos (comensales, soltar)
//   red    = salida / pérdida (liberar, no vino)
// ============================================================================

export type ActionTone = "teal" | "orange" | "amber" | "green" | "blue" | "violet" | "gray" | "red"

export interface ContextAction {
  id: string
  label: string
  icon: ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>
  tone: ActionTone
  /** Texto corto debajo del label (estado, cantidad). */
  hint?: string
  disabled?: boolean
  onClick: () => void
}

export interface ContextActionGroup {
  title: string
  actions: ContextAction[]
}

export function ContextActionPanel({ groups }: { groups: ContextActionGroup[] }) {
  const visible = groups.filter((g) => g.actions.length > 0)
  return (
    <div className="ctx-actions">
      {visible.map((group) => (
        <section key={group.title} className="ctx-group" aria-label={group.title}>
          <div className="ctx-group-title">{group.title}</div>
          <div className="ctx-grid">
            {group.actions.map((a) => {
              const Icon = a.icon
              return (
                <button
                  key={a.id}
                  type="button"
                  className={`ctx-action ctx-action--${a.tone}`}
                  onClick={a.onClick}
                  disabled={a.disabled}
                >
                  <span className="ctx-action-icon"><Icon size={16} aria-hidden /></span>
                  <span className="ctx-action-text">
                    <span className="ctx-action-label">{a.label}</span>
                    {a.hint && <span className="ctx-action-hint">{a.hint}</span>}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
