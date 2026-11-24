/**
 * POST /api/webhooks/mercadopago/display-template
 *
 * Webhook PROPIO de las compras de plantillas de Display Studio (no comparte
 * código ni ruta con los webhooks de pedidos, split o comisiones).
 * - Firma x-signature (HMAC-SHA256 con el secret de la app de plataforma):
 *   si el secret está configurado, una firma ausente o inválida se rechaza.
 * - El pago se consulta SIEMPRE a la API de MP con la cuenta de plataforma;
 *   lo que viene en el cuerpo solo dice qué pago mirar.
 * - Idempotente (applyTemplatePayment): reintentos de MP no duplican nada.
 */
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { getPlatformWebhookSecret } from '@/lib/mp-platform'
import { applyTemplatePayment } from '@/lib/display/studio/purchase'
import { validMpSignature } from '@/lib/display/studio/webhook-signature'
import { getBaseUrl } from '@/lib/site-url'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { type?: string; data?: { id?: string | number } }
  const qs = request.nextUrl.searchParams
  const paymentId = String(body.data?.id ?? qs.get('data.id') ?? '')
  const type = body.type ?? qs.get('type')
  if (type !== 'payment' || !/^\d{1,20}$/.test(paymentId)) return NextResponse.json({ received: true })
  await connectDB()
  let secret: string | null = null
  try { secret = await getPlatformWebhookSecret() } catch { secret = null }
  if (secret && !validMpSignature(request.headers.get('x-signature'), request.headers.get('x-request-id'), paymentId, secret)) {
    console.error(`[display-template-webhook] firma inválida (paymentId=${paymentId})`)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }
  try {
    const r = await applyTemplatePayment(paymentId, undefined, getBaseUrl(request))
    return NextResponse.json({ received: true, ...r })
  } catch (e) {
    console.error('[display-template-webhook]', e)
    // 500 → MP reintenta más tarde.
    return NextResponse.json({ error: 'retry' }, { status: 500 })
  }
}
