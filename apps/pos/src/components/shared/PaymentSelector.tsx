import type { PaymentMethod } from "@takeasygo/types"
import { isPaymentMethodAvailable, formatPaymentMethod } from "../../services/payment"
import { formatCurrency } from "../../utils/format"

interface PaymentSelectorProps {
  total: number
  onSelect: (method: PaymentMethod) => void
}

const ALL_METHODS: PaymentMethod[] = ["cash", "posnet", "mercadopago"]

export function PaymentSelector({ total, onSelect }: PaymentSelectorProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <div className="text-muted text-sm">Total a pagar</div>
        <div style={{ fontSize: 32, fontWeight: 700, color: "var(--primary-action)" }}>
          {formatCurrency(total)}
        </div>
      </div>

      <div className="payment-methods">
        {ALL_METHODS.map((method) => {
          const info = formatPaymentMethod(method)
          const available = isPaymentMethodAvailable(method)

          return (
            <button
              key={method}
              className={`payment-method ${!available ? "feature-disabled" : ""}`}
              onClick={() => available && onSelect(method)}
              disabled={!available}
            >
              <span className="payment-method-icon">{info.icon}</span>
              <span className="payment-method-name">{info.name}</span>
              <span className="payment-method-desc">{info.description}</span>
              {!available && (
                <span className="feature-disabled-tooltip">Próximamente</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
