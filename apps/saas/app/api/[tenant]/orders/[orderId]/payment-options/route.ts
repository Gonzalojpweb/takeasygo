import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import {
  buildPaymentMethodCatalog,
  loadPaymentMethodContext,
  LocationNotFoundError,
  TenantNotFoundError,
} from '@/lib/payment-methods'

/**
 * GET /api/[tenant]/orders/[orderId]/payment-options
 *
 * Cotiza los métodos de pago alternativos para un pedido varado en
 * `awaiting_payment`, con el delta de precio contra el total actual.
 *
 * ── POR QUÉ EL SERVER CALCULA ────────────────────────────────────────────────
 * El total es la fuente de verdad del SaaS y el mismo pricing que se persiste
 * en `change-payment-method`. Si el cliente multiplicara, dos pedidos con el
 * mismo carrito podrían quedar con totales distintos según quién calculó.
 *
 * ── SEGURIDAD ────────────────────────────────────────────────────────────────
 * Endpoint público (tracking sin sesión) → `x-tracking-token` OBLIGATORIO.
 * Se valida contra la orden; sin esto, cualquiera con un orderId ajeno vería la
 * configuración de pago del tenant y podría alterar el total.
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

    const { success } = await rateLimit(
      `payment-options:${tenantSlug}:${orderId}:${ip}`,
      30,
      60_000
    )
    if (!success) {
      return NextResponse.json({ error: 'Demasiados intentos. Esperá un momento.' }, { status: 429 })
    }

    const trackingToken = request.headers.get('x-tracking-token')
    if (!trackingToken) {
      return NextResponse.json({ error: 'Token requerido' }, { status: 401 })
    }

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
    if (!order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    }

    if (!order.trackingToken || order.trackingToken !== trackingToken) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 403 })
    }

    if (order.status !== 'awaiting_payment') {
      return NextResponse.json(
        { error: 'Este pedido ya no está esperando pago' },
        { status: 400 }
      )
    }

    // baseTotal es el monto pre-recargo ya persistido. Repricing parte de ahí,
    // nunca del total actual (que incluye el recargo del método anterior).
    const baseTotal = order.payment?.baseTotal ?? order.total ?? 0
    const currentTotal = order.total ?? 0
    const currentMethod = order.payment?.method ?? 'mercadopago'

    const ctx = await loadPaymentMethodContext(
      tenantSlug,
      order.locationId ? order.locationId.toString() : null
    )
    const catalog = buildPaymentMethodCatalog(ctx, order.orderMode ?? 'takeaway', {
      baseTotal,
      deliveryCost: order.deliveryCost ?? 0,
    })

    const options = catalog.methods.map((m) => ({
      id: m.id,
      label: m.label,
      description: m.description,
      enabled: m.enabled,
      total: m.total,
      // Delta en centavos contra el total actual. Positivo = se paga más.
      delta: (m.total ?? currentTotal) - currentTotal,
      surchargePercent: m.surchargePercent,
      cashDiscountPercent: m.cashDiscountPercent,
      isCurrent: m.id === currentMethod,
    }))

    return NextResponse.json({
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      currentMethod,
      currentTotal,
      baseTotal,
      options,
      transfer: catalog.transfer,
    })
  } catch (error) {
    if (error instanceof TenantNotFoundError || error instanceof LocationNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    console.error('[payment-options]', error)
    return NextResponse.json({ error: 'Error al cotizar métodos de pago' }, { status: 500 })
  }
}