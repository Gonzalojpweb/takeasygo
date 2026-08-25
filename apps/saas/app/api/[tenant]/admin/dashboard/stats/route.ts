/**
 * Admin Dashboard — Stats
 *
 * GET /api/[tenant]/admin/dashboard/stats
 *
 * Returns total, pending, confirmed, cancelled order counts.
 * Uses only Order model to avoid TDZ.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params

    const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
    if (!secret) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const token = await getToken({
      req: request as any,
      secret,
      secureCookie: process.env.NODE_ENV === 'production',
    })

    if (!token) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const mongooseMod = await import('mongoose')
    const mongoose = mongooseMod.default ?? mongooseMod
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI!)
    }

    const TenantMod = await import('@/models/Tenant')
    const Tenant = TenantMod.default

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .select('_id')
      .lean<{ _id: any }>()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    if (token.role !== 'superadmin' && token.tenantId?.toString() !== tenant._id.toString()) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const OrderMod = await import('@/models/Order')
    const Order = OrderMod.default

    const tenantId = tenant._id

    const [total, pending, confirmed, cancelled] = await Promise.all([
      Order.countDocuments({ tenantId, deletedAt: null }),
      Order.countDocuments({ tenantId, deletedAt: null, status: 'pending' }),
      Order.countDocuments({ tenantId, deletedAt: null, status: 'confirmed' }),
      Order.countDocuments({ tenantId, deletedAt: null, status: 'cancelled' }),
    ])

    return NextResponse.json({ total, pending, confirmed, cancelled })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[dashboard/stats GET]', msg)
    return NextResponse.json({ error: 'Error al obtener stats', detail: msg }, { status: 500 })
  }
}
