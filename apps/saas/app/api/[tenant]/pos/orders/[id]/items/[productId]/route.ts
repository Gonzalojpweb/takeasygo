import { NextResponse } from 'next/server'
import Order from '@/models/Order'
import type { IOrderItemVoid } from '@/models/Order'
import { logAudit } from '@/lib/audit'
import type { OrderStatus } from '@takeasygo/types'
import { canEditOrderItems } from '@takeasygo/business'
import { posRoute, readPosBody, requireFields } from '@/lib/pos-online/route'
import { requireManagerApproval } from '@/lib/pos-online/approval'
import { resolvePosRole } from '@/lib/pos-online/permissions'
import {
  ITEM_VOID_REASONS,
  assertCanVoidSentItems,
  assertItemVoidReason,
  type ItemVoidReason,
} from '@/lib/pos-online/itemVoids'
import { planVoidWaste, recordVoidWasteSafe, syncOrderConsumptionSafe } from '@/lib/inventory/sales'
import { PosError } from '@/lib/pos-online/errors'
import { toPosOrder, recomputeOrderTotals, type SaasOrderItemDraft } from '@/lib/pos-online/orderMapper'
import { withQuantityKeepingDiscount } from '@/lib/pos-online/discounts'
import { assertNotPaid, findPosOrder, type PosOrderDoc } from '@/lib/pos-online/orderRepo'

// ============================================================================
// PATCH  /api/[tenant]/pos/orders/[id]/items/[productId] — cambia la cantidad
// DELETE /api/[tenant]/pos/orders/[id]/items/[productId] — quita el producto
// ============================================================================
// Identificación de la línea (Fase C, 2026-10):
//   · `lineId` (Order.items._id, viaja en el contrato POS) — PREFERIDO: dos
//     líneas del mismo producto con distinta nota u opciones son distintas.
//   · sin lineId: todas las líneas del producto (compatibilidad).
//   PATCH lo recibe en el body; DELETE en la query (?lineId=&reason=).
//
// Quitar o bajar DESPUÉS de mandar a cocina (`confirmed`):
//   · el mozo no puede (403); cajero con PIN de encargado; encargado/admin
//     directo.
//   · `reason` obligatorio (lib/pos-online/itemVoids): define si los
//     insumos vuelven al stock o van a merma.
//   · queda registrado en Order.itemVoids + auditoría.
// Antes de mandar a cocina (`pending`) se edita libre.
// ============================================================================

type Ctx = Parameters<Parameters<typeof posRoute>[1]>[0]

function matchesLine(item: SaasOrderItemDraft, productId: string, lineId: string | null): boolean {
  if (lineId) return item._id?.toString() === lineId
  return item.menuItemId?.toString() === productId
}

function assertProductId(productId: unknown): string {
  if (typeof productId !== 'string' || productId.length === 0 || productId.length > 100) {
    throw PosError.validation('productId inválido')
  }
  return productId
}

function optionalLineId(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !/^[a-f0-9]{24}$/i.test(value)) {
    throw PosError.validation('lineId inválido')
  }
  return value
}

function assertEditable(status: string): void {
  if (!canEditOrderItems(status as OrderStatus)) {
    throw PosError.conflict(`No se pueden editar items en estado ${status}`)
  }
}

/** Nueva cantidad conservando el descuento de la línea (Fase D). */
function withQuantity(item: SaasOrderItemDraft, quantity: number): SaasOrderItemDraft {
  return withQuantityKeepingDiscount(item, quantity)
}

interface Reduction {
  line: SaasOrderItemDraft
  removed: number
}

/**
 * Autoriza y arma las anulaciones de platos YA enviados. Devuelve [] si la
 * orden no se mandó a cocina (se edita libre) o si no se quita nada.
 */
async function authorizeVoids(
  ctx: Ctx,
  status: string,
  reductions: Reduction[],
  rawReason: unknown,
  details: Record<string, unknown>
): Promise<{ voids: IOrderItemVoid[]; reason: ItemVoidReason | null }> {
  const real = reductions.filter((r) => r.removed > 0)
  if (status !== 'confirmed' || real.length === 0) return { voids: [], reason: null }

  const role = resolvePosRole(ctx.user.role)
  assertCanVoidSentItems(role)
  const reason = assertItemVoidReason(rawReason)
  const approval = await requireManagerApproval(
    ctx,
    'order.item.reduce',
    'Quitar productos que ya se mandaron a cocina necesita la aprobación de un encargado'
  )
  details.approvedBy = approval.approvedBy
  details.reason = reason

  const at = new Date()
  const voids = real.map(({ line, removed }) => ({
    at,
    lineId: String(line._id),
    menuItemId: line.menuItemId ? String(line.menuItemId) : null,
    name: line.name,
    quantity: removed,
    unitPrice: line.basePrice + line.extraPrice,
    reason,
    wasted: ITEM_VOID_REASONS[reason].wasted,
    by: ctx.user.id,
    byRole: role ?? 'unknown',
    approvedBy: approval.viaPin ? approval.approvedBy : null,
  }))
  return { voids, reason }
}

