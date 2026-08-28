/**
 * Cron Job: Reconciliación de efectivo — alerta diaria de pedidos no cobrados
 *
 * Detecta pedidos en efectivo que están confirmados pero no cobrados.
 * Si hay huérfanos, envía push al admin del tenant (reusa sendBulkPush).
 * Corre una vez al día.
 *
 * URL: /api/cron/cash-reconciliation
 * Método: GET (con header Authorization: Bearer CRON_SECRET)
 */

import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import PushSubscription from '@/models/PushSubscription'
import { sendBulkPush } from '@/lib/push'
import { NextRequest, NextResponse } from 'next/server'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    const tenants = await Tenant.find({
      isActive: true,
      'cash.enabled': true,
      'features.cashPaymentEnabledBySuperadmin': true,
      plan: 'full',
    })
      .select('name slug plan features cash')
      .lean()

    const results: Array<{
      tenantId: string
      tenantName: string
      orphanCount: number
      pushSent: boolean
    }> = []

    for (const tenant of tenants) {
      const tenantId = tenant._id.toString()

      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - 7)

      const orphans = await Order.find({
        tenantId: tenant._id,
        'payment.method': 'cash',
        'payment.status': 'approved',
        'payment.cashAdjustmentApplied': { $ne: true },
        status: { $in: ['confirmed', 'preparing', 'ready', 'delivered'] },
        createdAt: { $gte: cutoffDate },
        deletedAt: null,
      })
        .select('orderNumber total')
        .lean()

      if (orphans.length === 0) {
        results.push({
          tenantId,
          tenantName: tenant.name,
          orphanCount: 0,
          pushSent: false,
        })
        continue
      }

      // Enviar push al admin
      let pushSent = false
      try {
        const subs = await PushSubscription.find({ tenantId }).lean()
        if (subs.length > 0) {
          const totalAmount = orphans.reduce((sum, o) => sum + (o.total || 0), 0)
          const formattedTotal = new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
          }).format(totalAmount / 100)

          const title = `⚠️ Efectivo no cobrado — ${tenant.name}`
          const body = `${orphans.length} pedido(s) confirmado(s) sin cobrar. Monto: ${formattedTotal}`
          const url = `/${tenant.slug}/admin`

          await sendBulkPush(subs, title, body, url)
          pushSent = true
        }
      } catch (err) {
        console.error(`[cash-reconciliation] Push failed for tenant ${tenant.name}:`, err)
      }

      results.push({
        tenantId,
        tenantName: tenant.name,
        orphanCount: orphans.length,
        pushSent,
      })
    }

    const tenantsWithOrphans = results.filter(r => r.orphanCount > 0).length

    console.log(
      `[cash-reconciliation] Done. ${tenantsWithOrphans}/${tenants.length} tenants with orphaned cash orders.`
    )

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      tenantsChecked: tenants.length,
      tenantsWithOrphans,
      results,
    })
  } catch (error) {
    console.error('[cash-reconciliation] Error:', error)
    return NextResponse.json(
      { error: 'Error ejecutando cron job', details: String(error) },
      { status: 500 },
    )
  }
}
