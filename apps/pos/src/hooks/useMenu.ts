import { useState, useEffect, useMemo } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import type { Product, MenuCategory } from "@takeasygo/types"
import { useAuth } from "./useAuth"
import { syncMenu } from "../services/menu"
import { db } from "../db/dexie"

// ============================================================================
// useMenu — lee el menú de Dexie (useLiveQuery) y lo refresca contra el SaaS
// ============================================================================
// La caché la mantienen dos caminos que escriben con la misma regla
// (services/menu.syncMenu, solo si cambió la signature):
//   · este hook, al montar (primera carga de la terminal)
//   · services/polling.ts, periódicamente (precios/productos nuevos en turno)
// Como el estado sale de useLiveQuery, cualquiera de los dos actualiza la
// grilla sin recargar la página. Offline: se sigue mostrando lo último.
// ============================================================================

export function useMenu() {
  const { state } = useAuth()
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined
  const jwt = state.status === "authenticated" ? state.jwt?.accessToken : undefined

  const [fetched, setFetched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cached = useLiveQuery(
    () => (tenantId ? db.menuSnapshot.get(tenantId) : undefined),
    [tenantId]
  )

  useEffect(() => {
    if (!tenantId || !jwt) return
    let cancelled = false

    syncMenu(tenantId, jwt)
      .then(() => {
        if (!cancelled) setError(null)
      })
      .catch(async (err) => {
        if (cancelled) return
        // Con caché se sigue operando en silencio; sin caché es un error real.
        const existing = await db.menuSnapshot.get(tenantId).catch(() => undefined)
        if (!existing) setError(err instanceof Error ? err.message : "Error loading menu")
      })
      .finally(() => {
        if (!cancelled) setFetched(true)
      })

    return () => {
      cancelled = true
    }
  }, [tenantId, jwt])

  const products = useMemo(() => (cached?.products ?? []) as Product[], [cached])
  const categories = useMemo(() => (cached?.categories ?? []) as MenuCategory[], [cached])

  // Fase J (decisión 24/10): un artículo pausado u oculto NO desaparece del
  // POS: se muestra como «Faltante» / «Sin inventario» en el mismo selector
  // (no se puede agregar). Así el mozo y la caja saben que no hay.
  const availableProducts = products

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
    loading: !cached && !fetched && Boolean(tenantId && jwt),
    error,
  }
}
