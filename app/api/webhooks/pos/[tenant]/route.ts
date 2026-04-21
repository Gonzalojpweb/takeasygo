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
 * Headers esperados:
 * - X-POS-Signature: Firma HMAC-SHA256 del body para validar autenticidad
 * - X-POS-Provider: 'fudo' | 'bistrosoft'
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    const provider = request.headers.get('x-pos-provider') as 'fudo' | 'bistrosoft'
    const signature = request.headers.get('x-pos-signature')

    if (!provider || !signature) {
      return NextResponse.json({ error: 'Missing headers' }, { status: 400 })
    }

    await connectDB()
    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // 1. Validar firma HMAC
    if (!tenant.posIntegration?.webhookSecret) {
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 400 })
    }

    const webhookSecret = decrypt(tenant.posIntegration.webhookSecret)
    const rawBody = await request.text()
    
    const hmac = crypto.createHmac('sha256', webhookSecret)
    const digest = hmac.update(rawBody).digest('hex')

    if (signature !== digest) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const payload = JSON.parse(rawBody)
    const { event, externalOrderId } = payload

    // 2. Mapear evento al estado de TakeasyGO
    const connector = getPOSConnector(provider)
    const newStatus = connector.mapEventToOrderStatus(event)

    if (!newStatus) {
      return NextResponse.json({ message: 'Event ignored' })
    }

    // 3. Buscar y actualizar la orden
    const order = await Order.findOne({ 
      tenantId: tenant._id,
      orderNumber: externalOrderId 
    })

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Evitar estados duplicados o retrocesos si es necesario
    if (order.status === newStatus) {
      return NextResponse.json({ message: 'Status already up to date' })
    }

    const oldStatus = order.status
    order.status = newStatus

    // Actualizar timestamps operativos
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
