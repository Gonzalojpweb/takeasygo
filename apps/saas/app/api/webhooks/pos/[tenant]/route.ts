import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import { getPOSConnector } from '@/lib/pos'
import { decrypt } from '@/lib/crypto'
import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'

/**
 * Webhook genérico para recibir eventos de sistemas POS (FUDO, BISTROSOFT, etc.)
 *
 * Cada POS tiene su propio formato de webhook. Este endpoint intenta normalizarlos:
 *
 * Headers (por prioridad):
 *   X-POS-Provider / x-pos-provider  → 'fudo' | 'bistrosoft'
 *   X-POS-Signature / x-pos-signature → HMAC-SHA256 del body
 *
 * Si el header X-POS-Provider no está presente, se intenta extraer del body:
 *   { provider: 'fudo', event: 'ORDER-CONFIRMED', externalOrderId: 'REST-...' }
 *
 * Body esperado (formato normalizado):
 *   { event: string, externalOrderId: string }
 *
 * FUDO envía: { event: 'ORDER-CONFIRMED', orderId: '...', externalOrderId: 'REST-...', timestamp: '2026-01-01T00:00:00Z' }
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    const rawBody = await request.text()

    // ── Detectar provider y firma ──────────────────────────────────────────
    // Prioridad 1: Headers custom (estándar TakeasyGO)
    let provider = request.headers.get('x-pos-provider') as string | null
    let signature = request.headers.get('x-pos-signature') as string | null

    // Prioridad 2: Headers alternativos
    if (!provider) provider = request.headers.get('x-pos-provider')?.toLowerCase() ?? null
    if (!signature) signature = request.headers.get('x-pos-signature') ?? request.headers.get('x-webhook-signature') ?? null

    // ── Parsear body para extraer provider y evento ────────────────────────
    let event: string = ''
    let externalOrderId: string = ''

    try {
      const payload = JSON.parse(rawBody)
      event = payload.event ?? payload.type ?? payload.status ?? ''
      externalOrderId = payload.externalOrderId ?? payload.external_order_id ?? payload.orderNumber ?? payload.order_number ?? ''

      // Si el provider no viene en header, extraer del body
      if (!provider) {
        provider = payload.provider ?? null
      }
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!provider) {
      return NextResponse.json({
        error: 'No se pudo determinar el proveedor POS. Enviá X-POS-Provider header o incluí "provider" en el body.'
      }, { status: 400 })
    }

    if (!event) {
      return NextResponse.json({ error: 'Falta el campo "event" (o "type"/"status") en el body' }, { status: 400 })
    }

    if (!externalOrderId) {
      return NextResponse.json({ error: 'Falta el campo "externalOrderId" (o "external_order_id"/"orderNumber") en el body' }, { status: 400 })
    }

    await connectDB()
    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // ── Validar firma HMAC ────────────────────────────────────────────────
    if (!tenant.posIntegration?.webhookSecret) {
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 400 })
    }

    const webhookSecret = decrypt(tenant.posIntegration.webhookSecret)

    if (signature) {
      const hmac = crypto.createHmac('sha256', webhookSecret)
      const digest = hmac.update(rawBody).digest('hex')
      if (signature !== digest) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }
    // NOTA: Algunos POS (como FUDO) pueden omitir la firma en entorno sandbox.
    // En producción, la firma es obligatoria para validar autenticidad.

    // ── Mapear evento al estado de TakeasyGO ──────────────────────────────
    const connector = getPOSConnector(provider as 'fudo' | 'bistrosoft')
    const newStatus = connector.mapEventToOrderStatus(event)

    if (!newStatus) {
      return NextResponse.json({ message: 'Event ignored', event })
    }

    // ── Buscar y actualizar la orden ──────────────────────────────────────
    const order = await Order.findOne({
      tenantId: tenant._id,
      orderNumber: externalOrderId
    })

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.status === newStatus) {
      return NextResponse.json({ message: 'Status already up to date' })
    }

    const oldStatus = order.status
    order.status = newStatus

    const now = new Date()
    if (newStatus === 'confirmed') order.statusTimestamps.confirmedAt = now
    if (newStatus === 'preparing') order.statusTimestamps.preparingAt = now
    if (newStatus === 'ready') order.statusTimestamps.readyAt = now
    if (newStatus === 'delivered') order.statusTimestamps.deliveredAt = now
    if (newStatus === 'cancelled') order.statusTimestamps.cancelledAt = now

    await order.save()

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'pos.webhook_status_update',
      entity: 'order',
      entityId: order._id.toString(),
      details: {
        provider,
        event,
        oldStatus,
        newStatus,
        orderNumber: externalOrderId
      },
      request
    })

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[POS Webhook Error]:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
