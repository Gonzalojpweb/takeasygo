import type { Product, MenuCategory } from "@takeasygo/types"

const SYNC_URL = import.meta.env.VITE_SYNC_URL;

export interface MenuSnapshot {
  version: number
  tenantId: string
  products: Product[]
  categories: MenuCategory[]
  createdAt: string
  signature: string
}

export async function fetchMenuSnapshot(
  _tenantId: string,
  jwt: string
): Promise<MenuSnapshot> {
  const res = await fetch(`${SYNC_URL}/api/v1/menu/snapshot`, {
    headers: { Authorization: `Bearer ${jwt}` },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Network error" }))
    throw new Error(err.error ?? `Menu fetch failed (${res.status})`)
  }

  return res.json()
}
