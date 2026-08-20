import type { CartItem } from '@/types/cart'
import type { ICoOccurrencePair } from '@/models/MenuInsights'

export type UpsellSource = 'manual' | 'behavioral' | 'static' | 'special'

interface SpecialDateRule {
  name: string
  date: { month: number; day: number }
  triggerItems: string[]
  suggestedItems: string[]
}

const SPECIAL_DATES: SpecialDateRule[] = [
  {
    name: 'Día de la Papa Frita',
    date: { month: 8, day: 20 },
    triggerItems: ['hamburguesa', 'burger', 'bebida', 'drink', 'gaseosa', 'cerveza'],
    suggestedItems: ['papa', 'papas', 'frita', 'fritas', 'crew', 'clásica', 'sazonada'],
  },
]

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function isSpecialDate(): SpecialDateRule | null {
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()
  
  return SPECIAL_DATES.find(rule => rule.date.month === month && rule.date.day === day) || null
}

function matchesKeywords(item: any, keywords: string[]): boolean {
  const name = item.name?.toLowerCase() || ''
  const tags = (item.tags || []).map((t: string) => t.toLowerCase())
  const combined = name + ' ' + tags.join(' ')
  return keywords.some(kw => combined.includes(kw.toLowerCase()))
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
 *
 * @returns `{ items, source }` — source indica de qué capa vinieron las sugerencias
 */
export function getSuggestions(
  categories: any[],
  cart: CartItem[],
  justAddedItemId: string | undefined,
  insights: ICoOccurrencePair[] | null,
  maxSuggestions = 2,
): { items: any[]; source: UpsellSource } {
  const allItems: any[] = categories.flatMap((cat) => {
    if (!cat.isAvailable) return []
    const directItems = cat.items.filter((i: any) => i.isAvailable && i.isTakeawayAvailable !== false)
    const subItems = (cat.subcategories ?? []).flatMap((sub: any) =>
      (sub.items ?? []).filter((i: any) => i.isAvailable && i.isTakeawayAvailable !== false)
    )
    return [...directItems, ...subItems]
  })

  if (allItems.length < 2) return { items: [], source: 'static' }

  const cartItemIds = new Set<string>([
    ...cart.map((i) => i.menuItemId).filter((id): id is string => !!id),
    ...(justAddedItemId ? [justAddedItemId] : []),
  ])

  const itemById = new Map<string, any>(allItems.map((i) => [String(i._id), i]))
  const candidates = allItems.filter((i: any) => !cartItemIds.has(String(i._id)))
  if (candidates.length === 0) return { items: [], source: 'static' }

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

  // ── Capa -1: Sobrescritura por fecha especial ────────────────────────────
  const specialDate = isSpecialDate()
  if (specialDate && justAddedItemId) {
    const justAddedItem = itemById.get(justAddedItemId)
    if (justAddedItem && matchesKeywords(justAddedItem, specialDate.triggerItems)) {
      const specialSuggestions = candidates
        .filter((i: any) => matchesKeywords(i, specialDate.suggestedItems))
        .slice(0, maxSuggestions)
      if (specialSuggestions.length > 0) {
        return { items: specialSuggestions, source: 'special' }
      }
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

  if (result.length >= maxSuggestions) return { items: result, source: 'manual' }

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

  if (result.length >= maxSuggestions) return { items: result, source: 'behavioral' }

  // ── Capa 2: Fallback estático (price tiers + isFeatured) ────────────────
  const remainingCandidates = candidates.filter((i: any) => !included.has(String(i._id)))
  fill(getStaticSuggestions(remainingCandidates, allItems, maxSuggestions - result.length))

  return { items: result, source: 'static' }
}

/**
 * Static fallback scoring — prioritizes low-ticket complementary items
 * (drinks, sides, desserts) over main dishes.
 *
 * Scoring is ACCUMULATIVE (multiple conditions can stack):
 *   +5  price ≤ median * 0.4   (very cheap add-ons: drinks, sauces, small sides)
 *   +3  isFeatured && price ≤ median * 0.65  (featured + affordable)
 *   +2  isFeatured             (featured but pricier)
 *   +1  categoryType is drink/side/dessert   (complementary category)
 */
function getStaticSuggestions(candidates: any[], allItems: any[], max: number): any[] {
  const med = median(allItems.map((i: any) => i.price))
  const cheapThreshold = med * 0.4
  const addonThreshold = med * 0.65
  const complementaryTypes = new Set(['drink', 'side', 'dessert'])

  const scored = candidates.map((item: any) => {
    let score = 0

    // Price tier: very cheap add-ons get highest boost
    if (item.price <= cheapThreshold) score += 5

    // Featured + affordable sweet spot
    if (item.isFeatured && item.price <= addonThreshold) score += 3

    // Featured but pricier (main dishes)
    if (item.isFeatured) score += 2

    // Complementary category type (uses categoryType field if available,
    // falls back to heuristic price check for items without categoryType)
    if (item.categoryType && complementaryTypes.has(item.categoryType)) {
      score += 1
    } else if (!item.categoryType && item.price <= addonThreshold) {
      // Heuristic fallback: cheap items without categoryType are likely complementary
      score += 1
    }

    return { item, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, max).map((s) => s.item)
}
