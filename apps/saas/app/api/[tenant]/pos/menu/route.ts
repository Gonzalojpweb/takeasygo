import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import Menu from '@/models/Menu'
import { flattenMenuSnapshot, type RawMenu } from '@takeasygo/business'
import { posRoute } from '@/lib/pos-online/route'

// ============================================================================
// GET /api/[tenant]/pos/menu — snapshot aplanado para el POS
// ============================================================================
// Mismo contrato que `GET /api/v1/menu/snapshot` de apps/sync, pero servido
// directo por el SaaS: el POS sale del camino de datos de Sync Layer.
//
// El aplanado NO está duplicado: vive en @takeasygo/business/menu-flatten y
// apps/sync importa esa misma función. Una regla de negocio, dos lectores.
//
// `signature` (sha256 del contenido) es lo que el POS compara en M5 antes de
// reescribir Dexie; `version` es un número cómodo para el humano y para
// `Order.menuVersion`.
// ============================================================================

export const GET = posRoute(async (ctx) => {
  const menus = (await Menu.find({
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
    isActive: true,
  })
    .lean()
    .exec()) as unknown as Array<RawMenu & { updatedAt?: Date | string }>

  const flat = flattenMenuSnapshot(menus)

  const signature = createHash('sha256')
    .update(JSON.stringify({ p: flat.products, c: flat.categories }))
    .digest('hex')

  let lastEdit = 0
  for (const menu of menus) {
    const t = new Date(menu.updatedAt ?? 0).getTime()
    if (Number.isFinite(t) && t > lastEdit) lastEdit = t
  }

  return NextResponse.json({
    // Segundos desde la última edición del menú. 1 si todavía no hay menú:
    // así un catálogo recién creado no arranca en "época".
    version: lastEdit > 0 ? Math.floor(lastEdit / 1000) : 1,
    tenantId: ctx.tenantId,
    products: flat.products,
    categories: flat.categories,
    createdAt: new Date().toISOString(),
    signature,
    serverTime: new Date().toISOString(),
  })
})
