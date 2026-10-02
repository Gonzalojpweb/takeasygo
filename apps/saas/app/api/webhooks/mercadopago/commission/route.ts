import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import CommissionSettlement from '@/models/CommissionSettlement'
import ProcessedWebhookEvents from '@/models/ProcessedWebhookEvents'
import { getPlatformMPClient } from '@/lib/mp-platform'
import { Payment } from 'mercadopago'
import { NextRequest, NextResponse } from 'next/server'
import { toPesos } from '@takeasygo/business'

/**
 * POST /api/webhooks/mercadopago/commission
 *
 * Webhook para pagos de comisiones de TakeasyGO (external_reference: commission:...).
 * Cuando un admin paga sus comisiones vía MP:
 *  1. Verifica el pago contra la API de MP
 *  2. Crea un CommissionSettlement
 *  3. Decrementa tenant.commissionBalance.transfer
 *  4. Limpia el flag payment.commissionBalanceAdded en las órdenes saldadas
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { type, data } = body as { type?: string; data?: { id?: string } }

    // Solo procesar notificaciones de pago
    if (type !== 'payment') {
      return NextResponse.json({ received: true })
    }

    const paymentId = data?.id
    if (!paymentId) {
      return NextResponse.json({ received: true })
    }

    await connectDB()

    // Deduplicar
    const dedupKey = `commission-payment-${paymentId}`
    const alreadyProcessed = await ProcessedWebhookEvents.findOne({ requestId: dedupKey })
    if (alreadyProcessed) {
      return NextResponse.json({ received: true, duplicated: true })
    }

    // Obtener el pago de MP con credenciales de plataforma
    const { client } = await getPlatformMPClient()
    const payment = new Payment(client)
    const paymentData = await payment.get({ id: paymentId })

    if (paymentData.status !== 'approved') {
      return NextResponse.json({ received: true, status: paymentData.status })
    }

    const extRef = paymentData.external_reference
    if (!extRef?.startsWith('commission:')) {
      return NextResponse.json({ received: true, ignored: true })
    }

    // Formato: commission:{tenantId}:{from}:{to}
    const parts = extRef.split(':')
    if (parts.length !== 4) {
      console.error('[commission-webhook] Invalid external_reference format:', extRef)
      return NextResponse.json({ error: 'Invalid reference' }, { status: 400 })
    }

    const [, tenantId, fromStr, toStr] = parts
    const fromDate = new Date(fromStr)
    const toDate = new Date(toStr)
    toDate.setHours(23, 59, 59, 999)

    const tenant = await Tenant.findById(tenantId)
    if (!tenant) {
      console.error('[commission-webhook] Tenant not found:', tenantId)
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // Obtener órdenes no saldadas en el rango (mismo filtro que el pay route)
    const existingSettlements = await CommissionSettlement.find({
      tenantId: tenant._id,
      from: { $lte: toDate },
      to: { $gte: fromDate },
    }).lean()

    const settledOrderIds = new Set<string>()
    for (const s of existingSettlements) {
      for (const id of s.orderIds) settledOrderIds.add(id)
    }

    const orders = await Order.find({
      tenantId: tenant._id,
      deletedAt: null,
      status: { $ne: 'cancelled' },
      'payment.status': 'approved',
      'payment.method': 'transfer',
      createdAt: { $gte: fromDate, $lte: toDate },
      _id: { $nin: Array.from(settledOrderIds) },
    }).select('_id payment.platformFeeAmount').lean()

    if (orders.length === 0) {
      console.log('[commission-webhook] No unsettled orders for', tenant.slug, extRef)
      return NextResponse.json({ received: true, noOrders: true })
    }

    const amountCollected = orders.reduce((sum, o) => sum + (o.payment?.platformFeeAmount || 0), 0)

    // Crear settlement (idempotente por dedup ya procesado arriba)
    await CommissionSettlement.create({
      tenantId: tenant._id,
      from: fromDate,
      to: toDate,
      amountCollected,
      collectedAt: new Date(),
      collectedBy: `mp-payment-${paymentId}`,
      notes: `Pago MP comisiones — ${paymentData.transaction_amount} ARS (ext: ${extRef})`,
      orderIds: orders.map(o => o._id.toString()),
      status: 'paid',
    })

    // Decrementar balance
    await Tenant.updateOne(
      { _id: tenant._id },
      { $inc: { 'commissionBalance.transfer': -amountCollected } },
    )

    // Limpiar flag de idempotencia en las órdenes saldadas
    await Order.updateMany(
      { _id: { $in: orders.map(o => o._id) } },
      { $set: { 'payment.commissionBalanceAdded': false } },
    )

    // Registrar como procesado
    await ProcessedWebhookEvents.create({
      requestId: dedupKey,
    }).catch(() => {})

    console.log(
      `[commission-webhook] Settled ${orders.length} orders for ${tenant.slug}: ` +
      `$${toPesos(amountCollected)} (MP payment ${paymentId})`,
    )

    return NextResponse.json({ received: true, settled: orders.length, amount: toPesos(amountCollected) })
  } catch (error: any) {
    console.error('[commission-webhook] Error:', error)
    // Return 200 to prevent MP from retrying forever on non-retryable errors
    return NextResponse.json({ error: error?.message || 'Error' }, { status: 200 })
  }
}
