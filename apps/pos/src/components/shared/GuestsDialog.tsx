import { useEffect, useRef, useState } from "react"
import { Users } from "lucide-react"

// ============================================================================
// Comensales al abrir la mesa (Fase B, 2026-10)
// ============================================================================
// Un toque: 1–12 en grilla. Más de 12 → «Más de 12…» con − / + (tablet)
// o escribiendo el número.
// Teclado físico: los dígitos escriben, Enter confirma, Esc cancela.
// La capacidad de la mesa se marca como referencia, no limita (se juntan
// sillas todo el tiempo).
// ============================================================================

const QUICK = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const MAX_GUESTS = 99

interface GuestsDialogProps {
  tableNumber: number
  capacity: number
  /** Valor actual al corregir; ausente al abrir la mesa. */
  initial?: number
  busy?: boolean
  onConfirm: (guests: number) => void
  onCancel: () => void
}

export function GuestsDialog({ tableNumber, capacity, initial, busy, onConfirm, onCancel }: GuestsDialogProps) {
  const [typed, setTypedState] = useState(initial ? String(initial) : "")
  // ¿El operador escribió o usó − / +? Entonces Enter confirma ESO y no el
  // botón que tenga el foco (si no, Enter "clickea" el 1).
  const [touched, setTouched] = useState(false)
  const setTyped = (next: string | ((prev: string) => string)) => { setTouched(true); setTypedState(next) }
  const firstRef = useRef<HTMLButtonElement>(null)
  const editing = initial !== undefined

  useEffect(() => { firstRef.current?.focus() }, [])

  const value = Number(typed)
  const valid = Number.isInteger(value) && value >= 1 && value <= MAX_GUESTS

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy) return
      if (e.key === "Escape") { e.preventDefault(); onCancel(); return }
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault()
        setTyped((prev) => (prev.length >= 2 ? e.key : prev + e.key).replace(/^0+/, ""))
        return
      }
      if (e.key === "Backspace") { e.preventDefault(); setTyped((prev) => prev.slice(0, -1)); return }
      if (e.key === "Enter" && valid && (touched || document.activeElement?.tagName !== "BUTTON")) {
        e.preventDefault()
        onConfirm(value)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [busy, valid, value, touched, onConfirm, onCancel])

  return (
    <div className="customer-modal-overlay approval-overlay" role="dialog" aria-modal="true" aria-labelledby="guests-title">
      <div className="customer-modal approval-modal guests-modal">
        <div className="approval-body">
          <Users size={28} className="approval-icon" aria-hidden />
          <div id="guests-title" className="approval-title">
            {editing ? `Comensales — Mesa ${tableNumber}` : `Abrir mesa ${tableNumber}`}
          </div>
          <p className="approval-message">¿Cuántas personas? <span className="text-muted">(capacidad {capacity})</span></p>

          <div className="guests-grid" role="group" aria-label="Cantidad de comensales">
            {QUICK.map((n, i) => (
              <button
                key={n}
                ref={i === 0 ? firstRef : undefined}
                type="button"
                className={`guests-btn${value === n ? " active" : ""}${n === capacity ? " guests-btn--capacity" : ""}`}
                disabled={busy}
                onClick={() => onConfirm(n)}
                aria-label={`${n} ${n === 1 ? "comensal" : "comensales"}`}
              >
                {n}
              </button>
            ))}
          </div>

          <div className="guests-typed" aria-live="polite">
            {typed ? (
              <>
                <button type="button" className="btn btn-secondary guests-step" aria-label="Uno menos" disabled={busy || value <= 1}
                  onClick={() => setTyped(String(Math.max(1, value - 1)))}>−</button>
                <span className="guests-typed-value">{typed}</span>
                <button type="button" className="btn btn-secondary guests-step" aria-label="Uno más" disabled={busy || value >= MAX_GUESTS}
                  onClick={() => setTyped(String(Math.min(MAX_GUESTS, value + 1)))}>+</button>
                <button type="button" className="btn btn-primary" disabled={!valid || busy} onClick={() => onConfirm(value)}>
                  {editing ? "Guardar" : "Abrir"} con {typed}
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setTyped("13")}>
                Más de 12…
              </button>
            )}
          </div>

          <button type="button" className="btn btn-ghost" style={{ minHeight: 44, width: "100%" }} onClick={onCancel} disabled={busy}>
            Cancelar <kbd className="kbd">Esc</kbd>
          </button>
        </div>
      </div>
    </div>
  )
}
