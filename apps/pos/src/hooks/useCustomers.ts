import { useState, useCallback } from "react"
import type { CustomerProfile } from "@takeasygo/types"
import { useAuth } from "./useAuth"
import { searchCustomers } from "../services/customers-api"

export function useCustomers() {
  const { state } = useAuth()
  const jwt = state.status === "authenticated" ? state.jwt?.accessToken : undefined

  const [results, setResults] = useState<CustomerProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const search = useCallback(
    async (query: string) => {
      if (!jwt || query.length < 2) {
        setResults([])
        return
      }

      setLoading(true)
      setError(null)

      try {
        const response = await searchCustomers(query, jwt)
        setResults(
          response.customers.map((customer) => ({
            id: customer.customerId,
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
            totalOrders: customer.totalOrders,
            totalSpent: customer.totalSpent,
            averageTicket:
              customer.totalOrders > 0
                ? Math.round(customer.totalSpent / customer.totalOrders)
                : 0,
            lastVisit: customer.lastOrderAt ? new Date(customer.lastOrderAt) : undefined,
            segment: customer.segment as CustomerProfile["segment"] | undefined,
          }))
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed")
        setResults([])
      } finally {
        setLoading(false)
      }
    },
    [jwt]
  )

  return { results, loading, error, search }
}
