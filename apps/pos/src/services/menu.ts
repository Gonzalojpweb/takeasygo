import type { Product, MenuCategory } from "@takeasygo/types"
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
  jwt: string
): Promise<MenuSnapshot> {
  return posApi<MenuSnapshot>(tenantId, "/menu", { accessToken: jwt })
}
