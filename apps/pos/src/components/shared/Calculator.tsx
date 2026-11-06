import { useEffect, useRef, useState } from "react"
import { Calculator as CalcIcon, X, Delete } from "lucide-react"
import { evaluate, formatCalc } from "../../utils/calc"

// ============================================================================
// Calculadora de apoyo rápido (piloto 06/11/2026)
// ============================================================================
// Botón fijo en el encabezado (caja, encargado, admin). Abre un panel
// flotante que no tapa el cobro: se puede seguir operando con él abierto.
// Teclado: números, + - * / %, Enter = resultado, Backspace, Esc cierra.
// ============================================================================

const KEYS: { label: string; value: string; kind?: "op" | "eq" | "clear" | "back" }[] = [
  { label: "C", value: "C", kind: "clear" },
  { label: "%", value: "%", kind: "op" },
  { label: "⌫", value: "back", kind: "back" },
  { label: "÷", value: "÷", kind: "op" },
  { label: "7", value: "7" }, { label: "8", value: "8" }, { label: "9", value: "9" }, { label: "×", value: "×", kind: "op" },
  { label: "4", value: "4" }, { label: "5", value: "5" }, { label: "6", value: "6" }, { label: "−", value: "−", kind: "op" },
  { label: "1", value: "1" }, { label: "2", value: "2" }, { label: "3", value: "3" }, { label: "+", value: "+", kind: "op" },
  { label: "00", value: "00" }, { label: "0", value: "0" }, { label: ",", value: "," }, { label: "=", value: "=", kind: "eq" },
]

export function CalculatorButton() {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`btn btn-ghost btn-sm header-calc-btn${open ? " is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Calculadora"
        title="Calculadora"
      >
        <CalcIcon size={18} aria-hidden />
        <span className="header-btn-label">Calculadora</span>
      </button>
      {open && <CalculatorPanel onClose={() => { setOpen(false); buttonRef.current?.focus() }} />}
    </>
  )
}

function CalculatorPanel({ onClose }: { onClose: () => void }) {
  const [expr, setExpr] = useState("")
  const [last, setLast] = useState<{ expr: string; result: number } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const preview = evaluate(expr)

  const press = (value: string) => {
    if (value === "C") { setExpr(""); setLast(null); return }
    if (value === "back") { setExpr((e) => e.slice(0, -1)); return }
    if (value === "=") {
      const r = evaluate(expr)
      if (r === null) return
      setLast({ expr, result: r })
      setExpr(String(r).replace(".", ","))
      return
    }
    setExpr((e) => (e + value).slice(0, 80))
  }

  useEffect(() => {
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      // No robar las teclas de un campo en el que se está escribiendo.
      const target = e.target as HTMLElement | null
      const typing = target && target !== panelRef.current && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      if (e.key === "Escape") { onClose(); return }
      if (typing) return
      if (/^[0-9]$/.test(e.key)) press(e.key)
      else if (e.key === "," || e.key === ".") press(",")
      else if (e.key === "+") press("+")
      else if (e.key === "-") press("−")
      else if (e.key === "*" || e.key === "x") press("×")
      else if (e.key === "/") { e.preventDefault(); press("÷") }
      else if (e.key === "%") press("%")
      else if (e.key === "Enter" || e.key === "=") { e.preventDefault(); press("=") }
      else if (e.key === "Backspace") press("back")
      else if (e.key === "Delete") press("C")
      else return
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expr])

  return (
    <div ref={panelRef} className="calc-panel" role="dialog" aria-label="Calculadora" tabIndex={-1}>
      <div className="calc-head">
        <strong>Calculadora</strong>
        <button type="button" className="calc-close" onClick={onClose} aria-label="Cerrar calculadora"><X size={18} aria-hidden /></button>
      </div>
      <div className="calc-display">
        <div className="calc-expr" aria-label="Cuenta">{last && expr === String(last.result).replace(".", ",") ? `${last.expr} =` : expr || "0"}</div>
        <div className="calc-result" aria-live="polite">{preview !== null ? formatCalc(preview) : "—"}</div>
      </div>
      <div className="calc-keys">
        {KEYS.map((k) => (
          <button
            key={k.label}
            type="button"
            className={`calc-key${k.kind ? ` calc-key--${k.kind}` : ""}`}
            onClick={() => press(k.value)}
            aria-label={k.kind === "back" ? "Borrar" : k.kind === "clear" ? "Borrar todo" : k.label}
          >
            {k.kind === "back" ? <Delete size={18} aria-hidden /> : k.label}
          </button>
        ))}
      </div>
    </div>
  )
}
