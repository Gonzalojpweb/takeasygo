import { useState, useEffect, useCallback } from "react"
import { useAuth } from "./useAuth"
import {
  fetchDeliveryPersons,
  fetchAvailableDeliveryOrders,
  completeDelivery,
} from "../services/delivery"
import type { DeliveryPerson, DeliveryOrder } from "../services/delivery"

export function useDelivery() {
  const { state } = useAuth()
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined
  const jwt = state.status === "authenticated" ? state.jwt?.accessToken : undefined

  const [persons, setPersons] = useState<DeliveryPerson[]>([])
  const [orders, setOrders] = useState<DeliveryOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!tenantId || !jwt) return

    setLoading(true)
    try {
      const [p, o] = await Promise.all([
        fetchDeliveryPersons(tenantId, jwt),
        fetchAvailableDeliveryOrders(tenantId, jwt),
      ])
      setPersons(p)
      setOrders(o)
      setError(null)
    } catch (err) {
      console.warn("[useDelivery] endpoint no disponible, modo degradado:", err)
      setPersons([])
      setOrders([])
      setError("No disponible por el momento")
    } finally {
      setLoading(false)
    }
  }, [tenantId, jwt])

  useEffect(() => {
    load()
  }, [load])

  const complete = useCallback(
    async (orderId: string, confirmationCode: string) => {
      if (!jwt) throw new Error("Not authenticated")
      await completeDelivery(orderId, confirmationCode, jwt)
      await load()
    },
    [jwt, load]
  )

  return { persons, orders, loading, error, complete, refresh: load }
}
