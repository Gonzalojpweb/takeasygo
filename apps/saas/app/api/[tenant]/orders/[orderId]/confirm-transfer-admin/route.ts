import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { injectOrderToPOS } from '@/lib/pos/inject-order'
import { addPointsFromOrder, processRewardDeduction } from '@/lib/loyalty'
import { confirmOrderPayment } from '@/lib/sync-layer'
import { finalizeHiddenRewardClaims } from '@/lib/hidden-rewards'
import { incrementCommissionBalance } from '@/lib/commission-balance'

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
    if (authError) {
      const { getSessionUser } = await import('@/lib/apiAuth')
      const debugUser = await getSessionUser(request)
      console.log(`[CONFIRM-DBG] tenant._id="${tenant._id.toString()}" user.tenantId="${debugUser?.tenantId}" user.role="${debugUser?.role}"`)
      return authError
    }

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

    // prev del ORDER status, capturado antes de mutar (criterio único:
    // lib/events-server.ts) — el guard de arriba ya asegura transición.
    const previousStatus = order.status

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

    finalizeHiddenRewardClaims(order._id, order.customerPhoneHash).catch(() => {})

    // checkout_completed (gate becameCompleted + dedup atómico por orderId)
    const { captureCheckoutCompletedFromOrder } = await import('@/lib/events-server')
    await captureCheckoutCompletedFromOrder(order, tenant._id, previousStatus).catch(err =>
      console.error('[confirm-transfer-admin] checkout_completed event error:', err)
    )
    // Solo generar printJobs si no se generaron ya al confirmar el cliente
    const hasPendingPrintJobs = order.printJobs?.some(j => j.status === 'pending')
    if (!hasPendingPrintJobs) {
      const { onOrderConfirmed } = await import('@/lib/printing')
      onOrderConfirmed(order).catch(() => {})
    }

    // ── Acumular comisión en balance del tenant (idempotente vía flag) ──
    // Nota: platformFeeAmount es 0 para órdenes takeaway (solo delivery genera comisión).
    await incrementCommissionBalance(order._id, tenant._id, order.payment?.platformFeeAmount || 0)

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
