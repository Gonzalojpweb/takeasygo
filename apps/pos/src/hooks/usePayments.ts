import { useState, useCallback } from "react"
import type { PaymentMethod } from "@takeasygo/types"
import { useAuth } from "./useAuth"
import { resolvePaymentMethod } from "../services/payment"
import { registerCounterSale } from "../services/counter-sale"

export function usePayments() {
  const { state } = useAuth()
  const jwt = state.status === "authenticated" ? state.jwt?.accessToken : undefined
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        const resolved = resolvePaymentMethod(method)

        if (resolved === "terminal") {
          // Terminal de cobro (MP Point, POSNET, etc.)
          // El POS interactúa con el terminal físico
          return { method: resolved, status: "pending_terminal" }
        }

        // Efectivo: el cajón recibió plata → dejar el rastro en caja (o en
        // la cola local si no hay caja / el server no responde). Nunca corta
        // el cobro: la venta ya sucedió, el bookkeeping va aparte.
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

        return { method: resolved, status: "completed" }
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
