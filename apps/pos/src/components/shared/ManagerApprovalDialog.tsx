import { useEffect, useRef, useState } from "react"
import { ShieldCheck } from "lucide-react"
import { answerApproval, subscribeApproval, type ApprovalPrompt } from "../../services/manager-approval"

/**
 * Teclado de PIN del encargado (Fase 1 de caja). Se monta una vez en la app y
 * aparece solo cuando una operación lo necesita (services/manager-approval).
 * El encargado tipea su PIN en el equipo del cajero; Enter aprueba, Esc cancela.
 */
export function ManagerApprovalDialog() {
  const [prompt, setPrompt] = useState<ApprovalPrompt | null>(null)
  const [pin, setPin] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => subscribeApproval((p) => {
    setPrompt(p)
    setPin("")
  }), [])

  useEffect(() => {
    if (prompt) inputRef.current?.focus()
  }, [prompt])

  if (!prompt) return null

  const valid = /^\d{4,8}$/.test(pin)
  const submit = () => {
    if (valid) answerApproval(pin)
  }

  return (
    <div
      className="customer-modal-overlay approval-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="approval-title"
      onKeyDown={(e) => {
        if (e.key === "Escape") answerApproval(null)
      }}
    >
      <div className="customer-modal approval-modal">
        <div className="approval-body">
          <ShieldCheck size={32} className="approval-icon" aria-hidden />
          <div id="approval-title" className="approval-title">Aprobación de encargado</div>
          <p className="approval-message">{prompt.message}</p>
          <input
            ref={inputRef}
            className="search-input approval-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            placeholder="PIN del encargado"
            aria-label="PIN del encargado"
            aria-invalid={Boolean(prompt.error)}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit()
            }}
          />
          {prompt.error && <p className="approval-error" role="alert">{prompt.error}</p>}
          <div className="approval-actions">
            <button type="button" className="btn btn-ghost" onClick={() => answerApproval(null)}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" disabled={!valid} onClick={submit}>
              Aprobar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
