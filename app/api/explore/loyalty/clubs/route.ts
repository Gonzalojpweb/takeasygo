import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import LoyaltyMember from '@/models/LoyaltyMember'
import Location from '@/models/Location'
import { auth } from '@/lib/auth'
import User from '@/models/User'
import { NextRequest, NextResponse } from 'next/server'
import { Types } from 'mongoose'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const lat = parseFloat(searchParams.get('lat') ?? '')
    const lng = parseFloat(searchParams.get('lng') ?? '')
    const hasCoords = !isNaN(lat) && !isNaN(lng)

    await connectDB()

    const session = await auth()
    let userId: Types.ObjectId | null = null
    let userEmail: string | null = null

    if (session?.user?.email) {
      const user = await User.findOne({ email: session.user.email }).select('_id email').lean()
      if (user) {
        userId = user._id as Types.ObjectId
        userEmail = session.user.email
      }
    }

    const myClubIds: Types.ObjectId[] = []

    let myClubs: any[] = []
    if (userId) {
      const myMemberships = await LoyaltyMember.find({ userId, status: 'active' })
        .select('tenantId loyalty.points loyalty.tier cache.totalOrders cache.lastOrderAt')
        .lean()

      if (myMemberships.length > 0) {
        myClubIds.push(...myMemberships.map(m => m.tenantId))
        const myTenants = await Tenant.find({ _id: { $in: myClubIds } })
          .select('name slug branding loyalty.clubName')
          .lean()

        const tenantMap = new Map(myTenants.map(t => [t._id.toString(), t]))

        myClubs = myMemberships.map(m => {
          const t = tenantMap.get(m.tenantId.toString())
          return {
            tenantSlug: t?.slug ?? '',
            tenantName: t?.name ?? '',
            logoUrl: (t?.branding as any)?.logoUrl ?? null,
            primaryColor: (t?.branding as any)?.primaryColor ?? '#f14722',
            clubName: (t?.loyalty as any)?.clubName ?? `Club ${t?.name ?? ''}`,
            points: m.loyalty.points,
            tier: m.loyalty.tier,
            totalOrders: m.cache.totalOrders,
            lastOrderAt: m.cache.lastOrderAt,
          }
        })
      }
    }

    // ── Suggested clubs ────────────────────────────────────────────
    const suggestedTenantIds = new Set<string>()

    // Basado en órdenes previas
    if (userEmail) {
      const orderedTenants = await Order.distinct('tenantId', {
        'customer.email': userEmail,
      })
      orderedTenants.forEach((id: any) => suggestedTenantIds.add(id.toString()))
    }

    let suggestedQuery: any = {
      _id: { $nin: myClubIds },
      isActive: true,
      'loyalty.enabled': true,
    }

    // Si hay sugerencias específicas, priorizarlas
    if (suggestedTenantIds.size > 0) {
      suggestedQuery.$or = [
        { _id: { $in: [...suggestedTenantIds].map(id => new Types.ObjectId(id)) } },
      ]
    }

    const suggestedTenants = await Tenant.find(suggestedQuery)
      .select('name slug branding loyalty.clubName')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean()

    // Verificar cuáles tienen órdenes previas
    const suggestedWithOrders = new Set<string>()
    for (const t of suggestedTenants) {
      if (suggestedTenantIds.has(t._id.toString())) {
        suggestedWithOrders.add(t._id.toString())
      }
    }

    // Distancia (si hay coordenadas)
    let distanceMap = new Map<string, number | null>()
    if (hasCoords && suggestedTenants.length > 0) {
      const tenantObjectIds = suggestedTenants.map(t => t._id)
      const nearbyLocations = await Location.aggregate([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [lng, lat] },
            distanceField: 'distanceM',
            maxDistance: 50000,
            spherical: true,
            query: { tenantId: { $in: tenantObjectIds }, isActive: true },
          },
        },
        { $project: { tenantId: 1, distanceM: 1 } },
      ])
      nearbyLocations.forEach((loc: any) => {
        const existing = distanceMap.get(loc.tenantId.toString())
        if (existing === undefined || existing === null || loc.distanceM < existing) {
          distanceMap.set(loc.tenantId.toString(), Math.round(loc.distanceM))
        }
      })
    }

    const suggestedClubs = suggestedTenants.map(t => {
      const tid = t._id.toString()
      return {
        tenantSlug: t.slug,
        tenantName: t.name,
        logoUrl: (t.branding as any)?.logoUrl ?? null,
        primaryColor: (t.branding as any)?.primaryColor ?? '#f14722',
        clubName: (t.loyalty as any)?.clubName ?? `Club ${t.name}`,
        distanceM: distanceMap.get(tid) ?? null,
        hasOrdered: suggestedWithOrders.has(tid),
      }
    })

    return NextResponse.json({
      myClubs,
      suggestedClubs,
    })

  } catch (error) {
    console.error('[explore/loyalty/clubs] Error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
