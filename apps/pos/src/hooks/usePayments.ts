import { useState, useCallback } from "react"
import type { PaymentMethod } from "@takeasygo/types"
import { useAuth } from "./useAuth"
import { createMercadoPagoPreference, resolvePaymentMethod } from "../services/payment"

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
      method: PaymentMethod
    ) => {
      if (!jwt) throw new Error("Not authenticated")

      setLoading(true)
      setError(null)

      try {
        const resolved = resolvePaymentMethod(method)

        if (resolved === "mercadopago") {
          const preference = await createMercadoPagoPreference(
            { orderId, amount, description, tenantId: tenantId ?? "" },
            jwt
          )
          window.open(preference.initPoint, "_blank")
          return { method: resolved, preferenceId: preference.preferenceId }
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
