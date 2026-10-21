import { useState, useCallback } from "react"
import type { PaymentMethod } from "@takeasygo/types"
import { useAuth } from "./useAuth"
import { registerCounterSale } from "../services/counter-sale"

export function usePayments() {
  const { state } = useAuth()
  const jwt = state.status === "authenticated" ? state.jwt?.accessToken : undefined
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Deja el rastro de UNA parte del cobro en caja (cualquier método: el
   * arqueo de efectivo lo filtra el server con cashExpectedDelta). El cobro
   * en sí ya quedó registrado en la orden (services/order.recordPayments);
   * esto es bookkeeping y nunca corta la venta: sin caja o sin red, el
   * movimiento va a la cola de pendientes.
   */
  const processPayment = useCallback(
    async (
      orderId: string,
      amount: number,
      description: string,
      method: PaymentMethod,
      relatedOrderId?: string
    ) => {
      if (!jwt || !tenantId) throw new Error("Not authenticated")

      setLoading(true)
      setError(null)

      try {
        try {
          await registerCounterSale({
            tenantId,
            amount,
            paymentMethod: method,
            reason: description,
            relatedOrderId: relatedOrderId ?? orderId,
          })
        } catch (err) {
          console.error("[payments] registerCounterSale failed:", err)
        }

        return { method, status: "completed" as const }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Payment failed"
        setError(message)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [jwt, tenantId]
  )

  return { processPayment, loading, error }
}
