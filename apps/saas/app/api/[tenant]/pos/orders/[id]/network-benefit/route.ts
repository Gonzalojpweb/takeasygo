import { NextResponse } from 'next/server'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { toPosOrder } from '@/lib/pos-online/orderMapper'
import { findPosOrder } from '@/lib/pos-online/orderRepo'
import { applyNetworkBenefitDiscount, assertDiscountable } from '@/lib/pos-online/discountService'
import { operatorName } from '@/lib/pos-online/operator'
import { BenefitError, redeemBenefit, reverseRedemption } from '@/lib/network/engine'
import { parseBenefitInput } from '@/lib/network/benefit-code'

// ============================================================================
// POST /api/[tenant]/pos/orders/[id]/network-benefit — beneficio de la red
//      { code, dryRun? } (multi-rubro, etapa 6)
// ============================================================================
// Canje desde la app del POS sobre una cuenta abierta: valida en línea el QR
// dinámico o el código manual (dryRun = solo ver el descuento), lo canjea
// (uso único) y aplica el descuento a la cuenta por el mismo camino que un
// descuento normal (reporte, auditoría, cierre Z). Si el descuento no se
// puede aplicar, el canje se anula solo. Necesita internet (§6.1).
// ============================================================================

function toPosError(err: unknown): never {
  if (err instanceof BenefitError) {
    if (err.status === 404) throw PosError.notFound(err.message)
    if (err.status === 400) throw PosError.validation(err.message)
    throw PosError.conflict(err.message)
  }
  throw err
}

export const POST = posRoute('orders.pay', async (ctx, { id }) => {
  if (ctx.offline) throw PosError.conflict('El beneficio de la red se valida en línea: esperá a tener internet')
  const order = await findPosOrder(ctx, id)
  assertDiscountable(order)
  const body = await readPosBody(ctx.request)
  const parsed = parseBenefitInput(body.code)
  if (!parsed) throw PosError.validation('Código inválido: escaneá el QR del cliente o tipeá el código completo')
  const purchaseTotalCents = Math.round(Number(order.total) || 0)
  if (purchaseTotalCents <= 0) throw PosError.validation('La cuenta no tiene importe')
  const actorName = await operatorName(ctx, 'Caja')
  const saleRef = String(order.orderNumber || order.posId || '')

  if (body.dryRun === true) {
    const preview = await redeemBenefit({ tenantId: ctx.tenantId, code: body.code, purchaseTotalCents, dryRun: true, actorName }).catch(toPosError)
    return NextResponse.json({ preview })
  }

  // Reintento tras un corte de red: el beneficio ya quedó aplicado a esta cuenta.
  const items = order.items as Array<{ posDiscount?: { note?: string | null } | null }>
  if (items.some((i) => i.posDiscount?.note?.includes(parsed.ref))) {
    return NextResponse.json({ order: toPosOrder(order), discountedCents: 0, replayed: true })
  }
  if (items.some((i) => i.posDiscount)) {
    throw PosError.conflict('La cuenta ya tiene un descuento: quitalo para aplicar el beneficio de la red')
  }
  const result = await redeemBenefit({
    tenantId: ctx.tenantId, code: body.code, purchaseTotalCents, saleRef,
    requestId: `pos:${order.posId}:${parsed.ref}`, actorName,
  }).catch(toPosError)

  try {
    const { order: saved, discountedCents } = await applyNetworkBenefitDiscount(ctx, order, result.discountCents, parsed.ref)
    return NextResponse.json({ order: toPosOrder(saved), discountedCents, benefit: result })
  } catch (err) {
    // Sin descuento no hay canje: se anula (sin comisión) y el cliente
    // recupera el beneficio para usarlo cuando se resuelva.
    if (result.ledgerId && !result.replayed) {
      await reverseRedemption({ tenantId: ctx.tenantId, ledgerId: result.ledgerId, reason: 'No se pudo aplicar el descuento en el POS', actorName, restoreBenefit: true }).catch(() => undefined)
    }
    throw err
  }
})
