import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import AppStory from '@/models/AppStory'
import Tenant from '@/models/Tenant'
import { STORY_SURFACES, storyVisibilityFilter, type StorySurface } from '@/lib/app-story-owner'

export const dynamic = 'force-dynamic'

/**
 * GET /api/app-stories?surface=menu_story&tenant={slug}&locationId={id}
 *
 * Stories activas y en fecha de una superficie (por defecto menu_story).
 * CP2 (20/11/2026): en el menú de un comercio salen las de la plataforma +
 * las de ESE comercio (todas sus sedes o esa sede); sin comercio, solo las de
 * la plataforma. Las stories viejas cuentan como plataforma + menu_story.
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB()

    const sp = request.nextUrl.searchParams
    const rawSurface = sp.get('surface') || 'menu_story'
    if (!(STORY_SURFACES as readonly string[]).includes(rawSurface)) {
      return NextResponse.json({ stories: [] }, { status: 400 })
    }
    const surface = rawSurface as StorySurface

    let tenantId: string | null = null
    const slug = sp.get('tenant')
    if (slug && /^[a-z0-9-]{1,80}$/.test(slug)) {
      const t = await Tenant.findOne({ slug, isActive: true }).select('_id').lean<{ _id: unknown }>()
      tenantId = t ? String(t._id) : null
    }
    const rawLoc = sp.get('locationId')
    const locationId = tenantId && rawLoc && mongoose.Types.ObjectId.isValid(rawLoc) ? rawLoc : null

    const now = new Date()
    const stories = await AppStory.find({
      isActive: true,
      $and: [
        { $or: [{ scheduledStart: null }, { scheduledStart: { $lte: now } }] },
        { $or: [{ scheduledEnd: null }, { scheduledEnd: { $gte: now } }] },
        storyVisibilityFilter(surface, { tenantId, locationId }),
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
