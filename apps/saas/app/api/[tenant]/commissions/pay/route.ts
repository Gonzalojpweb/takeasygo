import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Preference } from 'mercadopago'
import { toPesos } from '@takeasygo/business'
import { getSessionUser } from '@/lib/apiAuth'
import User from '@/models/User'
import CommissionPaymentIntent from '@/models/CommissionPaymentIntent'
import { getPlatformMPClient } from '@/lib/mp-platform'
import { getBaseUrl } from '@/lib/site-url'
import { feesByOrder, loadCommissionWeeks, payableFrom, type PayScope } from '@/lib/commission-weeks'
import { isValidCalendarDate } from '@/lib/restaurant-time'
import { logAudit } from '@/lib/audit'
import { commissionsTenant } from '../_shared'

const bodySchema = z.object({
  /** due = semanas cerradas (vencidas + pendientes) · all = + semana en curso · week = una semana */
  scope: z.enum(['due', 'all', 'week']).default('due'),
  weekKey: z.string().optional(),
})

/**
 * POST /api/{tenant}/commissions/pay (admin · manager)
 *
 * Crea el cobro de las comisiones por transferencia a la cuenta de
 * MercadoPago de la PLATAFORMA (donde caen las comisiones de TakeasyGO).
 *
 * Congela QUÉ se paga en un CommissionPaymentIntent (pedidos exactos y
 * monto). El webhook de MP salda exactamente esos pedidos cuando el pago se
 * aprueba y marca pagadas las semanas cubiertas.
 *
 * Response: { initPoint, amount (pesos), orderCount, weeks }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { tenant: slug } = await params
    const ctx = await commissionsTenant(request, slug, 'pay')
    if ('error' in ctx) return ctx.error

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
    const { scope: kind, weekKey } = parsed.data
    if (kind === 'week' && (!weekKey || !isValidCalendarDate(weekKey))) {
      return NextResponse.json({ error: 'Indicá la semana a pagar' }, { status: 400 })
    }
    const scope: PayScope = kind === 'week' ? { kind, key: weekKey! } : { kind }

    const weeks = await loadCommissionWeeks(ctx.tenant._id, { tz: ctx.tz })
    const fees = await feesByOrder(weeks.flatMap((w) => w.pendingOrderIds))
    const payable = payableFrom(weeks, scope, fees)
    if (payable.amount <= 0 || payable.orderIds.length === 0) {
      return NextResponse.json({ error: 'No hay comisiones pendientes para pagar' }, { status: 400 })
    }

    const user = await getSessionUser(request)
    const payerEmail = user?.id ? (await User.findById(user.id).select('email').lean<{ email?: string }>())?.email : undefined

    // Un cobro nuevo deja "superado" al anterior impago (si igual se paga, el
    // webhook lo acredita: la plata de un pago real nunca se ignora).
    await CommissionPaymentIntent.updateMany({ tenantId: ctx.tenant._id, status: 'pending' }, { $set: { status: 'superseded' } })
    const intent = await CommissionPaymentIntent.create({
      tenantId: ctx.tenant._id,
      orderIds: payable.orderIds,
      weekStarts: payable.weekStarts,
      amount: payable.amount,
      createdBy: user?.id ? String(user.id) : null,
    })

    const { client } = await getPlatformMPClient()
    const appUrl = getBaseUrl(request)
    const label = payable.weekStarts.length === 1
      ? `semana del ${payable.weekStarts[0].toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: ctx.tz || 'America/Argentina/Buenos_Aires' })}`
      : `${payable.weekStarts.length} semanas`
    const result = await new Preference(client).create({
      body: {
        items: [
          {
            id: `commission-intent-${intent._id}`,
            title: `Comisión TakeasyGO por transferencias (${label}) — ${payable.orderIds.length} pedidos`,
            quantity: 1,
            unit_price: toPesos(payable.amount),
            currency_id: 'ARS',
          },
        ],
        payer: payerEmail ? { email: payerEmail } : undefined,
        external_reference: `commission-intent:${intent._id}`,
        back_urls: {
          success: `${appUrl}/${slug}/admin/commissions?pago=ok`,
          failure: `${appUrl}/${slug}/admin/commissions?pago=error`,
          pending: `${appUrl}/${slug}/admin/commissions?pago=pendiente`,
        },
        auto_return: 'approved' as const,
        notification_url: `${appUrl}/api/webhooks/mercadopago/commission`,
      },
    })
    if (!result.init_point) {
      return NextResponse.json({ error: 'MercadoPago no devolvió el link de pago. Reintentá.' }, { status: 502 })
    }
    await CommissionPaymentIntent.updateOne({ _id: intent._id }, { $set: { preferenceId: result.id ?? null } })

    logAudit({
      tenantId: String(ctx.tenant._id),
      action: 'commissions.payment_started',
      entity: 'commission',
      entityId: String(intent._id),
      details: { scope: kind, weekKey: weekKey ?? null, amount: payable.amount, orders: payable.orderIds.length },
      request,
    })

    return NextResponse.json({
      initPoint: result.init_point,
      amount: toPesos(payable.amount),
      orderCount: payable.orderIds.length,
      weeks: payable.weekStarts.length,
    })
  } catch (error) {
    console.error('[commissions/pay]', error)
    return NextResponse.json({ error: 'No se pudo iniciar el pago. Reintentá en unos segundos.' }, { status: 500 })
  }
}
