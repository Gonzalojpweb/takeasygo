import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { decrypt } from '@/lib/crypto'
import { MercadoPagoConfig, Preference } from 'mercadopago'
import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { createPaymentPreferenceSchema } from '@/lib/schemas'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
const { success } = await rateLimit(`payment:${ip}`, 10, 60_000)
if (!success) {
  return NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429 })
}
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    if (!tenant.mercadopago.isConfigured || !tenant.mercadopago.accessToken) {
      return NextResponse.json({ error: 'MercadoPago no configurado' }, { status: 400 })
    }

    const parsed = createPaymentPreferenceSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'orderId inválido' }, { status: 400 })
    }
    const { orderId } = parsed.data

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
    if (!order) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })

    const accessToken = decrypt(tenant.mercadopago.accessToken)
    const client = new MercadoPagoConfig({ accessToken })
    const preference = new Preference(client)

    const baseUrl = request.nextUrl.origin

    const result = await preference.create({
      body: {
        items: order.items.map((item: any) => ({
          id: item.menuItemId.toString(),
          title: item.name,
          quantity: item.quantity,
          unit_price: item.price,
          currency_id: 'ARS',
        })),
        payer: {
          name: order.customer.name,
          email: order.customer.email || 'cliente@menuplatform.com',
        },
        back_urls: {
          success: `${baseUrl}/${tenantSlug}/order-success/${order.orderNumber}`,
          failure: `${baseUrl}/${tenantSlug}/order-failure/${order.orderNumber}`,
          pending: `${baseUrl}/${tenantSlug}/order-pending/${order.orderNumber}`,
        },
        ...(baseUrl.startsWith('https://') ? { auto_return: 'approved' as const } : {}),
        external_reference: order.orderNumber,
        notification_url: `${baseUrl}/api/webhooks/mercadopago/${tenantSlug}`,
      }
    })

    // Guardar el preference ID en la orden
    order.payment.mercadopagoId = result.id || null
    await order.save()

    return NextResponse.json({
      preferenceId: result.id,
      initPoint: result.init_point,
      sandboxInitPoint: result.sandbox_init_point,
    })
  } catch (error: any) {
    console.error('[create-preference] error:', error)
    return NextResponse.json({
      error: error?.message || String(error),
      detail: error?.cause ? String(error.cause) : undefined,
    }, { status: 500 })
  }
}