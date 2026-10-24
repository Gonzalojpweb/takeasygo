import { useEffect, useState } from "react"
import { CreditCard } from "lucide-react"
import { subscribePointWait, type PointWaitState } from "../../services/mp-point"
import { formatCurrency } from "../../utils/format"

/** Aviso mientras el posnet MercadoPago Point cobra (Fase 6). */
export function PointWaitingDialog() {
  const [state, setState] = useState<PointWaitState | null>(null)
  useEffect(() => subscribePointWait(setState), [])
  if (!state) return null
  return (
    <div className="customer-modal-overlay approval-overlay" role="dialog" aria-modal="true" aria-labelledby="point-title">
      <div className="customer-modal approval-modal">
        <div className="approval-body">
          <CreditCard size={32} className="approval-icon" aria-hidden />
          <div id="point-title" className="approval-title">Cobrando en el posnet</div>
          <div className="cash-amount" style={{ minHeight: 0 }}>{formatCurrency(state.amountCents)}</div>
          <p className="approval-message" role="status">{state.detail}</p>
          <span className="spinner" aria-hidden />
          <button type="button" className="btn btn-ghost" style={{ minHeight: 48, width: "100%" }} onClick={state.cancel}>
            Cancelar cobro
          </button>
        </div>
      </div>
    </div>
  )
}
