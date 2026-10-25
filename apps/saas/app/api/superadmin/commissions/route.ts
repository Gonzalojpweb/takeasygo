import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import CommissionSettlement from '@/models/CommissionSettlement'
import mongoose from 'mongoose'
import WeeklyCommissionStatement from '@/models/WeeklyCommissionStatement'
import { syncWeeklyStatements, weekBounds, weekKeyOf } from '@/lib/commission-weeks'
import { addDaysToDateStr, getDayAndMidnightInTimezone } from '@/lib/restaurant-time'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { toPesos } from '@takeasygo/business'

export async function GET(request: NextRequest) {
  const authError = await requireSuperAdmin()
  if (authError) return authError

  await connectDB()

  const { searchParams } = new URL(request.url)
  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')

  // Parse "YYYY-MM-DD" as local date (new Date("YYYY-MM-DD") parses as UTC, causing off-by-one)
  const parseLocal = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, (m ?? 1) - 1, d ?? 1)
  }

  const now = new Date()
  const from = fromParam ? parseLocal(fromParam) : new Date(now.getFullYear(), now.getMonth(), 1)
  const to = toParam ? parseLocal(toParam) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  // Get all tenants
  const tenants = await Tenant.find({ isActive: true, status: 'active' }).select('name slug').lean()

  // Get settlements in range to subtract
  const settlements = await CommissionSettlement.find({
    from: { $lte: to },
    to: { $gte: from },
  }).lean()

  const settlementMap = new Map<string, number>()
  for (const s of settlements) {
    const key = s.tenantId.toString()
    settlementMap.set(key, (settlementMap.get(key) || 0) + s.amountCollected)
  }

  // Get commission totals per tenant
  const tenantResults = await Promise.all(
    tenants.map(async (tenant) => {
      const agg = await Order.aggregate([
        {
          $match: {
            tenantId: tenant._id,
            deletedAt: null,
            status: { $ne: 'cancelled' },
            'payment.status': 'approved',
            createdAt: { $gte: from, $lte: to },
          },
        },
        {
          $group: {
            _id: '$payment.method',
            total: { $sum: '$payment.platformFeeAmount' },
            count: { $sum: 1 },
            orderIds: { $push: { _id: '$_id', platformFeeAmount: '$payment.platformFeeAmount', method: '$payment.method' } },
          },
        },
      ])

      let total = 0
      let transfer = 0
      let cash = 0
      let mercadopago = 0
      let kripton = 0

      for (const a of agg) {
        total += a.total
        if (a._id === 'transfer') transfer = a.total
        if (a._id === 'cash') cash = a.total
        if (a._id === 'mercadopago') mercadopago = a.total
        if (a._id === 'kripton') kripton = a.total
      }

      const settled = settlementMap.get(tenant._id.toString()) || 0
      const pending = total - settled

      return {
        tenantId: tenant._id.toString(),
        name: tenant.name,
        slug: tenant.slug,
        total: toPesos(total),
        pending: toPesos(pending),
        settled: toPesos(settled),
        breakdown: {
          transfer: toPesos(transfer),
          cash: toPesos(cash),
          mercadopago: toPesos(mercadopago),
          kripton: toPesos(kripton),
        },
      }
    })
  )

  return NextResponse.json({
    from: from.toISOString(),
    to: to.toISOString(),
    tenants: tenantResults,
  })
}

