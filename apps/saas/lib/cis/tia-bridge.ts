// ─────────────────────────────────────────────────────────────────────────────
// lib/cis/tia-bridge.ts — Conector CIS ↔ TIA (P6)
// ─────────────────────────────────────────────────────────────────────────────
// Propósito: Permitir que TIA consuma datos de CIS para correlación.
//
// P6: "CIS debe ser compatible con TIA. Yo diseñaría CIS pensando que
// algún día TIA lo va a consumir."
//
// Ejemplo P6:
//   TIA detecta: "Las bebidas tienen baja conversión"
//   CIS detecta: "234 clientes compran hamburguesas sin bebida"
//   Boom. Ahí aparece una acción real.
//
// Diseño:
// - Expone funciones que TIA puede llamar para obtener datos de clientes
// - Permite cruzar insights de restaurante con segmentos de cliente
// - No depende de TIA (TIA depende de CIS, no al revés)
// ─────────────────────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import CustomerProfile from '@/models/CustomerProfile'
import Order from '@/models/Order'
import Consumer from '@/models/Consumer'
import { escapeRegex } from '@takeasygo/business'

// ── Clientes que compraron cierto item pero no otro ──────────────────────────

export async function findCustomersWhoBoughtWithout(
  tenantId: mongoose.Types.ObjectId,
  boughtItem: string,
  missingItem: string
): Promise<{ phoneHash: string; name: string; orderCount: number }[]> {
  // Órdenes que tienen el item comprado
  const ordersWithBought = await Order.find({
    tenantId,
    'items.name': { $regex: escapeRegex(boughtItem), $options: 'i' },
    status: { $nin: ['cancelled'] },
  }).select('customer.phoneHash').lean()

  const phoneHashesWithBought = new Set(ordersWithBought.map((o: any) => o.customer?.phoneHash).filter(Boolean))

  // Órdenes que tienen el item faltante
  const ordersWithMissing = await Order.find({
    tenantId,
    'items.name': { $regex: escapeRegex(missingItem), $options: 'i' },
    status: { $nin: ['cancelled'] },
  }).select('customer.phoneHash').lean()

  const phoneHashesWithMissing = new Set(ordersWithMissing.map((o: any) => o.customer?.phoneHash).filter(Boolean))

  // Clientes que compraron A pero no B
  const targetHashes = [...phoneHashesWithBought].filter(h => !phoneHashesWithMissing.has(h))

  if (targetHashes.length === 0) return []

  // Enriquecer con datos del consumer
  const consumers = await Consumer.find({
    phoneHash: { $in: targetHashes },
    tenantIds: tenantId,
  }).lean()

  return consumers.map((c: any) => ({
    phoneHash: c.phoneHash,
    name: c.name ? c.name : 'Cliente', // No desencriptar aquí, es para uso interno
    orderCount: c.totalOrders ?? 0,
  }))
}

// ── Segmentos de clientes para un tenant ─────────────────────────────────────

export async function getSegmentDistribution(
  tenantId: mongoose.Types.ObjectId
): Promise<Record<string, number>> {
  const result = await CustomerProfile.aggregate([
    { $match: { tenantId } },
    { $group: { _id: '$segment', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ])

  const distribution: Record<string, number> = {}
  for (const r of result) {
    distribution[r._id] = r.count
  }
  return distribution
}

// ── Clientes de un segmento específico ───────────────────────────────────────

export async function getCustomersBySegment(
  tenantId: mongoose.Types.ObjectId,
  segment: string,
  limit: number = 100
): Promise<Array<{ phoneHash: string; healthScore: number; orderCount: number; totalSpent: number }>> {
  return CustomerProfile.find({ tenantId, segment })
    .select('phoneHash healthScore.total orderCount totalSpent')
    .sort({ 'healthScore.total': -1 })
    .limit(limit)
    .lean()
}

// ── Resumen de inteligencia de clientes (para TIA) ──────────────────────────

export async function getCustomerIntelligenceSummary(
  tenantId: mongoose.Types.ObjectId
): Promise<{
  totalCustomers: number
  avgHealthScore: number
  segmentDistribution: Record<string, number>
  atRiskCount: number
  dormantCount: number
  vipCount: number
}> {
  const profiles = await CustomerProfile.find({ tenantId })
    .select('segment healthScore.total')
    .lean()

  const segmentDistribution: Record<string, number> = {}
  let totalHealth = 0
  let atRisk = 0
  let dormant = 0
  let vip = 0

  for (const p of profiles) {
    segmentDistribution[p.segment] = (segmentDistribution[p.segment] ?? 0) + 1
    totalHealth += p.healthScore.total
    if (p.segment === 'AT_RISK') atRisk++
    if (p.segment === 'DORMANT') dormant++
    if (p.segment === 'VIP') vip++
  }

  return {
    totalCustomers: profiles.length,
    avgHealthScore: profiles.length > 0 ? Math.round(totalHealth / profiles.length) : 0,
    segmentDistribution,
    atRiskCount: atRisk,
    dormantCount: dormant,
    vipCount: vip,
  }
}
