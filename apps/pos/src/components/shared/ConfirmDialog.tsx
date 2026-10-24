import { useEffect, useRef } from "react"

// Confirmación simple (Fase C): una pregunta, dos botones. Enter confirma,
// Esc cancela. Para decisiones que mueven cuentas (unir mesas).
interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ title, message, confirmLabel, busy, onConfirm, onCancel }: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { confirmRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) { e.preventDefault(); onCancel() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [busy, onCancel])

  return (
    <div className="customer-modal-overlay approval-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="customer-modal approval-modal">
        <div className="approval-body">
          <div id="confirm-title" className="approval-title">{title}</div>
          <p className="approval-message">{message}</p>
          <div className="void-actions">
            <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
            <button ref={confirmRef} type="button" className="btn btn-primary" onClick={onConfirm} disabled={busy}>
              {busy ? "Procesando…" : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
