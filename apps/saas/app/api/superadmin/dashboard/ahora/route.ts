/**
 * Superadmin Dashboard — Ahora
 *
 * GET /api/superadmin/dashboard/ahora
 *
 * Returns current network status (operandoAhora, conPedidosActivos, etc.)
 * Uses only Tenant and Location models to avoid TDZ.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

function minutesSince(date: Date): number {
  return (Date.now() - date.getTime()) / 60_000
}

function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
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

    console.log('[dashboard/ahora] Auth debug:', {
      isSecure,
      hasToken: !!token,
      tokenRole: token?.role,
      tokenId: token?.id,
    })

    if (!token) {
      return NextResponse.json({ error: 'Acceso denegado - no token' }, { status: 403 })
    }

    let isSuperAdmin = token.role === 'superadmin'
    console.log('[dashboard/ahora] Initial superadmin check:', isSuperAdmin)
    
    if (!isSuperAdmin && token.id) {
      const mongooseMod = await import('mongoose')
      const mongoose = mongooseMod.default ?? mongooseMod
      if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(process.env.MONGODB_URI!)
      }
      const UserMod = await import('@/models/User')
      const User = UserMod.default
      const dbUser = await User.findById(token.id).select('role').lean<{ role: string }>()
      console.log('[dashboard/ahora] DB user:', { id: token.id, role: dbUser?.role })
      isSuperAdmin = dbUser?.role === 'superadmin'
    }

    console.log('[dashboard/ahora] Final superadmin check:', isSuperAdmin)

    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Acceso denegado - not superadmin' }, { status: 403 })
    }

    // Data imports - only Tenant and Location
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

    const ahora = {
      operandoAhora: 0, conPedidosActivos: 0, requierenAtencion: 0,
      abiertosSinPedidos: 0, sinActividad: 0, totalTenants: tenants.length,
    }

    for (const t of tenants) {
      const tid = t._id.toString()
      const locs = locationMap.get(tid) || []
      const orders = tenantActiveOrders.get(tid) || []

      const open = locs.some((loc: any) => isOpenForTenant(loc, checkIsOpenNow))
      const hasActive = orders.length > 0

      if (open && t.isOperational) ahora.operandoAhora++
      if (hasActive) ahora.conPedidosActivos++
      if (open && !hasActive) ahora.abiertosSinPedidos++
      if (!open && !hasActive) ahora.sinActividad++
    }

    return NextResponse.json({ ahora })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[dashboard/ahora GET]', msg)
    return NextResponse.json({ error: 'Error al obtener datos', detail: msg }, { status: 500 })
  }
}
