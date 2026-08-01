import { connectDB } from '@/lib/mongoose'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import UserPreferences from '@/models/UserPreferences'
import User from '@/models/User'
import LoyaltyMember from '@/models/LoyaltyMember'
import Order from '@/models/Order'
import Location from '@/models/Location'
import { hashPhone } from '@/lib/crypto'
import mongoose from 'mongoose'

const BUENOS_AIRES = { lat: -34.6037, lng: -58.3816 }

/**
 * Count orders for a user, resolving identity by phoneHash or email.
 * Order model has no userId field — identity is via phoneHash on the customer subdoc.
 */
async function countOrdersForUser(
  userId: mongoose.Types.ObjectId,
  phone: string | null,
  email: string | null,
  tenantId?: mongoose.Types.ObjectId
): Promise<number> {
  // Path 1: If user has phone, count by phoneHash
  if (phone) {
    const query: any = { 'customer.phoneHash': hashPhone(phone) }
    if (tenantId) query.tenantId = tenantId
    return Order.countDocuments(query)
  }

  // Path 2: If user has email, try to find LoyaltyMember and use cache.totalOrders
  if (email) {
    const memberQuery: any = { email: email.toLowerCase().trim() }
    if (tenantId) memberQuery.tenantId = tenantId
    const member = await LoyaltyMember.findOne(memberQuery)
      .select('cache.totalOrders')
      .lean() as any
    if (member) return member.cache?.totalOrders || 0
  }

  return 0
}

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ show: false })
    }

    await connectDB()
    const userId = new mongoose.Types.ObjectId(session.user.id)

    // 1. Check hasSeenNetworkOnboarding
    const prefs = await UserPreferences.findOne({ userId })
      .select('hasSeenNetworkOnboarding')
      .lean()

    if (prefs?.hasSeenNetworkOnboarding) {
      return NextResponse.json({ show: false })
    }

    // 2. Check has at least 1 LoyaltyMember (active)
    const memberships = await LoyaltyMember.find({ userId, status: 'active' })
      .populate('tenantId', 'name slug branding.logoUrl')
      .lean()

    if (memberships.length === 0) {
      return NextResponse.json({ show: false })
    }

    // 3. Resolve user identity for order counting
    const user = await User.findById(userId)
      .select('phone email')
      .lean() as any

    const userPhone: string | null = user?.phone || null
    const userEmail: string | null = user?.email || null

    // 4. Check has at least 1 order (using resolved identity)
    const totalOrders = await countOrdersForUser(userId, userPhone, userEmail)
    if (totalOrders < 1) {
      return NextResponse.json({ show: false })
    }

    // 5. Find the tenant with most orders (the one they know best)
    const membershipWithOrders = await Promise.all(
      memberships.map(async (m) => {
        const tid = m.tenantId?._id as mongoose.Types.ObjectId
        const count = await countOrdersForUser(userId, userPhone, userEmail, tid)
        return { membership: m, orderCount: count }
      })
    )

    membershipWithOrders.sort((a, b) => b.orderCount - a.orderCount)
    const best = membershipWithOrders[0]
    const tenant = best.membership.tenantId as any

    if (!tenant) {
      return NextResponse.json({ show: false })
    }

    // 6. Determine case (C > B > A)
    const hasClub = memberships.length > 0
    const isCaseC = best.orderCount > 1
    const isCaseB = hasClub && !isCaseC

    // 7. nearbyCount — cascada real
    let nearbyCount: number | null = null
    let userLat: number | null = null
    let userLng: number | null = null

    // Try savedAddresses first
    const userFull = await User.findById(userId)
      .select('savedAddresses')
      .lean() as any

    const defaultAddress = userFull?.savedAddresses?.find((a: any) => a.isDefault)
      || userFull?.savedAddresses?.[0]

    if (defaultAddress?.coordinates?.lat && defaultAddress?.coordinates?.lng) {
      userLat = defaultAddress.coordinates.lat
      userLng = defaultAddress.coordinates.lng
    }

    // Fallback: Buenos Aires default
    if (userLat === null || userLng === null) {
      userLat = BUENOS_AIRES.lat
      userLng = BUENOS_AIRES.lng
    }

    // Real count using $geoNear — single query, then filter for 15min walking
    let nearbyWithin15min: number | null = null
    try {
      const results = await Location.aggregate([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [userLng, userLat] },
            distanceField: 'distanceM',
            spherical: true,
            maxDistance: 5000,
            query: { status: 'active' },
          },
        },
        { $project: { distanceM: 1 } },
      ])
      nearbyCount = results.length
      nearbyWithin15min = results.filter((r: any) => r.distanceM <= 1200).length
    } catch {
      nearbyCount = null
      nearbyWithin15min = null
    }

    return NextResponse.json({
      show: true,
      tenantName: tenant.name,
      tenantLogoUrl: tenant.branding?.logoUrl ?? null,
      totalOrders: best.orderCount,
      hasClub,
      nearbyCount,
      nearbyWithin15min,
      case: isCaseC ? 'C' : isCaseB ? 'B' : 'A',
    })
  } catch (error) {
    console.error('[onboarding/network-discovery]', error)
    return NextResponse.json({ show: false })
  }
}

export async function POST() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    await connectDB()
    const userId = new mongoose.Types.ObjectId(session.user.id)

    await UserPreferences.findOneAndUpdate(
      { userId },
      { $set: { hasSeenNetworkOnboarding: true } },
      { upsert: true }
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[onboarding/network-discovery/dismiss]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