export async function POST(request: NextRequest) {
  const authError = await requireSuperAdmin()
  if (authError) return authError

  await connectDB()

  const body = await request.json()
  const { tenantId, from, to, notes, statementId, all } = body as {
    tenantId: string
    from: string
    to: string
    notes?: string
    statementId?: string
    /** Toda la deuda impaga hasta ahora (incluida la semana en curso): pago recibido fuera de la plataforma. */
    all?: boolean
  }

  if (!tenantId || !mongoose.Types.ObjectId.isValid(tenantId) || ((!from || !to) && !statementId && all !== true)) {
    return NextResponse.json({ error: 'tenantId y (statementId, from/to o all) requeridos' }, { status: 400 })
  }

  // Rango a saldar, en HORA ARGENTINA. Con statementId: exactamente esa
  // semana (lunes 00:00 → domingo 23:59:59). Antes se hacía setHours en la
  // hora del servidor (UTC) y marcar una semana podía saldar también
  // pedidos del lunes siguiente.
  let fromDate: Date
  let toDate: Date
  if (all === true) {
    // Todo lo impago hasta este momento (los pedidos ya saldados se excluyen
    // abajo): habilita de nuevo las transferencias del comercio.
    fromDate = new Date(0)
    toDate = new Date()
  } else if (statementId) {
    if (!mongoose.Types.ObjectId.isValid(statementId)) return NextResponse.json({ error: 'statementId inválido' }, { status: 400 })
    const stmt = await WeeklyCommissionStatement.findOne({ _id: statementId, tenantId }).select('weekStart').lean<{ weekStart: Date } | null>()
    if (!stmt) return NextResponse.json({ error: 'Semana no encontrada' }, { status: 404 })
    const bounds = weekBounds(weekKeyOf(stmt.weekStart))
    fromDate = bounds.weekStart
    toDate = new Date(bounds.weekEnd.getTime() - 1)
  } else {
    fromDate = /^\d{4}-\d{2}-\d{2}$/.test(from) ? getDayAndMidnightInTimezone(from).date : new Date(from)
    toDate = /^\d{4}-\d{2}-\d{2}$/.test(to)
      ? new Date(getDayAndMidnightInTimezone(addDaysToDateStr(to, 1)).date.getTime() - 1)
      : new Date(to)
  }
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
    return NextResponse.json({ error: 'Rango inválido' }, { status: 400 })
  }

  // Pedidos ya saldados por CUALQUIER pago del comercio (no solo los que se
  // solapan en fechas): nunca se cobra dos veces el mismo pedido.
  const existingSettlements = await CommissionSettlement.find({ tenantId }).select('orderIds').lean()

  const settledOrderIds = new Set<string>()
  for (const s of existingSettlements) {
    for (const id of s.orderIds) settledOrderIds.add(id)
  }

  // Solo medios manuales con comisión (transferencia y efectivo): las de
  // MercadoPago se cobran solas en cada pago; sumarlas acá inflaba lo
  // "cobrado" (bug corregido).
  const orders = await Order.find({
    tenantId,
    deletedAt: null,
    status: { $ne: 'cancelled' },
    'payment.status': 'approved',
    'payment.method': { $in: ['transfer', 'cash'] },
    'payment.platformFeeAmount': { $gt: 0 },
    createdAt: { $gte: fromDate, $lte: toDate },
    _id: { $nin: Array.from(settledOrderIds) },
  }).select('_id payment.platformFeeAmount payment.method').lean()

  if (orders.length === 0) {
    return NextResponse.json({ error: 'No hay órdenes nuevas para saldar en ese período' }, { status: 400 })
  }

  const orderIds = orders.map((o) => o._id.toString())
  const amountCollected = orders.reduce((sum, o) => sum + (o.payment?.platformFeeAmount || 0), 0)

  const session = (await import('@/lib/auth')).auth()
  const collectedBy = (await session)?.user?.email || 'superadmin'

  const settlement = await CommissionSettlement.create({
    tenantId,
    from: fromDate,
    to: toDate,
    amountCollected,
    collectedAt: new Date(),
    collectedBy,
    notes: notes || `Saldado ${fromDate.toLocaleDateString('es-AR')} - ${toDate.toLocaleDateString('es-AR')}`,
    orderIds,
    status: 'paid',
  })

  // Semanas: el estado sale de lo realmente saldado (fuente única). Una
  // semana se marca pagada solo si TODOS sus pedidos quedaron cubiertos.
  // (`statementId` se acepta por compatibilidad, pero ya no fuerza el estado.)
  void statementId
  await syncWeeklyStatements(tenantId, { paidBy: collectedBy })

  // Resetear commissionBalance.transfer del tenant (el admin ya pagó)
  await Tenant.findOneAndUpdate(
    { _id: tenantId },
    { $inc: { 'commissionBalance.transfer': -amountCollected } }
  )

  // Limpiar el flag de idempotencia en las órdenes saldadas — si luego se cancelan,
  // no deben revertir un balance que ya fue cobrado.
  await Order.updateMany(
    { _id: { $in: orders.map(o => o._id) } },
    { $set: { 'payment.commissionBalanceAdded': false } }
  )

  return NextResponse.json({
    settlement: {
      _id: settlement._id.toString(),
      tenantId: settlement.tenantId.toString(),
      from: settlement.from,
      to: settlement.to,
      amountCollected: toPesos(settlement.amountCollected),
      collectedAt: settlement.collectedAt,
      collectedBy: settlement.collectedBy,
      notes: settlement.notes,
      orderIds: settlement.orderIds,
      orderCount: orders.length,
    },
  })
}