import type { PaymentMethod } from "@takeasygo/types"
import { isPaymentMethodAvailable, formatPaymentMethod } from "../../services/payment"

const ALL_METHODS: PaymentMethod[] = [
  "cash",
  "debit",
  "credit",
  "pix",
  "usdt",
  "mixed",
]

interface PaymentMethodGridProps {
  onSelect: (method: PaymentMethod) => void
}

export function PaymentMethodGrid({ onSelect }: PaymentMethodGridProps) {
  return (
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
            {!available && (
              <span className="feature-disabled-tooltip">Próximamente</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
