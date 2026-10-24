import { useMemo, useState } from "react"
import { formatCurrency } from "../../utils/format"

// ============================================================================
// Dividir la cuenta por platos (Fase D, 2026-10)
// ============================================================================
// Cada plato se abre en UNIDADES (3× empanada = 3 unidades) con su importe
// repartido al centavo, así la suma de todas las unidades es exactamente el
// total. El operador elige la persona activa y toca las unidades que paga;
// al aplicar, cada persona es una parte del cobro (el método se elige
// después, como siempre). Una unidad sin asignar bloquea «Aplicar»: la
// cuenta nunca queda corta.
// ============================================================================

export interface SplitLine {
  key: string
  name: string
  quantity: number
  /** Importe neto de la línea en centavos (ya con descuento). */
  total: number
}

export interface SplitUnit {
  id: string
  name: string
  amount: number
}

/** Abre cada línea en unidades; los centavos sobrantes van a las primeras. */
export function expandUnits(lines: SplitLine[]): SplitUnit[] {
  const units: SplitUnit[] = []
  for (const line of lines) {
    const qty = Math.max(1, line.quantity)
    const base = Math.floor(line.total / qty)
    let rest = line.total - base * qty
    for (let i = 0; i < qty; i++) {
      const extra = rest > 0 ? 1 : 0
      rest -= extra
      units.push({ id: `${line.key}#${i}`, name: line.name, amount: base + extra })
    }
  }
  return units
}

/** Total por persona (índice) según la asignación unidad → persona. */
export function totalsByPerson(units: SplitUnit[], assignment: Record<string, number>, people: number): number[] {
  const totals = Array.from({ length: people }, () => 0)
  for (const u of units) {
    const p = assignment[u.id]
    if (p !== undefined && p < people) totals[p] += u.amount
  }
  return totals
}

interface SplitByItemsProps {
  lines: SplitLine[]
  initialPeople: number
  onApply: (amounts: number[]) => void
  onCancel: () => void
}

export function SplitByItems({ lines, initialPeople, onApply, onCancel }: SplitByItemsProps) {
  const units = useMemo(() => expandUnits(lines), [lines])
  const [people, setPeople] = useState(Math.max(2, initialPeople))
  const [active, setActive] = useState(0)
  const [assignment, setAssignment] = useState<Record<string, number>>({})

  const totals = totalsByPerson(units, assignment, people)
  const unassigned = units.filter((u) => assignment[u.id] === undefined || assignment[u.id] >= people)
  const unassignedTotal = unassigned.reduce((s, u) => s + u.amount, 0)

  const toggle = (id: string) => {
    setAssignment((prev) => {
      const next = { ...prev }
      if (next[id] === active) delete next[id]
      else next[id] = active
      return next
    })
  }

  const assignRest = () => {
    setAssignment((prev) => {
      const next = { ...prev }
      for (const u of unassigned) next[u.id] = active
      return next
    })
  }

  return (
    <div className="split-items">
      <div className="split-people" role="tablist" aria-label="Persona que paga">
        {totals.map((t, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={active === i}
            className={`split-person${active === i ? " active" : ""}`}
            onClick={() => setActive(i)}
          >
            <span>Persona {i + 1}</span>
            <strong>{formatCurrency(t)}</strong>
          </button>
        ))}
        <button type="button" className="split-person split-person--add" onClick={() => { setPeople((n) => Math.min(20, n + 1)); setActive(people) }} aria-label="Agregar persona">
          +
        </button>
      </div>

      <div className="split-units" role="group" aria-label={`Platos — tocá los que paga la persona ${active + 1}`}>
        {units.map((u) => {
          const owner = assignment[u.id]
          const mine = owner === active
          return (
            <button
              key={u.id}
              type="button"
              aria-pressed={mine}
              className={`split-unit${mine ? " mine" : owner !== undefined && owner < people ? " taken" : ""}`}
              onClick={() => toggle(u.id)}
            >
              <span className="split-unit-name">{u.name}</span>
              <span className="split-unit-foot">
                <span>{formatCurrency(u.amount)}</span>
                {owner !== undefined && owner < people && <span className="split-unit-owner">P{owner + 1}</span>}
              </span>
            </button>
          )
        })}
      </div>

      <div className="split-footer">
        <span className={unassignedTotal > 0 ? "text-error" : "text-success"} aria-live="polite">
          {unassignedTotal > 0 ? `Sin asignar: ${formatCurrency(unassignedTotal)} (${unassigned.length})` : "Todo asignado"}
        </span>
        {unassignedTotal > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={assignRest}>
            El resto a Persona {active + 1}
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={unassignedTotal > 0}
          onClick={() => onApply(totals.filter((t) => t > 0))}
        >
          Aplicar división
        </button>
      </div>
    </div>
  )
}
