/**
 * Cron Job: Compliance Sweep (safety net)
 *
 * Barre órdenes en estados no-terminales y verifica si alguna superó su SLA
 * sin tener una ComplianceAlert activa. Cubre edge cases donde los delayed jobs
 * de BullMQ no se dispararon (ej: SyncLayer reiniciado, transición vía webhook).
 *
 * URL: /api/cron/compliance-sweep
 * Método: GET (con header Authorization: Bearer CRON_SECRET)
 * Frecuencia: cada 5 minutos
 */

import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { ComplianceConfigModel, ComplianceAlertModel, DEFAULT_SLA_RULES } from '@takeasygo/db'
import { NextRequest, NextResponse } from 'next/server'

const CRON_SECRET = process.env.CRON_SECRET

/** Estados no-terminales que pueden violar SLA */
const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'en_ruta', 'arrived']

/** Mapa de status → siguiente status esperado */
const NEXT_STATUS: Record<string, string> = {
  pending: 'confirmed',
  confirmed: 'preparing',
  preparing: 'ready',
  ready: 'en_ruta',
  en_ruta: 'arrived',
  arrived: 'delivered',
}

/** Mapa de status → campo de timestamp */
const TIMESTAMP_FIELDS: Record<string, string> = {
  pending: 'createdAt',
  confirmed: 'confirmedAt',
  preparing: 'preparingAt',
  ready: 'readyAt',
  en_ruta: 'enRutaAt',
  arrived: 'arrivedAt',
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    // Optional: single tenant mode for piloting
    const url = new URL(request.url)
    const tenantSlug = url.searchParams.get('tenant')

    const tenantFilter: Record<string, any> = { isActive: true }
    if (tenantSlug) {
      tenantFilter.slug = tenantSlug
    }

    const tenants = await Tenant.find(tenantFilter).select('_id slug').lean()
    const results: Array<{
      tenantId: string
      tenantSlug: string
      alertsCreated: number
      alertsEscalated: number
      ordersChecked: number
    }> = []

    for (const tenant of tenants) {
      const tenantId = tenant._id.toString()
      let alertsCreated = 0
      let alertsEscalated = 0
      let ordersChecked = 0

      // Get all active orders for this tenant
      const activeOrders = await Order.find({
        tenantId: tenant._id,
        status: { $in: ACTIVE_STATUSES },
      })
        .select('orderNumber status orderMode locationId statusTimestamps createdAt')
        .lean()

      if (activeOrders.length === 0) continue

      // Get SLA configs for this tenant (global + per-location)
      const configs = await ComplianceConfigModel.find({
        tenantId: tenant._id,
        enabled: true,
      }).lean()

      const configMap = new Map<string, typeof configs[0]>()
      let globalConfig: typeof configs[0] | null = null

      for (const cfg of configs) {
        if (cfg.locationId) {
          configMap.set(cfg.locationId.toString(), cfg)
        } else {
          globalConfig = cfg
        }
      }

      for (const order of activeOrders) {
        ordersChecked++
        const locationId = order.locationId?.toString()
        const config = (locationId ? configMap.get(locationId) : null) ?? globalConfig
        const rules = config?.slaRules?.length ? config.slaRules : DEFAULT_SLA_RULES

        if (config?.pilotMode) continue // Skip L3 in pilot mode

        const nextStatus = NEXT_STATUS[order.status]
        if (!nextStatus) continue

        const tsField = TIMESTAMP_FIELDS[order.status]
        const timestamp = order.statusTimestamps?.[tsField] ?? order.createdAt
        if (!timestamp) continue

        const elapsedMinutes = Math.max(0, (Date.now() - new Date(timestamp).getTime()) / 60_000)

        // Find matching SLA rule
        const rule = rules.find(
          (r: any) =>
            r.fromStatus === order.status &&
            r.toStatus === nextStatus &&
            (r.orderMode === order.orderMode || r.orderMode === 'all')
        ) ?? rules.find(
          (r: any) =>
            r.fromStatus === order.status &&
            r.toStatus === nextStatus &&
            r.orderMode === 'all'
        )

        if (!rule) continue

        // Calculate what level should be active
        let targetLevel: 0 | 1 | 2 | 3 = 0
        if (elapsedMinutes >= rule.level3Minutes) targetLevel = 3
        else if (elapsedMinutes >= rule.level2Minutes) targetLevel = 2
        else if (elapsedMinutes >= rule.level1Minutes) targetLevel = 1

        if (targetLevel === 0) continue

        // Check for existing active alert
        const existingAlert = await ComplianceAlertModel.findOne({
          orderId: order._id,
          resolvedAt: null,
        }).lean()

        if (existingAlert) {
          // Escalate if needed
          if (targetLevel > existingAlert.level) {
            await ComplianceAlertModel.updateOne(
              { _id: existingAlert._id },
              { $set: { level: targetLevel } }
            )
            alertsEscalated++
          }
          continue
        }

        // Create new alert
        await ComplianceAlertModel.create({
          tenantId: tenant._id,
          locationId: order.locationId,
          orderId: order._id,
          orderNumber: order.orderNumber,
          fromStatus: order.status,
          toStatus: nextStatus,
          level: targetLevel,
          triggeredAt: new Date(),
          clientConfirmed: false,
        })
        alertsCreated++
      }

      if (alertsCreated > 0 || alertsEscalated > 0) {
        console.log(
          `[compliance-sweep] Tenant ${tenant.slug}: checked ${ordersChecked} orders, created ${alertsCreated} alerts, escalated ${alertsEscalated}`
        )
      }

      results.push({
        tenantId,
        tenantSlug: tenant.slug,
        alertsCreated,
        alertsEscalated,
        ordersChecked,
      })
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      tenantsChecked: tenants.length,
      results,
    })
  } catch (error) {
    console.error('[Cron:compliance-sweep] Error:', error)
    return NextResponse.json(
      { error: 'Error ejecutando compliance sweep', details: String(error) },
      { status: 500 }
    )
  }
}
