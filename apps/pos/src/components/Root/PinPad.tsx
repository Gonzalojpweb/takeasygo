import { useEffect } from "react"
import { Delete } from "lucide-react"

// ============================================================================
// Teclado de PIN del root (R1 / R6) — dedo y teclado físico
// ============================================================================
// · Puntos: tantos como dígitos (mínimo 6 a la vista; el servidor acepta 4–8).
// · Teclas ≥ 44 px (W0S), grandes en la terminal y cómodas en el celular.
// · Teclado físico: dígitos, Retroceso, Supr (limpiar), Enter (entrar).
//   No escucha si el foco está en un campo de texto (p. ej. el panel técnico).
// · `error` pinta los puntos en rojo y los sacude (PIN incorrecto).
// ============================================================================

export const PIN_MIN = 4
export const PIN_MAX = 8

export function pinSlots(length: number): number {
  return Math.min(PIN_MAX, Math.max(6, length))
}

interface PinPadProps {
  value: string
  onChange: (next: string) => void
  onSubmit: () => void
  disabled?: boolean
  error?: boolean
  hint: string
  /** Escucha el teclado físico (desactivar si hay otro PinPad o un diálogo). */
  listenKeyboard?: boolean
}

function isTextField(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  return tag === "TEXTAREA" || tag === "SELECT" || (tag === "INPUT" && !["button", "submit", "checkbox", "radio"].includes((el as HTMLInputElement).type))
}

export function PinPad({ value, onChange, onSubmit, disabled, error, hint, listenKeyboard = true }: PinPadProps) {
  useEffect(() => {
    if (!listenKeyboard) return
    const onKey = (e: KeyboardEvent) => {
      if (disabled || e.ctrlKey || e.metaKey || e.altKey || isTextField(document.activeElement)) return
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault()
        if (value.length < PIN_MAX) onChange(value + e.key)
      } else if (e.key === "Backspace") {
        e.preventDefault()
        onChange(value.slice(0, -1))
      } else if (e.key === "Delete") {
        e.preventDefault()
        onChange("")
      } else if (e.key === "Enter") {
        e.preventDefault()
        onSubmit()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [value, onChange, onSubmit, disabled, listenKeyboard])

  const press = (d: string) => { if (!disabled && value.length < PIN_MAX) onChange(value + d) }

  return (
    <div className="root-pin">
      <div className={`root-pin-dots${error ? " is-error" : ""}`} aria-label={`${value.length} dígitos ingresados`} role="img">
        {Array.from({ length: pinSlots(value.length) }, (_, i) => <i key={i} className={i < value.length ? "f" : ""} />)}
      </div>
      <div className="root-pin-hint" aria-live="polite">{hint}</div>
      <div className="root-keypad" role="group" aria-label="Teclado del PIN">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className="root-key" onClick={() => press(d)} disabled={disabled}>{d}</button>
        ))}
        <button type="button" className="root-key root-key--fn" onClick={() => onChange("")} disabled={disabled || !value}>Limpiar</button>
        <button type="button" className="root-key" onClick={() => press("0")} disabled={disabled}>0</button>
        <button type="button" className="root-key root-key--fn" onClick={() => onChange(value.slice(0, -1))} disabled={disabled || !value} aria-label="Borrar el último dígito">
          <Delete size={22} aria-hidden />
        </button>
      </div>
    </div>
  )
}
