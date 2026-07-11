import type { PaymentMethod } from "@takeasygo/types"
import { PaymentMethodGrid } from "./PaymentMethodGrid"
import { formatCurrency } from "../../utils/format"

interface PaymentSelectorProps {
  total: number
  onSelect: (method: PaymentMethod) => void
}

export function PaymentSelector({ total, onSelect }: PaymentSelectorProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <div className="text-muted text-sm">Total a pagar</div>
        <div style={{ fontSize: 32, fontWeight: 700, color: "var(--primary-action)" }}>
          {formatCurrency(total)}
        </div>
      </div>

      <PaymentMethodGrid onSelect={onSelect} />
    </div>
  )
}
