import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import PlatformConfig from '@/models/PlatformConfig'
import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { z } from 'zod'
import { createPaymentLink, createPayment, getKriptonClient } from '@/lib/kripton'

const createKriptonPreferenceSchema = z.object({
  orderId: z.string().min(1, 'orderId es requerido'),
})

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
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    if (!tenant.kripton?.isConfigured || !tenant.kripton?.apiKey) {
      return NextResponse.json({ error: 'Kripton no configurado' }, { status: 400 })
    }

    const parsed = createKriptonPreferenceSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'orderId inválido' }, { status: 400 })
    }
    const { orderId } = parsed.data

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
    if (!order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    }

    const { apiKey } = await getKriptonClient(tenantSlug)
    const baseUrl = request.nextUrl.origin
    const usePaymentLinks = tenant.kripton?.usePaymentLinks ?? true

    const platformConfig = await PlatformConfig.findById('platform').lean() as any

    let url: string
    let method: string
    let externalCode: string | null = null
    let token: string | null = null

    if (usePaymentLinks) {
      const result = await createPaymentLink(apiKey, {
        amount: order.total,
        currency_id: 'ars',
        success_url: `${baseUrl}/${tenantSlug}/order-success/${order.orderNumber}`,
        cancel_url: `${baseUrl}/${tenantSlug}/order-failure/${order.orderNumber}`,
        notify_url: `${baseUrl}/api/webhooks/kripton/${tenantSlug}`,
        minutes_to_expire: 30,
        description: `Pedido #${order.orderNumber}`,
      })
      url = result.url
      token = result.token
      method = 'payment_link'
    } else {
      const cryptoNetworkId = tenant.kripton?.cryptoNetworkId
        ?? platformConfig?.kripton?.defaultCryptoNetworkId
        ?? 10

      const result = await createPayment(apiKey, {
        crypto_network_id: cryptoNetworkId,
        amount: order.total,
        fiat: 'ars',
        description: `Pedido #${order.orderNumber}`,
        success_url: `${baseUrl}/${tenantSlug}/order-success/${order.orderNumber}`,
        cancel_url: `${baseUrl}/${tenantSlug}/order-failure/${order.orderNumber}`,
        notify_url: `${baseUrl}/api/webhooks/kripton/${tenantSlug}`,
      })
      url = result.url
      externalCode = result.external_code
      token = result.external_code
      method = 'payment'
    }

    order.payment.kriptonExternalCode = externalCode || token
    order.payment.kriptonToken = token
    await order.save()

    return NextResponse.json({
      url,
      method,
    })
  } catch (error: any) {
    console.error('[create-kripton-preference] error:', error)
    return NextResponse.json({
      error: error?.message || String(error),
      detail: error?.cause ? String(error.cause) : undefined,
    }, { status: 502 })
  }
}
