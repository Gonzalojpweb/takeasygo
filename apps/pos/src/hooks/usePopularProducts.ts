import { useLiveQuery } from "dexie-react-hooks"
import { useMemo } from "react"
import { db } from "../db/dexie"

// ============================================================================
// Productos frecuentes (Fase B, 2026-10)
// ============================================================================
// Los más pedidos de las últimas órdenes que el POS tiene en caché local:
// la pestaña «Frecuentes» del selector resuelve la mayoría de las comandas
// sin buscar. Se calcula en el dispositivo (sin endpoint): con unas cientos
// de órdenes alcanza y se adapta solo al local y al turno.
// ============================================================================

const RECENT_ORDERS = 400
const TOP = 24

export function usePopularProducts(tenantId: string | undefined): string[] {
  const orders = useLiveQuery(
    () =>
      tenantId
        ? db.orders.orderBy("createdAt").reverse().filter((o) => o.tenantId === tenantId).limit(RECENT_ORDERS).toArray()
        : [],
    [tenantId]
  )
  return useMemo(() => {
    const counts = new Map<string, number>()
    for (const order of orders ?? []) {
      if (order.status === "cancelled") continue
      for (const item of order.items ?? []) {
        if (!item.productId) continue
        counts.set(item.productId, (counts.get(item.productId) ?? 0) + item.quantity)
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP)
      .map(([id]) => id)
  }, [orders])
}
