import { NextResponse } from 'next/server'
import PointIntent from '@/models/PointIntent'
import { posRoute } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { MpPointError, cancelPointIntent, pointIntentStatus, pointTokenFor } from '@/lib/mp-point'

// ============================================================================
// GET    /api/[tenant]/pos/point/[intentId] — estado del cobro en el posnet
// DELETE /api/[tenant]/pos/point/[intentId] — cancelar el cobro
// ============================================================================
// Fase 6. El intento se busca acotado a tenant + sede: el POS no puede
// consultar ni cancelar cobros de otra sede. `approved` sale de verificar el
// pago en MercadoPago por el monto guardado acá.
// ============================================================================

const ID_RE = /^[A-Za-z0-9_-]{1,120}$/

async function findIntent(ctx: { tenantId: string; locationId: string }, intentId: string) {
  if (!ID_RE.test(intentId)) throw PosError.notFound('Cobro no encontrado')
  const intent = await PointIntent.findOne({ tenantId: ctx.tenantId, locationId: ctx.locationId, intentId })
  if (!intent) throw PosError.notFound('Cobro no encontrado')
  return intent
}

export const GET = posRoute<{ tenant: string; intentId: string }>('orders.pay', async (ctx, params) => {
  const intent = await findIntent(ctx, params.intentId)
  if (intent.state !== 'waiting') {
    return NextResponse.json({ state: intent.state, paymentId: intent.paymentId, detail: intent.detail })
  }
  try {
    const token = await pointTokenFor(ctx.tenantId, ctx.locationId)
    const status = await pointIntentStatus(token, intent.intentId, intent.amountCents)
    if (status.state !== 'waiting') {
      intent.state = status.state
      intent.paymentId = status.paymentId
      intent.detail = status.detail
      await intent.save()
    }
    return NextResponse.json(status)
  } catch (err) {
    // Sin respuesta de MP: se sigue esperando (el POS vuelve a preguntar).
    if (err instanceof MpPointError) return NextResponse.json({ state: 'waiting', paymentId: null, detail: err.message })
    throw err
  }
})

export const DELETE = posRoute<{ tenant: string; intentId: string }>('orders.pay', async (ctx, params) => {
  const intent = await findIntent(ctx, params.intentId)
  if (intent.state === 'approved') throw PosError.conflict('El cobro ya fue aprobado: anulalo desde la venta')
  try {
    const token = await pointTokenFor(ctx.tenantId, ctx.locationId)
    await cancelPointIntent(token, intent.deviceId, intent.intentId)
  } catch {
    // El posnet puede haber cancelado solo: igual se marca cancelado acá.
  }
  intent.state = 'canceled'
  intent.detail = 'Cancelado desde la caja'
  await intent.save()
  return NextResponse.json({ state: 'canceled' })
})
