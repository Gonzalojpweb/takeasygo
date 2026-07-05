import { useState, useCallback } from "react"
import type { CustomerProfile } from "@takeasygo/types"
import { useAuth } from "./useAuth"
import { searchCustomers, toCustomerProfile } from "../services/customer"

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
        const customers = await searchCustomers(query, jwt)
        setResults(customers.map(toCustomerProfile))
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
