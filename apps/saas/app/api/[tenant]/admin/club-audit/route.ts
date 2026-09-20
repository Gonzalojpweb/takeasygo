import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import Order from '@/models/Order'
import LoyaltyMember from '@/models/LoyaltyMember'
import QrPromo from '@/models/QrPromo'

/**
 * GET /api/{tenant}/admin/club-audit?promoSlug=xxx
 *
 * Devuelve miembros que usaron la promo club dentro de las primeras 48h de su afiliación,
 * agrupados por device fingerprint y prefijo de IP.
 *
 * Props de cada entrada:
 * - memberId, name, phoneHash, joinedAt
 * - firstUsedAt, hoursDelta (horas entre joinedAt y firstUsedAt)
 * - deviceCount (cuántos devices distintos usó)
 * - ipPrefix (prefijo de IP para agrupación)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { tenant: tenantSlug } = await params
    const isSuperAdmin = session.user.role === 'superadmin'
    const belongsToTenant = session.user.tenantSlug === tenantSlug

    if (!isSuperAdmin && !belongsToTenant) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const promoSlug = searchParams.get('promoSlug') || ''

    await connectDB()

    const Tenant = (await import('@/models/Tenant')).default
    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id')
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // Find QrPromo by slug
    const promoFilter: Record<string, any> = {
      tenantId: tenant._id,
      memberOnly: true,
    }
    if (promoSlug) {
      promoFilter.slug = promoSlug
    }

    const promos = await QrPromo.find(promoFilter).select('_id slug').lean()
    if (promos.length === 0) {
      return NextResponse.json({ entries: [], total: 0 })
    }

    const promoIds = promos.map(p => p._id)
    const promoSlugMap = new Map(promos.map(p => [p._id.toString(), p.slug]))

    // Find members who joined and used a club promo within 48h
    const members = await LoyaltyMember.find({
      tenantId: tenant._id,
      source: { $in: ['promotion', 'qr_scan', 'explore', 'hidden_reward'] },
    }).select('_id name phoneHash joinedAt deviceFingerprints').lean()

    const memberMap = new Map(members.map(m => [m._id.toString(), m]))

    // Find orders with club promo within 48h of joining
    const entries: any[] = []

    for (const member of members) {
      const memberId = member._id.toString()
      const joinedAt = new Date(member.joinedAt)
      const cutoff = new Date(joinedAt.getTime() + 48 * 60 * 60 * 1000)

      // Find first order with this promo
      const firstOrder = await Order.findOne({
        tenantId: tenant._id,
        promoSlug: { $in: promos.map(p => p.slug) },
        'customer.phoneHash': member.phoneHash,
        createdAt: { $gte: joinedAt, $lte: cutoff },
        status: { $ne: 'cancelled' },
        'payment.status': { $ne: 'cancelled' },
      }).sort({ createdAt: 1 }).select('createdAt ip').lean()

      if (!firstOrder) continue

      const hoursDelta = (new Date(firstOrder.createdAt).getTime() - joinedAt.getTime()) / (1000 * 60 * 60)

      entries.push({
        memberId,
        name: member.name,
        phoneHash: member.phoneHash,
        joinedAt: joinedAt.toISOString(),
        firstUsedAt: new Date(firstOrder.createdAt).toISOString(),
        hoursDelta: Math.round(hoursDelta * 10) / 10,
        deviceCount: (member.deviceFingerprints || []).length,
        ipPrefix: (firstOrder as any)?.ip ? (firstOrder as any).ip.split('.').slice(0, 3).join('.') : 'unknown',
      })
    }

    // Sort by hoursDelta ascending (most suspicious first)
    entries.sort((a, b) => a.hoursDelta - b.hoursDelta)

    return NextResponse.json({
      entries,
      total: entries.length,
      promoSlugs: promos.map(p => p.slug),
    })
  } catch (error) {
    console.error('Club audit GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
