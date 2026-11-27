// ¿El comercio usa el catálogo comercial? Consulta liviana con caché de 1 min,
// para que las ventas de los restaurantes no carguen nada de más.
import CatalogProduct from '@/models/CatalogProduct'

const cache = new Map<string, { has: boolean; at: number }>()

export async function tenantUsesCatalog(tenantId: unknown): Promise<boolean> {
  const key = String(tenantId)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 60_000) return hit.has
  const has = Boolean(await CatalogProduct.exists({ tenantId }))
  cache.set(key, { has, at: Date.now() })
  return has
}
