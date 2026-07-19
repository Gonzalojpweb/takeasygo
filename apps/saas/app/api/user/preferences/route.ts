import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/mongoose'
import UserPreferences from '@/models/UserPreferences'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    await connectDB()
    const prefs = await UserPreferences.findOne({ userId: session.user.id }).lean()

    if (!prefs) {
      return NextResponse.json({ exists: false })
    }

    return NextResponse.json({ exists: true, preferences: prefs })
  } catch (error) {
    console.error('[Preferences GET]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const {
      displayName,
      age,
      zone,
      cuisinePreferences,
      experiencePreferences,
      onboardingCompleted,
      notificationPermission,
    } = body

    await connectDB()

    const update: Record<string, unknown> = {}
    if (displayName !== undefined) update.displayName = displayName
    if (age !== undefined) update.age = age
    if (zone !== undefined) update.zone = zone
    if (cuisinePreferences !== undefined) update.cuisinePreferences = cuisinePreferences
    if (experiencePreferences !== undefined) update.experiencePreferences = experiencePreferences
    if (onboardingCompleted !== undefined) update.onboardingCompleted = onboardingCompleted
    if (notificationPermission !== undefined) update.notificationPermission = notificationPermission

    const prefs = await UserPreferences.findOneAndUpdate(
      { userId: session.user.id },
      { $set: update },
      { new: true, upsert: true }
    ).lean()

    return NextResponse.json({ success: true, preferences: prefs })
  } catch (error) {
    console.error('[Preferences POST]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