async function saveItems(
  ctx: { tenantId: string; locationId: string },
  posId: string,
  expectedUpdatedAt: Date,
  items: SaasOrderItemDraft[],
  voids: IOrderItemVoid[]
) {
  const { subtotal, total, baseTotal } = recomputeOrderTotals(items)

  const updated = await Order.findOneAndUpdate(
    {
      tenantId: ctx.tenantId,
      locationId: ctx.locationId,
      posId,
      updatedAt: expectedUpdatedAt,
    },
    {
      $set: { items, subtotal, total, 'payment.baseTotal': baseTotal },
      ...(voids.length ? { $push: { itemVoids: { $each: voids } } } : {}),
    },
    { new: true }
  )
    .lean()
    .exec()

  if (!updated) {
    throw PosError.conflict('La orden cambió mientras se procesaba la petición', `posId=${posId}`)
  }
  // Inventario: cantidad cambiada o línea quitada → se registra la diferencia.
  await syncOrderConsumptionSafe(updated as never)
  return updated as unknown as PosOrderDoc
}

/** Merma de los platos que se prepararon y se perdieron (después de guardar). */
async function applyWaste(
  ctx: Ctx,
  plans: { void: IOrderItemVoid; consumption: Awaited<ReturnType<typeof planVoidWaste>> }[],
  order: PosOrderDoc
): Promise<void> {
  for (const { void: v, consumption } of plans) {
    await recordVoidWasteSafe(order as never, `${v.lineId}:${v.at.getTime()}`, consumption, {
      name: v.name,
      reasonLabel: ITEM_VOID_REASONS[v.reason].label,
      actorId: ctx.user.id,
    })
  }
}

async function planWaste(current: PosOrderDoc, voids: IOrderItemVoid[]) {
  const wasted = voids.filter((v) => v.wasted)
  return Promise.all(
    wasted.map(async (v) => ({ void: v, consumption: await planVoidWaste(current as never, v.lineId, v.quantity) }))
  )
}

export const PATCH = posRoute('orders.write', async (ctx, { id, productId }) => {
  const pid = assertProductId(productId)
  const current = await findPosOrder(ctx, id)
  assertEditable(current.status)
  assertNotPaid(current)

  const body = await readPosBody(ctx.request)
  requireFields(body, ['quantity'])
  const lineId = optionalLineId(body.lineId)

  const quantity = body.quantity
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 0) {
    throw PosError.validation('quantity debe ser un entero >= 0')
  }

  const before = (current.items ?? []) as SaasOrderItemDraft[]
  const matches = before.filter((i) => matchesLine(i, pid, lineId))
  if (matches.length === 0) {
    throw PosError.notFound('Producto no encontrado en la orden')
  }

  const auditDetails: Record<string, unknown> = { productId: pid, lineId, quantity }
  // Con lineId: una sola línea. Sin lineId (compatibilidad): la cantidad se
  // aplica a la primera línea del producto y las demás se quitan.
  const reductions: Reduction[] = matches.map((line, i) => ({
    line,
    removed: Math.max(0, line.quantity - (i === 0 ? quantity : 0)),
  }))
  const { voids } = await authorizeVoids(ctx, current.status, reductions, body.reason, auditDetails)
  const waste = await planWaste(current, voids)

  const first = matches[0]
  const items =
    quantity === 0
      ? before.filter((i) => !matches.includes(i))
      : before.flatMap((i) => (i === first ? [withQuantity(i, quantity)] : matches.includes(i) ? [] : [i]))

  const saved = await saveItems(ctx, current.posId as string, current.updatedAt, items, voids)
  await applyWaste(ctx, waste, saved)

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.order.item.quantity',
    entity: 'Order',
    entityId: String(current.posId),
    details: { ...auditDetails, total: saved.total },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })

  return NextResponse.json({ order: toPosOrder(saved) })
})

export const DELETE = posRoute('orders.write', async (ctx, { id, productId }) => {
  const pid = assertProductId(productId)
  const current = await findPosOrder(ctx, id)
  assertEditable(current.status)
  assertNotPaid(current)

  const params = new URL(ctx.request.url).searchParams
  const lineId = optionalLineId(params.get('lineId'))

  const before = (current.items ?? []) as SaasOrderItemDraft[]
  const matches = before.filter((i) => matchesLine(i, pid, lineId))
  if (matches.length === 0) {
    throw PosError.notFound('Producto no encontrado en la orden')
  }

  const auditDetails: Record<string, unknown> = { productId: pid, lineId }
  const { voids } = await authorizeVoids(
    ctx,
    current.status,
    matches.map((line) => ({ line, removed: line.quantity })),
    params.get('reason'),
    auditDetails
  )
  const waste = await planWaste(current, voids)

  const items = before.filter((i) => !matches.includes(i))
  const saved = await saveItems(ctx, current.posId as string, current.updatedAt, items, voids)
  await applyWaste(ctx, waste, saved)

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.order.item.remove',
    entity: 'Order',
    entityId: String(current.posId),
    details: { ...auditDetails, total: saved.total },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })

  return NextResponse.json({ order: toPosOrder(saved) })
})
