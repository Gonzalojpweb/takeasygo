/**
 * API: External Confirmation (Client → Admin escalation)
 *
 * Permite al cliente reportar que un pedido está varado sin cambiar su estado.
 * Crea o escala una ComplianceAlert con clientConfirmed: true, que sirve como:
 * - Señal de alerta temprana para el admin
 * - Indicador de calidad operativa por sede
 *
 * POST /api/[tenant]/orders/[orderId]/external-confirm
 * Header: x-tracking-token: <trackingToken>
 *
 * No requiere auth de admin — el tracking token es la credencial del cliente.
 */

import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { ComplianceAlertModel } from '@takeasygo/db'
import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'

const TRACKING_HEADER = 'x-tracking-token'
const MINUTES_STUCK_THRESHOLD = 10

/** Timestamp field for each status */
const TIMESTAMP_FIELDS: Record<string, string> = {
  pending: 'createdAt',
  confirmed: 'confirmedAt',
  preparing: 'preparingAt',
  ready: 'readyAt',
  en_ruta: 'enRutaAt',
  arrived: 'arrivedAt',
}

const TERMINAL_STATUSES = new Set(['delivered', 'cancelled'])

const NEXT_STATUS: Record<string, string> = {
  pending: 'confirmed',
  confirmed: 'preparing',
  preparing: 'ready',
  ready: 'en_ruta',
  en_ruta: 'arrived',
  arrived: 'delivered',
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params

    // Rate limit: 3 confirmaciones por hora por IP + orderId
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const { success } = await rateLimit(`ext-confirm:${tenantSlug}:${orderId}:${ip}`, 3, 3600_000)
    if (!success) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes. Intentá de nuevo más tarde.' },
        { status: 429 }
      )
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, status: { $in: ['active', 'paused'] } })
    if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
      .select('status statusTimestamps orderNumber orderMode locationId trackingToken customer')
      .lean() as any

    if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Validate tracking token
    const suppliedToken = request.headers.get(TRACKING_HEADER)
    if (!order.trackingToken || !suppliedToken || suppliedToken !== order.trackingToken) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Must not be terminal
    if (TERMINAL_STATUSES.has(order.status)) {
      return NextResponse.json(
        { error: 'El pedido ya está completado.' },
        { status: 400 }
      )
    }

    // Calculate how long the order has been stuck in current status
    const tsField = TIMESTAMP_FIELDS[order.status] || 'createdAt'
    const statusTimestamp = order.statusTimestamps?.[tsField] || order.createdAt
    const minutesStuck = Math.max(0, (Date.now() - new Date(statusTimestamp).getTime()) / 60_000)

    if (minutesStuck < MINUTES_STUCK_THRESHOLD) {
      return NextResponse.json(
        { error: `El pedido lleva ${Math.round(minutesStuck)} minutos en este estado. Esperá un poco más.` },
        { status: 400 }
      )
    }

    const nextStatus = NEXT_STATUS[order.status]
    if (!nextStatus) {
      return NextResponse.json(
        { error: 'No se puede escalar este estado.' },
        { status: 400 }
      )
    }

    const now = new Date()

    // Check for existing active alert
    const existingAlert = await ComplianceAlertModel.findOne({
      orderId: order._id,
      resolvedAt: null,
    })

    if (existingAlert) {
      // Escalate to level 2 minimum and mark as client-confirmed
      const newLevel = Math.max(existingAlert.level, 2) as 2 | 3
      existingAlert.level = newLevel
      existingAlert.clientConfirmed = true
      await existingAlert.save()

      console.log(
        `[external-confirm] ESCALATED order ${order.orderNumber} to L${newLevel} by client (${Math.round(minutesStuck)}min stuck in ${order.status})`
      )

      return NextResponse.json({
        success: true,
        message: 'Reporte enviado. El restaurante fue notificado.',
        level: newLevel,
        minutesStuck: Math.round(minutesStuck),
      })
    }

    // Create new alert at level 2 (client escalation starts at L2, not L1)
    await ComplianceAlertModel.create({
      tenantId: tenant._id,
      locationId: order.locationId,
      orderId: order._id,
      orderNumber: order.orderNumber,
      fromStatus: order.status,
      toStatus: nextStatus,
      level: 2,
      lastNotifiedLevel: null,
      triggeredAt: now,
      clientConfirmed: true,
    })

    console.log(
      `[external-confirm] NEW L2 alert for order ${order.orderNumber} by client (${Math.round(minutesStuck)}min stuck in ${order.status})`
    )

    return NextResponse.json({
      success: true,
      message: 'Reporte enviado. El restaurante fue notificado.',
      level: 2,
      minutesStuck: Math.round(minutesStuck),
    })
  } catch (error) {
    console.error('[external-confirm] Error:', error)
    return NextResponse.json(
      { error: 'Error al procesar el reporte.' },
      { status: 500 }
    )
  }
}
