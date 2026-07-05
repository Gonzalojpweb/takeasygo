import { useState, useEffect, useMemo } from "react"
import type { Product, MenuCategory } from "@takeasygo/types"
import { useAuth } from "./useAuth"
import { fetchMenuSnapshot } from "../services/menu"

export function useMenu() {
  const { state } = useAuth()
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined
  const jwt = state.status === "authenticated" ? state.jwt?.accessToken : undefined

  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tenantId || !jwt) {
      setLoading(false)
      return
    }

    let cancelled = false

    async function load() {
      try {
        const snapshot = await fetchMenuSnapshot(tenantId!, jwt!)
        if (!cancelled) {
          setProducts(snapshot.products)
          setCategories(snapshot.categories)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error loading menu")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => { cancelled = true }
  }, [tenantId, jwt])

  const availableProducts = useMemo(
    () => products.filter((p) => p.isAvailable),
    [products]
  )

  const visibleCategories = useMemo(
    () => categories.filter((c) => c.isVisible).sort((a, b) => a.sortOrder - b.sortOrder),
    [categories]
  )

  const getProductsByCategory = (category: string) =>
    availableProducts.filter((p) => p.category === category)

  return {
    products: availableProducts,
    categories: visibleCategories,
    getProductsByCategory,
    loading,
    error,
  }
}
