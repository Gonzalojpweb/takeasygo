import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import UserPreferences from '@/models/UserPreferences'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { escapeRegex } from '@takeasygo/business'

export async function GET(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { searchParams } = request.nextUrl
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
    const search = searchParams.get('search') ?? ''
    const zone = searchParams.get('zone') ?? ''
    const cuisine = searchParams.get('cuisine') ?? ''
    const ageMin = searchParams.get('ageMin') ?? ''
    const ageMax = searchParams.get('ageMax') ?? ''
    const onboarding = searchParams.get('onboarding') ?? ''
    const notifications = searchParams.get('notifications') ?? ''
    const status = searchParams.get('status') ?? ''
    const sortBy = searchParams.get('sortBy') ?? 'createdAt'
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 1 : -1

    await connectDB()

    // Find all users who registered from the app (role=consumer, no tenant)
    const userFilter: Record<string, any> = {
      role: 'consumer',
      tenantId: null,
    }

    if (search.trim()) {
      const re = new RegExp(escapeRegex(search.trim()), 'i')
      userFilter.$or = [{ name: re }, { email: re }]
    }

    if (status === 'active') userFilter.isActive = true
    else if (status === 'inactive') userFilter.isActive = false

    // Get all matching user IDs first
    const allUserIds = await User.find(userFilter).select('_id').lean()
    const userIds = allUserIds.map((u) => u._id)

    // Build preferences filter
    const prefsFilter: Record<string, any> = { userId: { $in: userIds } }

    if (zone) prefsFilter.zone = zone
    if (cuisine) prefsFilter.cuisinePreferences = { $in: [cuisine] }
    if (ageMin || ageMax) {
      prefsFilter.age = {}
      if (ageMin) prefsFilter.age.$gte = parseInt(ageMin, 10)
      if (ageMax) prefsFilter.age.$lte = parseInt(ageMax, 10)
    }
    if (onboarding === 'completed') prefsFilter.onboardingCompleted = true
    else if (onboarding === 'pending') prefsFilter.onboardingCompleted = false
    if (notifications === 'granted') prefsFilter.notificationPermission = 'granted'
    else if (notifications === 'denied') prefsFilter.notificationPermission = 'denied'

    // Get matching preference user IDs (for filtered queries)
    let filteredUserIds = userIds
    if (zone || cuisine || ageMin || ageMax || onboarding || notifications) {
      const matchingPrefs = await UserPreferences.find(prefsFilter).select('userId').lean()
      filteredUserIds = matchingPrefs.map((p) => p.userId)
    }

    const skip = (page - 1) * limit

    // Fetch users with preferences
    const [usersRaw, total] = await Promise.all([
      User.find({ _id: { $in: filteredUserIds } })
        .select('-password -resetToken -resetTokenExpiry')
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments({ _id: { $in: filteredUserIds } }),
    ])

    // Fetch preferences for these users
    const userIdsFetched = usersRaw.map((u) => u._id)
    const prefs = await UserPreferences.find({ userId: { $in: userIdsFetched } }).lean()
    const prefsMap = new Map(prefs.map((p) => [p.userId.toString(), p]))

    // Merge user + preferences
    const consumers = usersRaw.map((u) => ({
      ...u,
      preferences: prefsMap.get(u._id.toString()) || null,
    }))

    // Stats
    const allPrefs = await UserPreferences.find({ userId: { $in: userIds } }).lean()
    const zones = allPrefs.map((p) => p.zone).filter(Boolean)
    const zoneCounts = zones.reduce(
      (acc, z) => {
        acc[z] = (acc[z] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )
    const topZone = (Object.entries(zoneCounts) as [string, number][]).sort(([, a], [, b]) => b - a)[0]

    return NextResponse.json({
      consumers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      stats: {
        total: total,
        onboardingCompleted: allPrefs.filter((p) => p.onboardingCompleted).length,
        notificationsGranted: allPrefs.filter((p) => p.notificationPermission === 'granted').length,
        topZone: topZone ? { name: topZone[0], count: topZone[1] } : null,
        availableZones: [...new Set(zones)].sort(),
      },
    })
  } catch (error) {
    console.error('[superadmin/app-consumers GET]', error)
    return NextResponse.json({ error: 'Error al obtener consumidores' }, { status: 500 })
  }
}
