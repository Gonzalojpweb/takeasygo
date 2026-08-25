/**
 * Superadmin Dashboard — Salud de la Red
 *
 * GET /api/superadmin/dashboard/salud
 *
 * Returns network health status (operandoNormalmente, requierenAtencion, etc.)
 * Uses only Tenant, Location, and Order models to avoid TDZ.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

function toDateStr(v: any): string {
  if (!v) return ''
  if (v instanceof Date) return v.toISOString()
  try { return new Date(v).toISOString() } catch { return '' }
}

function minutesSince(date: Date): number {
  return (Date.now() - date.getTime()) / 60_000
}

function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

function isOpenForTenant(loc: any, checkIsOpenNow: any): boolean {
  if (!loc?.serviceHours || !loc.timezone) return false
  const modes = ['takeaway', 'dineIn', 'delivery'] as const
  try {
    for (const mode of modes) {
      const result = checkIsOpenNow(loc.serviceHours, mode, loc.timezone)
      if (result === true) return true
      if (result === false) continue
    }
  } catch { /* malformed hours */ }
  return false
}

function isStuckOrder(order: any): { stuck: boolean; reason?: string } {
  try {
    const status = order.status
    const ts = order.statusTimestamps || {}

    if (status === 'pending') {
      const age = minutesSince(order.createdAt)
      if (age > 30) return { stuck: true, reason: `${Math.round(age)}min sin confirmar` }
    }

    if (status === 'confirmed' || status === 'preparing') {
      const refTime = status === 'confirmed' ? ts.confirmedAt : ts.preparingAt
      if (refTime && ts.estimatedReadyAt) {
        const ref = new Date(refTime).getTime()
        const est = new Date(ts.estimatedReadyAt).getTime()
        const elapsed = Date.now() - ref
        const limit = (est - ref) * 1.5
        if (elapsed > limit) {
          const pastDue = Math.round((elapsed - (est - ref)) / 60_000)
          return { stuck: true, reason: `${pastDue}min sobre estimado` }
        }
      }
    }

    if (status === 'ready' && ts.readyAt) {
      const age = minutesSince(new Date(ts.readyAt))
      if (age > 20) return { stuck: true, reason: `${Math.round(age)}min sin retirar` }
    }
  } catch { /* defensive */ }
  return { stuck: false }
}

export async function GET(request: NextRequest) {
  try {
    // Auth
    const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
    if (!secret) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const isSecure = process.env.NODE_ENV === 'production'
    const token = await getToken({ 
      req: request as any, 
      secret, 
      secureCookie: isSecure 
    })

    if (!token) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    let isSuperAdmin = token.role === 'superadmin'
    if (!isSuperAdmin && token.id) {
      const mongooseMod = await import('mongoose')
      const mongoose = mongooseMod.default ?? mongooseMod
      if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(process.env.MONGODB_URI!)
      }
      const UserMod = await import('@/models/User')
      const User = UserMod.default
      const dbUser = await User.findById(token.id).select('role').lean<{ role: string }>()
      isSuperAdmin = dbUser?.role === 'superadmin'
    }

    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    // Data imports - only Tenant, Location, and Order
    const mongooseMod = await import('mongoose')
    const mongoose = mongooseMod.default ?? mongooseMod
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI!)
    }

    const serviceHoursMod = await import('@/lib/service-hours')
    const checkIsOpenNow = serviceHoursMod.checkIsOpenNow

    const TenantMod = await import('@/models/Tenant')
    const Tenant = TenantMod.default

    const LocationMod = await import('@/models/Location')
    const Location = LocationMod.default

    const OrderMod = await import('@/models/Order')
    const Order = OrderMod.default

    const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'en_ruta', 'arrived']

    const tenants = await Tenant.find({ isActive: true, status: 'active' })
      .select('name slug plan isOperational').lean()

    const locations = await Location.find({ status: 'active' })
      .select('tenantId serviceHours timezone settings.acceptsOrders').lean()

    const activeOrders = await Order.find({ status: { $in: ACTIVE_STATUSES as any } })
      .select('tenantId status createdAt statusTimestamps').lean()

    const todayStart = startOfDay(new Date())
    const todayOrders = await Order.find({ createdAt: { $gte: todayStart }, status: { $ne: 'cancelled' } })
      .select('tenantId total payment.status createdAt status').lean()

    const tenantMap = new Map<string, any>()
    for (const t of tenants) tenantMap.set(t._id.toString(), t)

    const locationMap = new Map<string, any[]>()
    for (const loc of locations) {
      const tid = loc.tenantId.toString()
      if (!locationMap.has(tid)) locationMap.set(tid, [])
      locationMap.get(tid)!.push(loc)
    }

    const tenantActiveOrders = new Map<string, any[]>()
    for (const order of activeOrders) {
      const tid = order.tenantId.toString()
      if (!tenantActiveOrders.has(tid)) tenantActiveOrders.set(tid, [])
      tenantActiveOrders.get(tid)!.push(order)
    }

    const saludRed = {
      operandoNormalmente: 0, requierenAtencion: 0, sinActividad: 0,
      tenants: [] as any[],
    }

    for (const t of tenants) {
      const tid = t._id.toString()
      const locs = locationMap.get(tid) || []
      const orders = tenantActiveOrders.get(tid) || []
      const todayTenantOrders = todayOrders.filter((o: any) => o.tenantId.toString() === tid)

      const open = locs.some((loc: any) => isOpenForTenant(loc, checkIsOpenNow))
      const statusCounts: Record<string, number> = {}
      const attentionReasons: string[] = []

      for (const order of orders) {
        statusCounts[order.status] = (statusCounts[order.status] || 0) + 1
        const stuck = isStuckOrder(order)
        if (stuck.stuck && stuck.reason) attentionReasons.push(stuck.reason)
      }

      let estado: 'operando' | 'atencion' | 'sin_actividad' = 'sin_actividad'
      if (attentionReasons.length > 0) estado = 'atencion'
      else if (open && t.isOperational) estado = 'operando'

      if (estado === 'operando') saludRed.operandoNormalmente++
      else if (estado === 'atencion') saludRed.requierenAtencion++
      else saludRed.sinActividad++

      saludRed.tenants.push({
        tenantId: tid,
        name: t.name,
        slug: t.slug,
        plan: t.plan,
        estado,
        pedidosActivos: orders.length,
        pedidosHoy: todayTenantOrders.length,
        ingresosHoyCents: todayTenantOrders
          .filter((o: any) => o.payment?.status === 'approved')
          .reduce((sum: number, o: any) => sum + (o.total || 0), 0),
        ultimaActividad: toDateStr(orders[0]?.createdAt || todayTenantOrders[0]?.createdAt),
      })
    }

    saludRed.tenants.sort((a: any, b: any) => {
      const o: Record<string, number> = { atencion: 0, operando: 1, sin_actividad: 2 }
      return (o[a.estado] ?? 3) - (o[b.estado] ?? 3)
    })

    return NextResponse.json({ saludRed })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[dashboard/salud GET]', msg)
    return NextResponse.json({ error: 'Error al obtener datos', detail: msg }, { status: 500 })
  }
}
