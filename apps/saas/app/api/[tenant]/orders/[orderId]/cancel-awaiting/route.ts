import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { revertRewardRedemptions } from '@/lib/loyalty'
import { rateLimit } from '@/lib/rateLimit'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/[tenant]/orders/[orderId]/cancel-awaiting
 *
 * Única salida para un pedido varado en `awaiting_payment` (nunca se cobró).
 * Es la vía que usa el tracking cuando MercadoPago falló en su propio checkout
 * y no dejó webhook ni back_url utilizable.
 *
 * ── SEGURIDAD ───────────────────────────────────────────────────────────────
 * Este endpoint queda expuesto al tracking PÚBLICO (sin sesión), así que el
 * tracking-token es OBLIGATORIO: sin él, cualquiera que adivine un orderId
 * podría cancelar pedidos ajenos. No hacerlo opcional bajo ninguna
 * circunstancia.
 *
 * ── POR QUÉ ESTE Y NO `cancel-by-client` ────────────────────────────────────
 * `cancel-by-client` rechaza MercadoPago a propósito: si MP ya cobró, cancelar
 * acá NO devuelve la plata — hay que reembolsar vía API de MP. Ver
 * `cancel-by-client/route.ts`. Acá no aplica porque `awaiting_payment` nunca
 * llegó a cobrarse.
 *
 * NO confundir los dos endpoints. Si se fusionan se reintroduce el bug de
 * reembolso.
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

    const { success } = await rateLimit(`cancel-awaiting:${tenantSlug}:${orderId}:${ip}`, 10, 60_000)
    if (!success) {
      return NextResponse.json({ error: 'Demasiados intentos. Esperá un momento.' }, { status: 429 })
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // Tracking token OBLIGATORIO — ver comentario de arriba.
    const trackingToken = request.headers.get('x-tracking-token')
    if (!trackingToken) {
      return NextResponse.json({ error: 'Token requerido' }, { status: 401 })
    }

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
    if (!order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    }

    if (!order.trackingToken || order.trackingToken !== trackingToken) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 403 })
    }

    // Idempotencia: si ya está cancelado, éxito silencioso.
    if (order.status === 'cancelled') {
      return NextResponse.json({ ok: true, message: 'Tu pedido ya fue cancelado' })
    }

    // El pedido tiene que seguir sin cobrar. Si salió de `awaiting_payment` es
    // porque ya avanzó (pago aprobado / admin en preparación) — no cancelamos.
    if (order.status !== 'awaiting_payment') {
      return NextResponse.json(
        { error: 'Solo se puede cancelar pedidos en espera de pago' },
        { status: 400 }
      )
    }

    // Nunca se cobró → no hay reembolso que hacer (diferencia con MP cobrado).
    order.status = 'cancelled'
    order.statusTimestamps.cancelledAt = new Date()
    order.cancelledBy = 'client'
    if (order.payment?.status === 'pending') {
      order.payment.status = 'cancelled'
    }
    await revertRewardRedemptions(order, tenant)
    await order.save()

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[cancel-awaiting]', error)
    return NextResponse.json({ error: 'Error al cancelar el pedido' }, { status: 500 })
  }
}
