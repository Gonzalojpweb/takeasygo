import Promotion from '@/models/Promotion'
import Location from '@/models/Location'
import Tenant from '@/models/Tenant'
import mongoose from 'mongoose'
import type { PosMenuDiscount, Product } from '@takeasygo/types'
import { POS_PROMO_DISCOUNT_BY_PREFIX, posPromoLineDiscount, type MenuDiscountRule } from '@takeasygo/business'
import { promotionChannels } from '@/lib/sales-channels'
import { isPromoScheduledNow } from '@/lib/promo-schedule'
import { grossOf } from './discounts'
import { recomputeOrderTotals, type PosOrderItemInput, type SaasOrderItemDraft } from './orderMapper'

// ============================================================================
// Promos «Descuento %» en el POS (21/11/2026)
// ============================================================================
// El POS vende a precio de lista y la promo entra como DESCUENTO DE LA LÍNEA
// (motivo «Promoción del local», nota = nombre de la promo, by = promo:<id>).
// Cobro, factura, Z y reportes ya leen ese descuento sin lógica nueva.
//
//   · GET /pos/menu manda las promos vigentes AHORA (fechas, días y horario
//     en la hora de la sede) para que el POS muestre el precio antes de cobrar.
//   · Al crear la orden o agregar un plato, el server calcula el mismo
//     descuento (@takeasygo/business/menu-discount) y lo guarda en la línea.
//   · Modo: mesa = salón (dine-in); mostrador = para retirar (takeaway).
//   · No pisa un descuento manual que ya tenga la línea.
//   · Una ronda tomada SIN internet se guarda como la cobró el equipo (sin
//     promo): el server nunca cambia el total de algo ya cobrado.
// ============================================================================

/** Promos de descuento vigentes ahora en la sede, en la forma del snapshot. */
export async function loadPosMenuDiscounts(tenantId: string, locationId: string, now: Date = new Date()): Promise<PosMenuDiscount[]> {
  if (!mongoose.Types.ObjectId.isValid(locationId)) return []
  const promos = await Promotion.find({
    tenantId,
    type: 'discount',
    isActive: true,
    $or: [{ locationId: new mongoose.Types.ObjectId(locationId) }, { locationId: null }, { locationId: { $exists: false } }],
  })
    .select('title type channels activeDays activeTimeStart activeTimeEnd scheduledStart scheduledEnd discountTargets stackable')
    .lean<Array<Record<string, any>>>()
  if (promos.length === 0) return []
  const [loc, tenant] = await Promise.all([
    Location.findOne({ _id: locationId, tenantId }).select('timezone').lean<{ timezone?: string }>(),
    Tenant.findById(tenantId).select('timezone').lean<{ timezone?: string }>(),
  ])
  const tz = loc?.timezone || tenant?.timezone || undefined
  return promos
    .filter((p) => isPromoScheduledNow(p as never, tz, now))
    .filter((p) => {
      const ch = promotionChannels(p)
      return ch.length === 0 || ch.includes('dine-in') || ch.includes('takeaway')
    })
    .map((p) => ({
      _id: String(p._id),
      type: 'discount' as const,
      title: p.title ?? '',
      channels: promotionChannels(p),
      stackable: p.stackable === true,
      discountTargets: (p.discountTargets ?? []).map((t: any) => ({
        kind: t.kind,
        categoryId: t.categoryId ? String(t.categoryId) : null,
        subcategoryId: t.subcategoryId ? String(t.subcategoryId) : null,
        itemId: t.itemId ? String(t.itemId) : null,
        variantName: t.variantName ?? null,
        percent: Number(t.percent) || 0,
      })),
    }))
}

/**
 * Pone el descuento de promo en las líneas nuevas (índice a índice con lo que
 * mandó el POS). Devuelve true si tocó alguna. Muta `drafts`.
 */
export function applyPosMenuPromos(
  drafts: SaasOrderItemDraft[],
  inputs: PosOrderItemInput[],
  products: ReadonlyMap<string, Product>,
  rules: readonly MenuDiscountRule[],
  orderMode: 'dine-in' | 'takeaway',
  now: Date = new Date(),
): boolean {
  if (rules.length === 0) return false
  let changed = false
  drafts.forEach((draft, i) => {
    const input = inputs[i]
    if (!input || draft.posDiscount) return
    const product = products.get(input.productId)
    const hit = posPromoLineDiscount(
      {
        productId: input.productId,
        categoryId: product?.categoryId ?? null,
        subcategoryId: product?.subcategoryId ?? null,
        unitPrice: input.unitPrice,
        quantity: input.quantity,
        modifiers: input.modifiers,
        comboComponent: input.comboComponent,
        comboInstanceId: input.comboInstanceId,
      },
      rules,
      orderMode,
    )
    if (!hit) return
    const gross = grossOf(draft)
    const amountCents = Math.min(gross, hit.amountCents)
    draft.posDiscount = {
      kind: 'amount',
      value: hit.perUnitCents,
      amountCents,
      scope: 'item',
      reason: 'promotion',
      note: `${hit.title} (-${hit.percent}%)`.slice(0, 140),
      by: `${POS_PROMO_DISCOUNT_BY_PREFIX}${hit.promotionId}`,
      approvedBy: null,
      at: now,
    }
    draft.subtotal = gross - amountCents
    changed = true
  })
  return changed
}

/** Totales de la orden después de aplicar promos (mismo cálculo que el resto de rutas). */
export function totalsAfterPromos(items: SaasOrderItemDraft[]) {
  return recomputeOrderTotals(items)
}

/** ¿El descuento de la línea es de una promo de carta? (escala con la cantidad). */
export function isPromoLineDiscount(d: { by?: string | null } | null | undefined): boolean {
  return !!d?.by && d.by.startsWith(POS_PROMO_DISCOUNT_BY_PREFIX)
}
