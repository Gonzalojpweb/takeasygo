import type { CartItem } from '@/types/cart'
import type { ICoOccurrencePair } from '@/models/MenuInsights'

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Devuelve ítems sugeridos para mostrar en el UpsellSheet.
 *
 * Tres capas en orden de prioridad:
 *  0. Manual (suggestWith): el admin configuró explícitamente qué sugerir
 *  1. Behavioral (co-ocurrencia real de órdenes): clientes que pidieron X también pidieron Y
 *  2. Fallback estático (price tiers + isFeatured): funciona desde el día 1 sin historial
 *
 * Siempre excluye ítems ya en el carrito y el ítem recién agregado.
 */
export function getSuggestions(
  categories: any[],
  cart: CartItem[],
  justAddedItemId: string | undefined,
  insights: ICoOccurrencePair[] | null,
  maxSuggestions = 2,
): any[] {
  const allItems: any[] = categories.flatMap((cat) =>
    cat.isAvailable ? cat.items.filter((i: any) => i.isAvailable) : [],
  )

  if (allItems.length < 2) return []

  const cartItemIds = new Set<string>([
    ...cart.map((i) => i.menuItemId).filter((id): id is string => !!id),
    ...(justAddedItemId ? [justAddedItemId] : []),
  ])

  const itemById = new Map<string, any>(allItems.map((i) => [String(i._id), i]))
  const candidates = allItems.filter((i: any) => !cartItemIds.has(String(i._id)))
  if (candidates.length === 0) return []

  const result: any[] = []
  const included = new Set<string>()

  function fill(items: any[]) {
    for (const item of items) {
      const id = String(item._id)
      if (included.has(id) || cartItemIds.has(id)) continue
      result.push(item)
      included.add(id)
      if (result.length >= maxSuggestions) return
    }
  }

  // ── Capa 0: Manual (suggestWith configurado por el admin) ────────────────
  const justAdded = justAddedItemId ? itemById.get(justAddedItemId) : null
  if (justAdded?.suggestWith?.length > 0) {
    const manualItems = (justAdded.suggestWith as string[])
      .map((id) => itemById.get(id))
      .filter((i): i is any => !!i && i.isAvailable)
    fill(manualItems)
  }

  if (result.length >= maxSuggestions) return result

  // ── Capa 1: Behavioral (co-ocurrencia real de órdenes) ──────────────────
  if (insights && insights.length > 0 && justAddedItemId) {
    const behavioralItems = insights
      .filter((p) => p.itemA === justAddedItemId || p.itemB === justAddedItemId)
      .sort((a, b) => b.count - a.count)
      .map((p) => {
        const partnerId = p.itemA === justAddedItemId ? p.itemB : p.itemA
        return itemById.get(partnerId)
      })
      .filter((i): i is any => !!i && i.isAvailable)
    fill(behavioralItems)
  }

  if (result.length >= maxSuggestions) return result

  // ── Capa 2: Fallback estático (price tiers + isFeatured) ────────────────
  const remainingCandidates = candidates.filter((i: any) => !included.has(String(i._id)))
  fill(getStaticSuggestions(remainingCandidates, allItems, maxSuggestions - result.length))

  return result
}

function getStaticSuggestions(candidates: any[], allItems: any[], max: number): any[] {
  const med = median(allItems.map((i: any) => i.price))
  const addonThreshold = med * 0.65

  const scored = candidates.map((item: any) => {
    let score = 0
    if (item.isFeatured) score += 3
    if (item.price <= addonThreshold) score += 2
    return { item, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, max).map((s) => s.item)
}
