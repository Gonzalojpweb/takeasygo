import { connectDB } from '@/lib/mongoose'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import UserPreferences from '@/models/UserPreferences'
import LoyaltyMember from '@/models/LoyaltyMember'
import Order from '@/models/Order'
import Location from '@/models/Location'
import mongoose from 'mongoose'

const BUENOS_AIRES = { lat: -34.6037, lng: -58.3816 }

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

    // 3. Check has at least 1 order
    const totalOrders = await Order.countDocuments({ userId })
    if (totalOrders < 1) {
      return NextResponse.json({ show: false })
    }

    // 4. Find the tenant with most orders (the one they know best)
    const membershipWithOrders = await Promise.all(
      memberships.map(async (m) => {
        const count = await Order.countDocuments({
          userId,
          tenantId: m.tenantId?._id,
        })
        return { membership: m, orderCount: count }
      })
    )

    membershipWithOrders.sort((a, b) => b.orderCount - a.orderCount)
    const best = membershipWithOrders[0]
    const tenant = best.membership.tenantId as any

    if (!tenant) {
      return NextResponse.json({ show: false })
    }

    // 5. Determine case (C > B > A)
    const hasClub = memberships.length > 0
    const isCaseC = best.orderCount > 1
    const isCaseB = hasClub && !isCaseC

    // 6. nearbyCount — cascada real
    let nearbyCount: number | null = null
    let userLat: number | null = null
    let userLng: number | null = null

    // Try savedAddresses first
    const userPrefs = await UserPreferences.findOne({ userId })
      .select('userId')
      .lean()

    // We need the User model for savedAddresses
    const User = mongoose.models.User || mongoose.model('User')
    const user = await User.findById(userId)
      .select('savedAddresses')
      .lean() as any

    const defaultAddress = user?.savedAddresses?.find((a: any) => a.isDefault)
      || user?.savedAddresses?.[0]

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
            maxDistance: 5000, // 5km for total count
            query: { status: 'active' },
          },
        },
        { $project: { distanceM: 1 } },
      ])
      nearbyCount = results.length
      // 15 min walking = 1200m at 80m/min (same formula as walkingMinutes() in RestaurantCard)
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
