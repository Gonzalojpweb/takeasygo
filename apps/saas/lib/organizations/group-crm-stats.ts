/**
 * lib/organizations/group-crm-stats.ts — CRM del grupo (F7 nivel 1), cálculos
 * puros (sin DB).
 *
 * Entrada: un registro por cliente (agrupado por phoneHash en el servidor) con
 * lo que compró en cada marca. Salida: cuántos compran en 1, 2 o más marcas,
 * cruce marca × marca, números por marca y el segmento filtrado
 * («fue a A pero no a B»). El phoneHash nunca sale de acá hacia la pantalla.
 */

export interface BrandPurchase {
  tenantId: string
  orders: number
  spent: number
  lastOrderAt: Date | null
}

export interface GroupCustomer {
  key: string
  consumerId: string | null
  brands: BrandPurchase[]
}

export interface CrmFilter {
  /** Marcas (tenantId) donde TIENE que haber comprado. */
  went: string[]
  /** Marcas donde NO tiene que haber comprado. */
  notWent: string[]
  /** Mínimo de marcas distintas (1 = todos). */
  minBrands: number
  /** Última compra (en cualquier marca) dentro de estos días; null = sin límite. */
  activeDays: number | null
}

export const EMPTY_FILTER: CrmFilter = { went: [], notWent: [], minBrands: 1, activeDays: null }

export interface BrandStats {
  tenantId: string
  customers: number
  /** Solo compran en esta marca. */
  exclusive: number
  /** También compran en otra marca del grupo. */
  shared: number
  sharedPct: number
}

export interface CrmStats {
  customers: number
  /** Clientes por cantidad de marcas: [1 marca, 2 marcas, 3 o más]. */
  byBrandCount: [number, number, number]
  multiBrandPct: number
  /** Gasto y pedidos promedio: los de una marca contra los de varias. */
  single: { avgSpent: number; avgOrders: number }
  multi: { avgSpent: number; avgOrders: number }
  brands: BrandStats[]
  /** overlap[i][j] = clientes que compraron en la marca i y en la j (i ≠ j). */
  overlap: number[][]
  segment: { count: number; spent: number; orders: number }
}

const round1 = (n: number) => Math.round(n * 10) / 10
const DAY = 86_400_000

export function lastOrderOf(c: GroupCustomer): Date | null {
  let last: Date | null = null
  for (const b of c.brands) if (b.lastOrderAt && (!last || b.lastOrderAt > last)) last = b.lastOrderAt
  return last
}

export function totalsOf(c: GroupCustomer): { orders: number; spent: number } {
  return c.brands.reduce((s, b) => ({ orders: s.orders + b.orders, spent: s.spent + b.spent }), { orders: 0, spent: 0 })
}

export function matchesFilter(c: GroupCustomer, f: CrmFilter, now: Date = new Date()): boolean {
  const ids = new Set(c.brands.map((b) => b.tenantId))
  if (ids.size < f.minBrands) return false
  if (f.went.some((t) => !ids.has(t))) return false
  if (f.notWent.some((t) => ids.has(t))) return false
  if (f.activeDays !== null) {
    const last = lastOrderOf(c)
    if (!last || now.getTime() - last.getTime() > f.activeDays * DAY) return false
  }
  return true
}

/** Une compras repetidas de la misma marca (no debería pasar, pero por las dudas). */
export function normalizeCustomer(c: GroupCustomer): GroupCustomer {
  const map = new Map<string, BrandPurchase>()
  for (const b of c.brands) {
    const cur = map.get(b.tenantId)
    if (!cur) map.set(b.tenantId, { ...b })
    else {
      cur.orders += b.orders
      cur.spent += b.spent
      if (b.lastOrderAt && (!cur.lastOrderAt || b.lastOrderAt > cur.lastOrderAt)) cur.lastOrderAt = b.lastOrderAt
    }
  }
  return { ...c, brands: [...map.values()] }
}

export function computeCrmStats(customers: GroupCustomer[], brandIds: string[], filter: CrmFilter = EMPTY_FILTER, now: Date = new Date()): CrmStats {
  const idx = new Map(brandIds.map((id, i) => [id, i]))
  const overlap = brandIds.map(() => brandIds.map(() => 0))
  const perBrand = brandIds.map((tenantId) => ({ tenantId, customers: 0, exclusive: 0, shared: 0 }))
  const byBrandCount: [number, number, number] = [0, 0, 0]
  const single = { n: 0, spent: 0, orders: 0 }
  const multi = { n: 0, spent: 0, orders: 0 }
  const segment = { count: 0, spent: 0, orders: 0 }
  let total = 0

  for (const raw of customers) {
    const c = normalizeCustomer(raw)
    const mine = c.brands.filter((b) => idx.has(b.tenantId) && b.orders > 0)
    if (mine.length === 0) continue
    total++
    const n = mine.length
    byBrandCount[Math.min(n, 3) - 1]++
    const t = mine.reduce((s, b) => ({ orders: s.orders + b.orders, spent: s.spent + b.spent }), { orders: 0, spent: 0 })
    const bucket = n === 1 ? single : multi
    bucket.n++
    bucket.spent += t.spent
    bucket.orders += t.orders
    for (const b of mine) {
      const i = idx.get(b.tenantId)!
      perBrand[i].customers++
      if (n === 1) perBrand[i].exclusive++
      else perBrand[i].shared++
      for (const o of mine) if (o.tenantId !== b.tenantId) overlap[i][idx.get(o.tenantId)!]++
    }
    if (matchesFilter({ ...c, brands: mine }, filter, now)) {
      segment.count++
      segment.spent += t.spent
      segment.orders += t.orders
    }
  }

  return {
    customers: total,
    byBrandCount,
    multiBrandPct: total ? round1(((byBrandCount[1] + byBrandCount[2]) / total) * 100) : 0,
    single: { avgSpent: single.n ? Math.round(single.spent / single.n) : 0, avgOrders: single.n ? round1(single.orders / single.n) : 0 },
    multi: { avgSpent: multi.n ? Math.round(multi.spent / multi.n) : 0, avgOrders: multi.n ? round1(multi.orders / multi.n) : 0 },
    brands: perBrand.map((b) => ({ ...b, sharedPct: b.customers ? round1((b.shared / b.customers) * 100) : 0 })),
    overlap,
    segment,
  }
}

/** Últimos 4 dígitos del teléfono, el resto tapado. Nunca el número completo. */
export function maskPhone(phone: string | null | undefined): string | null {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (digits.length < 4) return null
  return `•••• ${digits.slice(-4)}`
}
