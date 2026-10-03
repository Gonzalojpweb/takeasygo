import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { safeDecrypt } from '@/lib/crypto'
import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { orderItemsToCartItems } from '@/lib/cart-from-order'

/**
 * GET /api/[tenant]/orders/[orderId]/cart-restore
 *
 * Devuelve el carrito reconstruido a partir de los items del pedido, para que el
 * cliente que cancela un pedido varado vuelva al checkout con SU pedido, no con
 * uno rearmado a mano desde cero.
 *
 * ── POR QUÉ NO BASTA CON LEER sessionStorage ─────────────────────────────────
 * El carrito vive en `sessionStorage`, que es por pestaña: si el cliente abrió
 * el link del tracking en otra pestaña, o el link llegó por mail/WhatsApp, ahí no
 * hay nada que leer. `order.items` sí está siempre y guarda la customización y la
 * variante exactas.
 *
 * ── SEGURIDAD ────────────────────────────────────────────────────────────────
 * Endpoint público → `x-tracking-token` obligatorio y validado. Sin él, conocer
 * un orderId expondría el contenido del pedido de otro cliente.
 *
 * Sólo sirve para pedidos `awaiting_payment` o `cancelled`: son los únicos desde
 * donde tiene sentido rearmar. Un pedido confirmado ya se cobró, y devolver su
 * carrito invitaría a duplicarlo.
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

    const { success } = await rateLimit(`cart-restore:${tenantSlug}:${orderId}:${ip}`, 20, 60_000)
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

    if (!['awaiting_payment', 'cancelled'].includes(order.status)) {
      return NextResponse.json(
        { error: 'Este pedido no se puede rearmar' },
        { status: 400 }
      )
    }

    const cartItems = orderItemsToCartItems(order.items || [])

    return NextResponse.json({
      orderNumber: order.orderNumber,
      orderMode: order.orderMode,
      locationId: order.locationId ? order.locationId.toString() : null,
      cartItems,
      // Datos del cliente para que el paso de pago sea usable de inmediato: sin
      // nombre, `createOrderSchema` rechaza el pedido y el cliente pagaría para
      // nada. Se devuelven al mismo cliente dueño del tracking-token que ya los
      // envió — no es una exposición nueva.
      customer: {
        name: safeDecrypt(order.customer?.name ?? '') || '',
        phone: safeDecrypt(order.customer?.phone ?? '') || '',
        email: safeDecrypt(order.customer?.email ?? '') || '',
      },
      notes: order.notes || '',
      // Si no hay nada que rearmar (pedido de premios ocultos, por ejemplo), el
      // cliente tiene que saber que no puede seguir por acá en vez de caer en
      // un checkout vacío.
      empty: cartItems.length === 0,
    })
  } catch (error) {
    console.error('[cart-restore]', error)
    return NextResponse.json({ error: 'Error al reconstruir el pedido' }, { status: 500 })
  }
}