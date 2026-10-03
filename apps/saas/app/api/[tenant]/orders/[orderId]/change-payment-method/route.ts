import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { safeDecrypt } from '@/lib/crypto'
import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { calculateFinalTotal, type PaymentMethod } from '@/lib/pricing'
import {
  buildPaymentMethodCatalog,
  isPaymentMethodAvailable,
  loadPaymentMethodContext,
  LocationNotFoundError,
  TenantNotFoundError,
} from '@/lib/payment-methods'
import { registerCashSale, applyStatusTransitionSideEffects } from '@/lib/order-side-effects'

const ALLOWED_METHODS: PaymentMethod[] = ['mercadopago', 'kripton', 'transfer', 'cash']

/**
 * POST /api/[tenant]/orders/[orderId]/change-payment-method
 *
 * Segunda salida para un pedido varado en `awaiting_payment`: cambiar el método
 * de pago sin perder el pedido ni el número de pedido.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
 * El incidente que motivó esto: el cliente pagó con MP, MP falló del lado de
 * la billetera y no tenía ni cancelación ni reintento. Cancelar y rearmar todo
 * desde cero es perder la chance de comprar; poder elegir otro método es la
 * diferencia entre vender y perder la venta.
 *
 * ── SEGURIDAD ────────────────────────────────────────────────────────────────
 * Endpoint PÚBLICO (tracking sin sesión). El `x-tracking-token` es
 * OBLIGATORIO y se valida contra la orden, igual que en `cancel-awaiting`:
 * sin esa validación, cualquiera que adivine un orderId podría cambiar el método
 * de pago de un pedido ajeno. Ojo: el token va en header, no querystring, para no
 * terminar en logs ni en el `Referer`.
 *
 * ── ESTADO ───────────────────────────────────────────────────────────────────
 * La orden solo puede cambiar de método mientras está en `awaiting_payment`
 * (nunca cobrada). Si ya avanzó —MP cobrado, admin preparando— el cobro existe y
 * cancelar/reencaminar acá no devolvería la plata: ese caso es de
 * `cancel-by-client` con reembolso vía API de MP.
 *
 * ── EFECTIVO ─────────────────────────────────────────────────────────────────
 * Cambiar a efectivo NO inventa una semántica nueva: reutiliza
 * `registerCashSale` (misma función que el checkout normal) para que la venta
 * quede registrada en caja igual que un pedido cash creado desde cero.
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

    const { success } = await rateLimit(
      `change-payment-method:${tenantSlug}:${orderId}:${ip}`,
      10,
      60_000
    )
    if (!success) {
      return NextResponse.json({ error: 'Demasiados intentos. Esperá un momento.' }, { status: 429 })
    }

    // ── Token obligatorio: se valida más abajo contra la orden ──────────────
    const trackingToken = request.headers.get('x-tracking-token')
    if (!trackingToken) {
      return NextResponse.json({ error: 'Token requerido' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const method = body?.method as PaymentMethod | undefined
    if (!method || !ALLOWED_METHODS.includes(method)) {
      return NextResponse.json({ error: 'Método de pago inválido' }, { status: 400 })
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

    // Si la comisión ya entró al balance del tenant, cambiar el total de la
    // orden dejaría el balance descuadrado. Es defensivo: en `awaiting_payment`
    // debería ser false, pero si algún camino la cargó antes, no se toca.
    if (order.payment?.commissionBalanceAdded) {
      return NextResponse.json(
        { error: 'No se puede cambiar el método de pago de este pedido' },
        { status: 400 }
      )
    }

    // ── Disponibilidad real del método para esta sede y modo ──────────────
    const ctx = await loadPaymentMethodContext(
      tenantSlug,
      order.locationId ? order.locationId.toString() : null
    )
    const baseTotal = order.payment?.baseTotal ?? order.total ?? 0
    const catalog = buildPaymentMethodCatalog(ctx, order.orderMode ?? 'takeaway', {
      baseTotal,
      deliveryCost: order.deliveryCost ?? 0,
    })

    if (!isPaymentMethodAvailable(catalog, method)) {
      return NextResponse.json(
        { error: 'Ese método de pago no está disponible para este pedido' },
        { status: 400 }
      )
    }

    const previousMethod = order.payment?.method ?? 'mercadopago'

    // ── Repricing desde baseTotal (pre-recargo), nunca desde el total actual ─
    const pricing = calculateFinalTotal(
      baseTotal,
      method,
      tenant,
      ctx.platformConfig || {},
      undefined,
      order.orderMode,
      order.deliveryCost ?? 0
    )

    order.payment.method = method
    order.payment.baseTotal = baseTotal
    order.payment.surchargePercent = pricing.surchargePercent
    order.payment.surchargeAmount = pricing.surchargeAmount
    order.payment.platformFeeAmount = pricing.platformFeeAmount
    order.total = pricing.finalTotal

    // ── Limpiar referencias de pago ──────────────────────────────────────
    // Sin esto quedan datos de una preferencia vieja que mislead al webhook,
    // al tracking (que auto-confirma si ve mercadopagoId) y a la conciliación.
    //
    // Se limpian las del método ANTERIOR y las del método DESTINO, y no solo
    // cuando son distintos. Reintentar MercadoPago sobre un pedido que ya tenía
    // una preferencia vieja es el caso peligroso: si `create-preference` vuelve
    // a fallar, el pedido queda en awaiting_payment CON un mercadopagoId
    // apuntando a una preferencia que nunca se cobró — el mismo pedido varado
    // que este deliverable viene a eliminar.
    const clearRefs = (m: string) => {
      if (m === 'mercadopago') {
        order.payment.mercadopagoId = null
        order.payment.mercadopagoData = null
      }
      if (m === 'kripton') {
        order.payment.kriptonExternalCode = null
        order.payment.kriptonToken = null
        order.payment.kriptonData = null
      }
      if (m === 'transfer') {
        order.payment.transferConfirmed = false
        order.payment.transferConfirmedAt = null
        order.payment.transferConfirmedBy = null
      }
    }

    clearRefs(previousMethod)
    if (method !== previousMethod) clearRefs(method)

    // ── Efectivo: el pedido queda confirmado al instante ───────────────────
    // Misma semántica que el checkout normal (confirmed + approved), NO espera
    // al cajero: la confirmación del cajero es para transferencia.
    if (method === 'cash') {
      order.status = 'confirmed'
      order.statusTimestamps.confirmedAt = new Date()
      order.payment.status = 'approved'
    } else {
      order.payment.status = 'pending'
    }

    await order.save()

    // ── Efectos DESPUÉS del save ──────────────────────────────────────────
    // Necesitan la orden persistida: si fallan, el pedido ya está coherente.
    const customerName = safeDecrypt(order.customer?.name ?? '') || 'Cliente'

    if (method === 'cash') {
      // MISMA función que el checkout normal de efectivo.
      await registerCashSale({ order, tenant, tenantSlug, customerName })
      await applyStatusTransitionSideEffects({ order, tenant })
    }

    return NextResponse.json({
      ok: true,
      method,
      previousMethod,
      status: order.status,
      paymentStatus: order.payment.status,
      total: pricing.finalTotal,
      surchargeAmount: pricing.surchargeAmount,
      transfer: method === 'transfer' ? catalog.transfer : null,
      requiresPreference: method === 'mercadopago' || method === 'kripton',
    })
  } catch (error) {
    if (error instanceof TenantNotFoundError || error instanceof LocationNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    console.error('[change-payment-method]', error)
    return NextResponse.json({ error: 'Error al cambiar el método de pago' }, { status: 500 })
  }
}