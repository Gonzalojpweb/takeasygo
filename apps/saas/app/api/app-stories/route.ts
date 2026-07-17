import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import AppStory from '@/models/AppStory'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await connectDB()

    const now = new Date()

    const stories = await AppStory.find({
      isActive: true,
      $and: [
        { $or: [{ scheduledStart: null }, { scheduledStart: { $lte: now } }] },
        { $or: [{ scheduledEnd: null }, { scheduledEnd: { $gte: now } }] },
      ],
    })
      .sort({ sortOrder: 1, createdAt: -1 })
      .limit(50)
      .lean()

    return NextResponse.json({ stories }, {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' }
    })
  } catch (error) {
    console.error('[app-stories GET]', error)
    return NextResponse.json({ stories: [] }, { status: 500 })
  }
}
