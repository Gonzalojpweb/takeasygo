import { useEffect, useState } from "react"
import type { PaymentMethod } from "@takeasygo/types"
import { formatCurrency } from "../../utils/format"
import { formatPaymentMethod, isExternalPaymentMethod } from "../../services/payment"

// ============================================================================
// PaymentProcessingOverlay (08/11/2026, observación del piloto)
// ============================================================================
// Mientras se registra un cobro, la mesa se vacía por detrás (el carrito y el
// total vuelven a cero) y solo quedaba el botón «Registrando cobro…». El cajero
// no sabía si el cobro había entrado. Ahora una capa cubre toda la pantalla
// con el importe y los medios, y bloquea los toques hasta que aparece la
// confirmación (o el error).
// ============================================================================

export interface ChargingSnapshot {
  /** Total cobrado (con propina), en centavos. */
  totalCents: number
  parts: { method: PaymentMethod; amount: number }[]
  /** Mesa o «Mostrador», para el subtítulo. */
  label?: string
}

const SLOW_AFTER_MS = 8000

export function PaymentProcessingOverlay({ snapshot }: { snapshot: ChargingSnapshot }) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    return () => clearTimeout(t)
  }, [])
  const external = snapshot.parts.some((p) => isExternalPaymentMethod(p.method))

  return (
    <div className="paying-overlay" role="alertdialog" aria-modal="true" aria-busy="true" aria-labelledby="paying-title" aria-describedby="paying-hint">
      <div className="paying-card">
        <div className="paying-spinner" aria-hidden />
        <div id="paying-title" className="paying-title">Procesando cobro…</div>
        {snapshot.label && <div className="paying-sub">{snapshot.label}</div>}
        <strong className="paying-amount">{formatCurrency(snapshot.totalCents)}</strong>
        {snapshot.parts.length > 0 && (
          <ul className="paying-parts" aria-label="Medios de pago">
            {snapshot.parts.map((p, i) => (
              <li key={`${p.method}-${i}`}>
                <span>{formatPaymentMethod(p.method).name}</span>
                <b>{formatCurrency(p.amount)}</b>
              </li>
            ))}
          </ul>
        )}
        <p id="paying-hint" className="paying-hint">
          {slow
            ? "Está tardando más de lo normal, pero sigue procesando. No cobres de nuevo."
            : external
              ? "Si usás el posnet, seguí sus indicaciones. No toques la pantalla."
              : "No toques la pantalla: en segundos aparece la confirmación."}
        </p>
      </div>
    </div>
  )
}
