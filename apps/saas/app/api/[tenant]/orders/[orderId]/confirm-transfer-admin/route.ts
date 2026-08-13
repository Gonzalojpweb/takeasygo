import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { injectOrderToPOS } from '@/lib/pos/inject-order'
import { addPointsFromOrder, processRewardDeduction } from '@/lib/loyalty'
import { confirmOrderPayment } from '@/lib/sync-layer'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // Aplicar defaults para tenants creados antes de pointsConfig
    if (!tenant.pointsConfig) {
      (tenant as any).pointsConfig = {
        enabled: true,
        mode: 'fixed_per_currency',
        pointsPerCurrency: 0.1,
        pointsPercentage: 10,
        pointsPerOrder: 0,
        minOrderForPoints: 0,
        pointsRedemptionValue: 10,
        redemptionEnabled: true,
      }
    }

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
    if (!order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    }

    if (order.payment.method !== 'transfer') {
      return NextResponse.json({ error: 'Esta orden no es de tipo transferencia' }, { status: 400 })
    }

    if (order.status !== 'awaiting_confirmation' && order.status !== 'awaiting_payment') {
      return NextResponse.json({ error: 'El pedido no está esperando confirmación' }, { status: 400 })
    }

    order.status = 'confirmed'
    order.payment.status = 'approved'
    order.payment.transferConfirmed = true
    order.payment.transferConfirmedAt = new Date()
    order.payment.transferConfirmedBy = request.headers.get('x-user-email') || 'admin'
    order.statusTimestamps.confirmedAt = new Date()

    // Calcular estimatedReadyAt
    const location = await Location.findById(order.locationId).lean() as any
    if (location?.settings?.estimatedPickupTime) {
      order.statusTimestamps.estimatedReadyAt = new Date(Date.now() + location.settings.estimatedPickupTime * 60_000)
    }

    await order.save()

    // ── Lealtad: procesar deducción de rewards y acreditar puntos ──────
    if (order.customer?.phoneHash) {
      if (order.rewardItems && order.rewardItems.length > 0) {
        await processRewardDeduction(order, tenant)
      }
      await addPointsFromOrder(order, tenant)
    }

    // ── Inyección POS (fire-and-forget) ──────────────────────────────
    if (tenant.posIntegration?.enabled) {
      setImmediate(() => {
        injectOrderToPOS(order._id.toString(), tenant).catch(err =>
          console.error('[POS inject] Error asíncrono en transferencia:', err)
        )
      })
    }

    // ── SyncLayer: confirmar orden + notificar venta ──────────
    setImmediate(() => {
      confirmOrderPayment(order, tenant).catch(err =>
        console.error('[sync-layer] confirmOrderPayment error (transfer):', err)
      )
    })

    return NextResponse.json({
      status: order.status,
      estimatedReadyAt: order.statusTimestamps.estimatedReadyAt,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
