import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { revertRewardRedemptions } from '@/lib/loyalty'
import { rateLimit } from '@/lib/rateLimit'
import SystemAnnouncement from '@/models/SystemAnnouncement'
import { NextRequest, NextResponse } from 'next/server'

const CANCELLATION_WINDOW_MS = 180_000 // 3 minutos

const CANCELLABLE_BY_TRANSFER = ['pending', 'awaiting_confirmation']
const CANCELLABLE_BY_CASH = ['pending', 'awaiting_confirmation', 'confirmed']

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

    // Rate limit: 10 intentos por minuto por IP+orden
    const { success } = await rateLimit(`cancel-client:${tenantSlug}:${orderId}:${ip}`, 10, 60_000)
    if (!success) {
      return NextResponse.json({ error: 'Demasiados intentos. Esperá un momento.' }, { status: 429 })
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // Validar tracking token (autenticación del cliente)
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

    // Idempotencia: si ya está cancelado, devolver éxito silencioso
    if (order.status === 'cancelled') {
      return NextResponse.json({ ok: true, message: 'Tu pedido ya fue cancelado' })
    }

    // Validar método de pago
    const paymentMethod = order.payment?.method
    if (paymentMethod !== 'transfer' && paymentMethod !== 'cash') {
      return NextResponse.json(
        { error: 'Solo podés cancelar pedidos pagados por transferencia o efectivo' },
        { status: 400 }
      )
    }

    // Validar estados permitidos según método de pago
    const allowedStatuses = paymentMethod === 'transfer' ? CANCELLABLE_BY_TRANSFER : CANCELLABLE_BY_CASH
    if (!allowedStatuses.includes(order.status)) {
      return NextResponse.json(
        { error: 'Tu pedido ya no puede ser cancelado desde esta pantalla' },
        { status: 400 }
      )
    }

    // Validar ventana de tiempo (3 minutos)
    const referenceTime = order.statusTimestamps?.confirmedAt || order.createdAt
    const elapsed = Date.now() - new Date(referenceTime).getTime()
    if (elapsed >= CANCELLATION_WINDOW_MS) {
      return NextResponse.json(
        { error: 'Se acabó el tiempo para cancelar. Contactá al restaurante directamente.' },
        { status: 400 }
      )
    }

    // Cancelar
    order.status = 'cancelled'
    order.statusTimestamps.cancelledAt = new Date()
    order.cancelledBy = 'client'
    await revertRewardRedemptions(order, tenant)
    await order.save()

    // Notificar al admin (SystemAnnouncement in-app)
    const orderNumber = order.orderNumber || orderId
    const customerName = order.customer?.name || 'Cliente'
    const methodLabel = paymentMethod === 'transfer' ? 'transferencia' : 'efectivo'

    await SystemAnnouncement.create({
      title: `Pedido #${orderNumber} cancelado por el cliente`,
      content: `${customerName} canceló el pedido #${orderNumber} (${methodLabel}). Verificá el estado en el panel de pedidos.`,
      type: 'alert',
      status: 'published',
      publishedAt: new Date(),
      targetPlans: [],
      targetTenantIds: [tenant._id],
      readBy: [],
      acceptances: [],
      requiresConsent: false,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días TTL
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[POST /cancel-by-client]', error)
    return NextResponse.json({ error: 'Error al cancelar el pedido' }, { status: 500 })
  }
}
