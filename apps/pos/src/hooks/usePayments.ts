import { useState, useCallback } from "react"
import type { PaymentMethod } from "@takeasygo/types"
import { useAuth } from "./useAuth"
import { resolvePaymentMethod } from "../services/payment"

export function usePayments() {
  const { state } = useAuth()
  const jwt = state.status === "authenticated" ? state.jwt?.accessToken : undefined
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const processPayment = useCallback(
    async (
      _orderId: string,
      _amount: number,
      _description: string,
      method: PaymentMethod
    ) => {
      if (!jwt) throw new Error("Not authenticated")

      setLoading(true)
      setError(null)

      try {
        const resolved = resolvePaymentMethod(method)

        if (resolved === "terminal") {
          // Terminal de cobro (MP Point, POSNET, etc.)
          // El POS interactúa con el terminal físico
          return { method: resolved, status: "pending_terminal" }
        }

        // Efectivo — completado inmediatamente
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
