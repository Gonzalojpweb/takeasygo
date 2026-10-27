import type { Product, MenuCategory } from "@takeasygo/types"
import { db } from "../db/dexie"
import { posApi } from "./pos-api"

// ============================================================================
// menu — snapshot aplanado del catálogo
// ============================================================================
// M5: dejó de pegarle a `GET /api/v1/menu/snapshot` de Sync Layer y pasa por
// `GET /api/[tenant]/pos/menu`, servido por el SaaS con la MISMA regla de
// aplanado (@takeasygo/business/menu-flatten). Sin esto el POS y el SaaS
// podían ver catálogos distintos para el mismo tenant.
//
// La caché la escribe `useMenu` DESPUÉS de esta llamada: si falla, no se
// toca Dexie y el POS sigue con lo último conocido.
// ============================================================================

export interface MenuSnapshot {
  version: number
  tenantId: string
  products: Product[]
  categories: MenuCategory[]
  createdAt: string
  signature: string
  /** Presente en la respuesta del SaaS; opcional para no romper lectores viejos. */
  serverTime?: string
}

export async function fetchMenuSnapshot(
  tenantId: string,
  jwt?: string
): Promise<MenuSnapshot> {
  return posApi<MenuSnapshot>(tenantId, "/menu", jwt ? { accessToken: jwt } : {})
}

/**
 * Trae el snapshot y lo escribe en Dexie SOLO si cambió la `signature`
 * (Auditoría §2.4: el menú no estaba en el polling y un cambio de precio en
 * el admin no llegaba al POS hasta recargar). Un put idéntico dispararía
 * useLiveQuery y re-renderizaría la grilla de productos cada vez.
 *
 * @returns true si reescribió la caché.
 */
export async function syncMenu(tenantId: string, jwt?: string): Promise<boolean> {
  const snapshot = await fetchMenuSnapshot(tenantId, jwt)
  const cached = await db.menuSnapshot.get(tenantId)
  if (cached?.signature && cached.signature === snapshot.signature) return false

  await db.menuSnapshot.put({
    tenantId,
    products: snapshot.products,
    categories: snapshot.categories,
    version: snapshot.version,
    signature: snapshot.signature,
    updatedAt: new Date(),
  })
  return true
}
