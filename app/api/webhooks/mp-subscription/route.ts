import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { getPlatformMPClient, getPlatformWebhookSecret, type BillablePlan } from '@/lib/mp-platform'

/**
 * Verifica la firma HMAC-SHA256 del webhook de MercadoPago.
 * Mismo algoritmo que el webhook de pagos por orden.
 */
function verifySignature(
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

  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'))
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    // Leer webhook secret desde DB
    let webhookSecret: string
    try {
      webhookSecret = await getPlatformWebhookSecret()
    } catch {
      return NextResponse.json({ error: 'Webhook no configurado' }, { status: 500 })
    }

    const body = await request.json()

    // Solo procesar eventos de preapproval (suscripcion)
    if (body.type !== 'subscription_preapproval') {
      return NextResponse.json({ received: true })
    }

    const signatureHeader = request.headers.get('x-signature')
    const requestId = request.headers.get('x-request-id')
    const dataId = body.data?.id

    const isValid = verifySignature(signatureHeader, requestId, dataId, webhookSecret!)
    if (!isValid) {
      return NextResponse.json({ error: 'Firma invalida' }, { status: 401 })
    }

    // Obtener el preapproval de MP
    const { preApproval } = await getPlatformMPClient()
    const sub = await preApproval.get({ id: dataId })

    const externalRef = (sub as any).external_reference ?? ''
    // formato: "{tenantId}:{plan}"
    const [tenantId, planKey] = externalRef.split(':')
    if (!tenantId || !planKey) {
      return NextResponse.json({ received: true })
    }

    await connectDB()
    const tenant = await Tenant.findById(tenantId)
    if (!tenant) return NextResponse.json({ received: true })

    const subStatus = (sub as any).status as string

    // Calcular próxima fecha de facturación
    const nextBilling = (sub as any).next_payment_date
      ? new Date((sub as any).next_payment_date)
      : null

    if (subStatus === 'authorized') {
      tenant.plan = planKey as BillablePlan
      tenant.subscription = {
        preapprovalId: dataId,
        status: 'authorized',
        plan: planKey as BillablePlan,
        nextBillingDate: nextBilling,
        lastUpdated: new Date(),
      }
    } else if (subStatus === 'paused') {
      tenant.subscription.status = 'paused'
      tenant.subscription.lastUpdated = new Date()
    } else if (subStatus === 'cancelled') {
      tenant.subscription.status = 'cancelled'
      tenant.subscription.lastUpdated = new Date()
      // Al cancelar, bajar al plan try
      tenant.plan = 'try'
    }

    await tenant.save()

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[webhook/mp-subscription]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
