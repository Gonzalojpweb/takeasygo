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
 * Prioridad:
 *  1. Behavioral (co-ocurrencia real de órdenes) — si hay insights disponibles
 *  2. Fallback estático (price tiers + isFeatured) — funciona desde el día 1
 *
 * Siempre excluye ítems ya en el carrito y el ítem recién agregado.
 */
export function getSuggestions(
  categories: any[],
  cart: CartItem[],
  justAddedItemId: string,
  insights: ICoOccurrencePair[] | null,
  maxSuggestions = 2,
): any[] {
  const allItems: any[] = categories.flatMap((cat) =>
    cat.isAvailable ? cat.items.filter((i: any) => i.isAvailable) : [],
  )

  if (allItems.length < 2) return []

  const cartItemIds = new Set([
    ...cart.map((i) => i.menuItemId),
    justAddedItemId,
  ])

  const itemById = new Map<string, any>(allItems.map((i) => [String(i._id), i]))
  const candidates = allItems.filter((i: any) => !cartItemIds.has(String(i._id)))
  if (candidates.length === 0) return []

  // ── Capa 1: Behavioral — co-ocurrencia real ───────────────────────────────
  if (insights && insights.length > 0) {
    const behavioralSuggestions: any[] = []

    // Buscar pares que involucren al ítem recién agregado
    const relevantPairs = insights
      .filter((p) => p.itemA === justAddedItemId || p.itemB === justAddedItemId)
      .sort((a, b) => b.count - a.count)

    for (const pair of relevantPairs) {
      const partnerId = pair.itemA === justAddedItemId ? pair.itemB : pair.itemA
      if (cartItemIds.has(partnerId)) continue
      const item = itemById.get(partnerId)
      if (!item) continue // ítem eliminado del menú — ignorar
      behavioralSuggestions.push(item)
      if (behavioralSuggestions.length >= maxSuggestions) break
    }

    // Si el behavioral ya llenó el cupo, listo
    if (behavioralSuggestions.length >= maxSuggestions) return behavioralSuggestions

    // Si faltan slots, completar con fallback estático
    const alreadyIncluded = new Set(behavioralSuggestions.map((i) => String(i._id)))
    const remaining = maxSuggestions - behavioralSuggestions.length
    const staticFill = getStaticSuggestions(
      candidates.filter((i: any) => !alreadyIncluded.has(String(i._id))),
      allItems,
      remaining,
    )

    return [...behavioralSuggestions, ...staticFill]
  }

  // ── Capa 2: Fallback estático — price tiers + isFeatured ─────────────────
  return getStaticSuggestions(candidates, allItems, maxSuggestions)
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
