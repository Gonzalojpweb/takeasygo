import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import Menu from '@/models/Menu'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody, requireFields } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'

// ============================================================================
// PATCH /api/[tenant]/pos/menu/items/[itemId] — pausar / reanudar desde el POS
// ============================================================================
// Fase J (decisión 24/10): caja, encargado y admin pausan o reanudan un
// artículo con un toque; el mozo no (capacidad orders.pay). Body:
// { available: boolean }. Pausa = motivo «manual» (nunca la levanta el
// inventario); reanudar limpia también una pausa automática por stock. El
// SaaS lo ve al instante (es el mismo menú) y el POS lo muestra como
// «Faltante». Auditado.
// ============================================================================

type ItemDoc = { _id: unknown; name: string; isAvailable?: boolean; pausedReason?: string | null; pausedAt?: Date | null; pausedBy?: string | null }

export const PATCH = posRoute('orders.pay', async (ctx, { itemId }) => {
  if (typeof itemId !== 'string' || !mongoose.isValidObjectId(itemId)) throw PosError.notFound('Artículo no encontrado')
  const body = await readPosBody(ctx.request)
  requireFields(body, ['available'])
  if (typeof body.available !== 'boolean') throw PosError.validation('available debe ser booleano')
  const available = body.available

  const menus = await Menu.find({ tenantId: ctx.tenantId, locationId: ctx.locationId, isActive: true })
  let found: ItemDoc | null = null
  let owner: (typeof menus)[number] | null = null
  for (const menu of menus) {
    for (const cat of (menu.categories ?? []) as unknown as { items?: ItemDoc[]; subcategories?: { items?: ItemDoc[] }[] }[]) {
      const pool = [...(cat.items ?? []), ...(cat.subcategories ?? []).flatMap((s) => s.items ?? [])]
      const hit = pool.find((i) => String(i._id) === itemId)
      if (hit) { found = hit; owner = menu; break }
    }
    if (found) break
  }
  if (!found || !owner) throw PosError.notFound('Artículo no encontrado en la carta de esta sede')

  const wasAvailable = found.isAvailable !== false
  found.isAvailable = available
  if (!available && wasAvailable) {
    found.pausedReason = 'manual'
    found.pausedAt = new Date()
    found.pausedBy = ctx.user.id
  } else if (available) {
    found.pausedReason = null
    found.pausedAt = null
    found.pausedBy = null
  }
  owner.markModified('categories')
  await owner.save()

  await logAudit({
    tenantId: ctx.tenantId,
    action: available ? 'pos.menu.item.resume' : 'pos.menu.item.pause',
    entity: 'MenuItem',
    entityId: itemId,
    details: { name: found.name, locationId: ctx.locationId },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })

  return NextResponse.json({ itemId, available, pausedReason: found.pausedReason ?? null })
})
