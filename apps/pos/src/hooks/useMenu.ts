import { useState, useEffect, useMemo } from "react"
import type { Product, MenuCategory } from "@takeasygo/types"
import { useAuth } from "./useAuth"
import { fetchMenuSnapshot } from "../services/menu"
import { db } from "../db/dexie"

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
      // 1. Load from Dexie cache first (instant, works offline)
      try {
        const cached = await db.menuSnapshot.get(tenantId!)
        if (!cancelled && cached) {
          setProducts(cached.products as Product[])
          setCategories(cached.categories as MenuCategory[])
          setLoading(false)
        }
      } catch {
        // Dexie read failed, continue to network
      }

      // 2. Fetch from network and update cache
      try {
        const snapshot = await fetchMenuSnapshot(tenantId!, jwt!)
        if (!cancelled) {
          setProducts(snapshot.products)
          setCategories(snapshot.categories)
          setError(null)
          // Update Dexie cache
          await db.menuSnapshot.put({
            tenantId: tenantId!,
            products: snapshot.products,
            categories: snapshot.categories,
            version: snapshot.version,
            updatedAt: new Date(),
          })
        }
      } catch (err) {
        if (!cancelled) {
          // If we have no cached data, show error
          const cached = await db.menuSnapshot.get(tenantId!).catch(() => null)
          if (!cached) {
            setError(err instanceof Error ? err.message : "Error loading menu")
          }
          // If we have cached data, silently use it (no error shown)
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
