/**
 * Desglose de los envíos Rapiboy (solo superadmin).
 *
 * GET /api/superadmin/rapiboy-envios?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Por cada pedido con envío Rapiboy: qué pagó el cliente por el envío, cuánto
 * es para Rapiboy, cuál es la comisión de envío de TakeasyGO, la comisión del
 * pedido y cómo se cobra (split de Mercado Pago o saldo semanal).
 * Sin datos de consumidores: solo número de pedido, comercio y montos.
 */

import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { requireSuperAdmin } from '@/lib/apiAuth'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import { buildRapiboyBreakdown, type RapiboyOrderLike } from '@/lib/rapiboy/breakdown'

const MAX_ROWS = 1000

function parseDay(v: string | null, fallback: Date): Date {
  if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(`${v}T00:00:00-03:00`)
    if (!Number.isNaN(d.getTime())) return d
  }
  return fallback
}

export async function GET(request: NextRequest) {
  const authError = await requireSuperAdmin()
  if (authError) return authError

  try {
    await connectDB()
    const now = new Date()
    const sp = request.nextUrl.searchParams
    const from = parseDay(sp.get('from'), new Date(now.getFullYear(), now.getMonth(), 1))
    const toStart = parseDay(sp.get('to'), now)
    const to = new Date(toStart.getTime() + 24 * 60 * 60 * 1000)

    const orders = await Order.find({
      'deliveryProvider.type': 'rapiboy',
      createdAt: { $gte: from, $lt: to },
    })
      .select('tenantId orderNumber createdAt status deliveryCost payment.method payment.status payment.platformFeeAmount payment.deliveryPlatformFeeAmount payment.mercadopagoId deliveryProvider.rapiboy.checkoutCost deliveryProvider.rapiboy.quotedCost deliveryProvider.rapiboy.tripId deliveryProvider.rapiboy.transferBuffer deliveryProvider.rapiboy.platformFeePercent deliveryProvider.rapiboy.quoteStatus deliveryProvider.rapiboy.phase')
      .sort({ createdAt: -1 })
      .limit(MAX_ROWS + 1)
      .lean<RapiboyOrderLike[]>()

    const truncated = orders.length > MAX_ROWS
    const rows = truncated ? orders.slice(0, MAX_ROWS) : orders

    const tenantIds = [...new Set(rows.map((o) => String(o.tenantId)))]
    const tenants = await Tenant.find({ _id: { $in: tenantIds } }).select('name slug').lean<Array<{ _id: unknown; name: string; slug: string }>>()
    const names = new Map(tenants.map((t) => [String(t._id), { name: t.name, slug: t.slug }]))

    const breakdown = buildRapiboyBreakdown(rows, names)
    return NextResponse.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      truncated,
      ...breakdown,
    })
  } catch (error) {
    console.error('[superadmin/rapiboy-envios] error:', (error as Error)?.message)
    return NextResponse.json({ error: 'No se pudo cargar el desglose de envíos' }, { status: 500 })
  }
}
