import crypto from 'crypto'
import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { decrypt } from '@/lib/crypto'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Verifica la firma HMAC-SHA256 que MercadoPago envía en el header x-signature.
 * Spec: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
 *
 * Header formato: "ts=<timestamp>,v1=<hex_hash>"
 * Manifest: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
 */
function verifyMercadoPagoSignature(
  signatureHeader: string | null,
  requestId: string | null,
  dataId: string | number | null | undefined,
  secret: string
): boolean {
  if (!signatureHeader || !requestId || dataId == null) return false

  const parts: Record<string, string> = {}
  for (const part of signatureHeader.split(',')) {
    const [key, value] = part.split('=')
    if (key && value) parts[key.trim()] = value.trim()
  }

  const { ts, v1 } = parts
  if (!ts || !v1) return false

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex')

  // timingSafeEqual previene timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'))
  } catch {
    // Buffers de distinto largo (firma malformada)
    return false
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const body = await request.json()

    if (body.type !== 'payment') {
      return NextResponse.json({ received: true })
    }

    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant?.mercadopago?.accessToken) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // Verificar firma si el tenant tiene el webhookSecret configurado
    if (tenant.mercadopago.webhookSecret) {
      const webhookSecret = decrypt(tenant.mercadopago.webhookSecret)
      const signatureHeader = request.headers.get('x-signature')
      const requestId = request.headers.get('x-request-id')
      const dataId = body.data?.id

      const isValid = verifyMercadoPagoSignature(signatureHeader, requestId, dataId, webhookSecret)
      if (!isValid) {
        return NextResponse.json({ error: 'Firma invalida' }, { status: 401 })
      }
    }

    const accessToken = decrypt(tenant.mercadopago.accessToken)
    const client = new MercadoPagoConfig({ accessToken })
    const paymentClient = new Payment(client)

    const payment = await paymentClient.get({ id: body.data.id })

    const order = await Order.findOne({
      orderNumber: payment.external_reference,
      tenantId: tenant._id,
    })

    if (!order) return NextResponse.json({ received: true })

    order.payment.status = payment.status as any
    order.payment.mercadopagoData = payment as any

    if (payment.status === 'approved') {
      order.status = 'confirmed'
    } else if (payment.status === 'rejected' || payment.status === 'cancelled') {
      order.status = 'cancelled'
    }

    await order.save()

    return NextResponse.json({ received: true })
  } catch (error) {
    return NextResponse.json({ error: 'Error al procesar webhook' }, { status: 500 })
  }
}
