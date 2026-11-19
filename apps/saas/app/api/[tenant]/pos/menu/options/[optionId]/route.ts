import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody, requireFields } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { setOptionSoldOut } from '@/lib/menu/sold-out-options.server'
import { revalidateTenantPublicPages } from '@/lib/revalidate-tenant'

// ============================================================================
// PATCH /api/[tenant]/pos/menu/options/[optionId] — sabor agotado / repuesto
// ============================================================================
// «Disponibles hoy» desde el POS (definido 19/11): caja, encargado y admin
// (capacidad orders.pay, la misma de los faltantes de Fase J) marcan una
// opción como agotada o la reponen. Queda así hasta que alguien la repone.
// Body: { soldOut: boolean }. Mismo menú que el SaaS: el cliente lo ve en gris.
// ============================================================================

export const PATCH = posRoute('orders.pay', async (ctx, { optionId, tenant }) => {
  if (typeof optionId !== 'string' || !mongoose.isValidObjectId(optionId)) throw PosError.notFound('Opción no encontrada')
  const body = await readPosBody(ctx.request)
  requireFields(body, ['soldOut'])
  if (typeof body.soldOut !== 'boolean') throw PosError.validation('soldOut debe ser booleano')

  const target = await setOptionSoldOut(ctx.tenantId, ctx.locationId, optionId, body.soldOut)
  if (!target) throw PosError.notFound('Opción no encontrada en la carta de esta sede')

  if (typeof tenant === 'string') revalidateTenantPublicPages(tenant)
  await logAudit({
    tenantId: ctx.tenantId,
    action: body.soldOut ? 'pos.menu.option.sold_out' : 'pos.menu.option.restock',
    entity: 'MenuOption',
    entityId: optionId,
    details: { name: target.optionName, owner: target.owner, category: target.categoryName, item: target.itemName, locationId: ctx.locationId },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })

  return NextResponse.json({ optionId, soldOut: body.soldOut })
})
