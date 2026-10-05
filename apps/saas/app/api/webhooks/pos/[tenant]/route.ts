import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import { getPOSConnector } from '@/lib/pos'
import { decrypt } from '@/lib/crypto'
import { NextRequest, NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { verifyPosWebhookSignature } from '@/lib/pos-webhook-signature'

/**
 * Webhook genérico para recibir eventos de sistemas POS (FUDO, BISTROSOFT, etc.)
 *
 * Cada POS tiene su propio formato de webhook. Este endpoint intenta normalizarlos:
 *
 * Headers (por prioridad):
 *   X-POS-Provider / x-pos-provider  → 'fudo' | 'bistrosoft'
 *   X-POS-Signature / x-pos-signature (alias X-Webhook-Signature)
 *     → HMAC-SHA256 en hex del rawBody, con el webhookSecret del tenant.
 *       OBLIGATORIA: sin header se responde 401 antes de tocar la DB.
 *
 * El body debe incluir `timestamp` (ISO, unix seconds o unix ms) dentro de
 * ±300s respecto de ahora (anti-replay); al ir dentro del body firmado no
 * puede manipularse sin romper la firma.
 *
 * Excepción sandbox (FUDO puede omitir la firma): solo con la env
 * POS_WEBHOOK_ALLOW_UNSIGNED=1 explícita en el entorno; una firma presente
 * pero inválida se rechaza igual.
 *
 * Si el header X-POS-Provider no está presente, se intenta extraer del body:
 *   { provider: 'fudo', event: 'ORDER-CONFIRMED', externalOrderId: 'REST-...' }
 *
 * Body esperado (formato normalizado):
 *   { event: string, externalOrderId: string, timestamp: string }
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

    // Firma obligatoria: se rechaza ANTES de parsear el body o tocar la DB.
    // El sandbox de FUDO (puede omitirla) solo se habilita con env explícita.
    const allowUnsigned = ['1', 'true'].includes(
      (process.env.POS_WEBHOOK_ALLOW_UNSIGNED ?? '').toLowerCase()
    )
    if (!signature && !allowUnsigned) {
      return NextResponse.json({ error: 'Firma requerida' }, { status: 401 })
    }

    // ── Parsear body para extraer provider y evento ────────────────────────
    let event: string = ''
    let externalOrderId: string = ''
    let bodyTimestamp: unknown = undefined

    try {
      const payload = JSON.parse(rawBody)
      bodyTimestamp = payload.timestamp
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

    const verdict = verifyPosWebhookSignature({
      rawBody,
      signature,
      timestamp: bodyTimestamp,
      secret: webhookSecret,
      allowUnsigned,
    })
    if (!verdict.ok) {
      return NextResponse.json({ error: verdict.error }, { status: verdict.status })
    }
    if (verdict.unsigned) {
      console.warn(
        `[POS Webhook] firma omitida (POS_WEBHOOK_ALLOW_UNSIGNED) tenant=${tenantSlug}`
      )
    }

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

    // Cobro en efectivo: pending → approved SOLO al entregar (la venta en
    // caja se registra post-save, en el mismo momento).
    let cashSaleToRegister = false
    if (
      newStatus === 'delivered' &&
      order.payment?.method === 'cash' &&
      order.payment.status === 'pending'
    ) {
      order.payment.status = 'approved'
      cashSaleToRegister = true
    }

    const now = new Date()
    if (newStatus === 'confirmed') order.statusTimestamps.confirmedAt = now
    if (newStatus === 'preparing') order.statusTimestamps.preparingAt = now
    if (newStatus === 'ready') order.statusTimestamps.readyAt = now
    if (newStatus === 'delivered') order.statusTimestamps.deliveredAt = now
    if (newStatus === 'cancelled') order.statusTimestamps.cancelledAt = now

    // Impresión en cocina diferida (flujo cash): el webhook no tiene UI de
    // cajero → imprimir por defecto al entrar a preparing; al cancelar solo
    // limpiar el flag (sin comanda nueva).
    if ((newStatus === 'preparing' && oldStatus === 'confirmed') || newStatus === 'cancelled') {
      const { settleDeferredKitchenPrint } = await import('@/lib/printing')
      await settleDeferredKitchenPrint(order, { print: newStatus !== 'cancelled' })
    }

    await order.save()

    // Cobro en efectivo concretado al entregar: registrar venta en caja + CIS.
    if (cashSaleToRegister) {
      const { registerCashSaleOnDelivery } = await import('@/lib/order-side-effects')
      registerCashSaleOnDelivery({ order, tenant })
    }

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
