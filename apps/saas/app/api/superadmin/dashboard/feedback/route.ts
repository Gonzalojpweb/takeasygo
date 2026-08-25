/**
 * Superadmin Dashboard — Feedback
 *
 * GET /api/superadmin/dashboard/feedback
 *
 * Returns today's feedback (ratings and feedback)
 * Uses only Rating, Feedback, and Tenant models to avoid TDZ.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

function toDateStr(v: any): string {
  if (!v) return ''
  if (v instanceof Date) return v.toISOString()
  try { return new Date(v).toISOString() } catch { return '' }
}

function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
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

    // Data imports - only Rating, Feedback, and Tenant
    const mongooseMod = await import('mongoose')
    const mongoose = mongooseMod.default ?? mongooseMod
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI!)
    }

    const TenantMod = await import('@/models/Tenant')
    const Tenant = TenantMod.default

    const RatingMod = await import('@/models/Rating')
    const Rating = RatingMod.default

    const FeedbackMod = await import('@/models/Feedback')
    const Feedback = FeedbackMod.default

    const now = new Date()
    const todayStart = startOfDay(now)

    const tenants = await Tenant.find({ isActive: true, status: 'active' })
      .select('name slug').lean()

    const todayRatings = await Rating.find({ createdAt: { $gte: todayStart } })
      .select('tenantId stars comment createdAt').lean()

    const todayFeedback = await Feedback.find({ createdAt: { $gte: todayStart } })
      .select('tenantId satisfaction comment event createdAt').lean()

    const tenantMap = new Map<string, any>()
    for (const t of tenants) tenantMap.set(t._id.toString(), t)

    const allFeedbackToday = [
      ...todayRatings.map((r: any) => ({
        tenantName: tenantMap.get(r.tenantId.toString())?.name || '?',
        tenantSlug: tenantMap.get(r.tenantId.toString())?.slug || '',
        type: 'rating' as const,
        stars: r.stars,
        satisfaction: r.stars <= 2 ? 'mejorable' : r.stars >= 4 ? 'excelente' : 'buena',
        comment: r.comment || '',
        createdAt: toDateStr(r.createdAt),
      })),
      ...todayFeedback.map((f: any) => ({
        tenantName: tenantMap.get(f.tenantId.toString())?.name || '?',
        tenantSlug: tenantMap.get(f.tenantId.toString())?.slug || '',
        type: 'feedback' as const,
        stars: undefined as number | undefined,
        satisfaction: f.satisfaction,
        comment: f.comment || '',
        createdAt: toDateStr(f.createdAt),
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const negativosHoy = allFeedbackToday.filter(
      f => f.satisfaction === 'mejorable' || (f.stars !== undefined && f.stars <= 2)
    ).length

    const totalConSatisfaccion = allFeedbackToday.filter(f => f.satisfaction)
    const positivos = totalConSatisfaccion.filter(f => f.satisfaction === 'excelente' || f.satisfaction === 'buena').length
    const satisfaccionPct = totalConSatisfaccion.length > 0
      ? Math.round((positivos / totalConSatisfaccion.length) * 100) : 100

    const feedback = {
      negativosHoy,
      totalHoy: allFeedbackToday.length,
      satisfaccionPct,
      items: allFeedbackToday.slice(0, 20),
    }

    return NextResponse.json({ feedback })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[dashboard/feedback GET]', msg)
    return NextResponse.json({ error: 'Error al obtener datos', detail: msg }, { status: 500 })
  }
}
