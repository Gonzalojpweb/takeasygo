/**
 * feature-usage.ts — cruza Order, Location y Tenant para determinar
 * qué features usa realmente cada tenant.
 *
 * Alimenta el OnboardingChecklist (pasos completados) y el
 * Nudges Engine (sugerencias de Fase 3).
 */

import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Order from '@/models/Order'
import type { Types } from 'mongoose'

export interface FeatureUsageStat {
  used: boolean
  lastUsedAt: Date | null
  usageCount: number
}

export type FeatureUsageMap = Record<string, FeatureUsageStat>

function stat(usageCount: number, lastUsedAt: Date | null): FeatureUsageStat {
  return { used: usageCount > 0, lastUsedAt: usageCount > 0 ? lastUsedAt : null, usageCount }
}

/**
 * Obtené las estadísticas de uso de features para un tenant.
 *
 * Features trackeadas:
 * - orders:        pedidos totales
 * - delivery:      pedidos con orderMode=delivery
 * - club:          pedidos que usaron puntos de fidelidad
 * - promos:        pedidos con promoSlug aplicado
 * - service_hours: sedes con horarios de atención configurados
 * - bank_data:     tenants con cuentas de transferencia cargadas
 * - reservations:  flag tenant.features.reservations
 */
export async function getFeatureUsageStats(
  tenantId: Types.ObjectId | string
): Promise<FeatureUsageMap> {
  await connectDB()

  const tid = typeof tenantId === 'string' ? tenantId : tenantId.toString()

  const [tenant, locations, orders, deliveryAgg, clubAgg, promoAgg] =
    await Promise.all([
      Tenant.findById(tid)
        .select('transferAccounts features loyalty')
        .lean<{
          transferAccounts?: unknown[]
          features?: { reservations?: boolean }
          loyalty?: { enabled?: boolean }
        }>(),
      Location.find({ tenantId: tid }).select('serviceHours').lean(),
      Order.find({ tenantId: tid })
        .select('createdAt')
        .sort({ createdAt: -1 })
        .limit(1)
        .lean<{ createdAt: Date }>(),
      Order.aggregate([
        { $match: { tenantId: toOid(tid), orderMode: 'delivery' } },
        { $group: { _id: null, count: { $sum: 1 }, last: { $max: '$createdAt' } } },
      ]),
      Order.aggregate([
        {
          $match: {
            tenantId: toOid(tid),
            $or: [
              { loyaltyPointsUsed: { $gt: 0 } },
              { loyaltyPointsCredited: true },
            ],
          },
        },
        { $group: { _id: null, count: { $sum: 1 }, last: { $max: '$createdAt' } } },
      ]),
      Order.aggregate([
        { $match: { tenantId: toOid(tid), promoSlug: { $ne: null } } },
        { $group: { _id: null, count: { $sum: 1 }, last: { $max: '$createdAt' } } },
      ]),
    ])

  const orderCount = await Order.countDocuments({ tenantId: tid })

  const serviceHoursConfigured = locations.filter((l) => {
    const sh = (l as { serviceHours?: Record<string, unknown[]> }).serviceHours
    if (!sh) return false
    return Object.values(sh).some((arr) => Array.isArray(arr) && arr.length > 0)
  }).length

  const bankAccounts = tenant?.transferAccounts?.length ?? 0

  return {
    orders: stat(orderCount, orders[0]?.createdAt ?? null),
    delivery: stat(aggCount(deliveryAgg), aggLast(deliveryAgg)),
    club: stat(aggCount(clubAgg), aggLast(clubAgg)),
    promos: stat(aggCount(promoAgg), aggLast(promoAgg)),
    service_hours: stat(serviceHoursConfigured, null),
    bank_data: stat(bankAccounts, null),
    reservations: stat(tenant?.features?.reservations ? 1 : 0, null),
  }
}

function toOid(tid: string): Types.ObjectId {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mongoose = require('mongoose')
  return new mongoose.Types.ObjectId(tid)
}

function aggCount(agg: Array<{ count: number }>): number {
  return agg[0]?.count ?? 0
}

function aggLast(agg: Array<{ last: Date | null }>): Date | null {
  return agg[0]?.last ?? null
}
