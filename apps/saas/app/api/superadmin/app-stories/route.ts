import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import AppStory from '@/models/AppStory'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'
import { validateCtaLink } from '@/lib/cta-link'
import { normalizeOwner, normalizeSurfaces, dbOwnerLookups } from '@/lib/app-story-owner'
import { markSaved } from '@/lib/media/ads'

/** CP3: portada (solo URL https de Cloudinary) y duración del video (ms, 3–15 s). */
function sanitizeVideoMeta(body: { videoUrl?: unknown; videoPosterUrl?: unknown; videoDurationMs?: unknown }) {
  const hasVideo = typeof body.videoUrl === 'string' && body.videoUrl.trim() !== ''
  const poster = typeof body.videoPosterUrl === 'string' && /^https:\/\/res\.cloudinary\.com\//.test(body.videoPosterUrl) ? body.videoPosterUrl : ''
  const d = Number(body.videoDurationMs)
  const durationMs = hasVideo && Number.isFinite(d) && d >= 1000 ? Math.min(Math.round(d), 15_000) : null
  return { videoPosterUrl: hasVideo ? poster : '', videoDurationMs: durationMs }
}

export async function GET() {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    await connectDB()

    const stories = await AppStory.find()
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean()

    return NextResponse.json({ stories })
  } catch (error) {
    console.error('[superadmin/app-stories GET]', error)
    return NextResponse.json({ error: 'Error al obtener stories de la app' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const body = await request.json()
    const {
      title, description, shortDescription, imageUrl, videoUrl,
      type, ctaText, ctaLink, isActive, sortOrder,
      scheduledStart, scheduledEnd, customStyles,
      owner: ownerInput, surfaces: surfacesInput,
    } = body

    if (!title?.trim()) {
      return NextResponse.json({ error: 'El título es obligatorio' }, { status: 400 })
    }
    const cta = validateCtaLink(ctaLink)
    if (!cta.ok) return NextResponse.json({ error: cta.error, field: 'ctaLink' }, { status: 400 })

    await connectDB()

    // CP2: dueño (plataforma o comercio/sede) y superficies. Sin aprobación.
    const surfaces = normalizeSurfaces(surfacesInput)
    if (!surfaces.ok) return NextResponse.json({ error: surfaces.error, field: 'surfaces' }, { status: 400 })
    const owner = await normalizeOwner(ownerInput, await dbOwnerLookups())
    if (!owner.ok) return NextResponse.json({ error: owner.error, field: 'owner' }, { status: 400 })

    const story = await AppStory.create({
      title: title.trim(),
      description: description || '',
      shortDescription: shortDescription || '',
      imageUrl: imageUrl || '',
      videoUrl: videoUrl || '',
      type: type || 'feature',
      ctaText: ctaText || '',
      ctaLink: cta.value,
      isActive: isActive !== undefined ? isActive : true,
      sortOrder: sortOrder || 0,
      scheduledStart: scheduledStart || null,
      scheduledEnd: scheduledEnd || null,
      customStyles: customStyles || {},
      owner: owner.value,
      surfaces: surfaces.value,
      ...sanitizeVideoMeta(body),
    })
    // CP3: los archivos subidos a la cuenta ads dejan de estar «pendientes».
    await markSaved([story.imageUrl, story.videoUrl])

    logAudit({
      tenantId: null,
      action: 'appstory.created',
      entity: 'appStory',
      details: { storyId: story._id, title: story.title, owner: owner.value, surfaces: surfaces.value },
      request,
    })

    return NextResponse.json({ story }, { status: 201 })
  } catch (error) {
    console.error('[superadmin/app-stories POST]', error)
    return NextResponse.json({ error: 'Error al crear la story de la app' }, { status: 500 })
  }
}
