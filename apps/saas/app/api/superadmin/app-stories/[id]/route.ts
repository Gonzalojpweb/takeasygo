import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import AppStory from '@/models/AppStory'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'
import { resolveCtaLinkUpdate } from '@/lib/cta-link'
import { normalizeOwner, normalizeSurfaces, dbOwnerLookups, effectiveOwner, effectiveSurfaces } from '@/lib/app-story-owner'
import { markSaved } from '@/lib/media/ads'

/** CP3: portada (solo URL https de Cloudinary) y duración del video (ms, 3–15 s). */
function sanitizeVideoMeta(body: { videoUrl?: unknown; videoPosterUrl?: unknown; videoDurationMs?: unknown }) {
  const hasVideo = typeof body.videoUrl === 'string' && body.videoUrl.trim() !== ''
  const poster = typeof body.videoPosterUrl === 'string' && /^https:\/\/res\.cloudinary\.com\//.test(body.videoPosterUrl) ? body.videoPosterUrl : ''
  const d = Number(body.videoDurationMs)
  const durationMs = hasVideo && Number.isFinite(d) && d >= 1000 ? Math.min(Math.round(d), 15_000) : null
  return { videoPosterUrl: hasVideo ? poster : '', videoDurationMs: durationMs }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { id } = await params
    await connectDB()

    const story = await AppStory.findById(id).lean()
    if (!story) {
      return NextResponse.json({ error: 'Story no encontrada' }, { status: 404 })
    }

    return NextResponse.json({ story })
  } catch (error) {
    console.error('[superadmin/app-stories/[id] GET]', error)
    return NextResponse.json({ error: 'Error al obtener la story' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { id } = await params
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

    await connectDB()

    // 20/11/2026: link del CTA validado; el mismo link viejo inválido pasa con aviso.
    const current = await AppStory.findById(id).select('ctaLink owner surfaces').lean<{ ctaLink?: string; owner?: any; surfaces?: string[] }>()
    if (!current) {
      return NextResponse.json({ error: 'Story no encontrada' }, { status: 404 })
    }
    const cta = resolveCtaLinkUpdate(ctaLink ?? '', current.ctaLink)
    if (!cta.ok) return NextResponse.json({ error: cta.error, field: 'ctaLink' }, { status: 400 })
    const nextCtaLink = cta.changed ? cta.value : (current.ctaLink ?? '')
    const warnings = !cta.changed && cta.warning ? [cta.warning] : []

    // CP2: dueño y superficies solo cambian si llegan en el cuerpo.
    const extra: Record<string, unknown> = {}
    if (surfacesInput !== undefined) {
      const surfaces = normalizeSurfaces(surfacesInput)
      if (!surfaces.ok) return NextResponse.json({ error: surfaces.error, field: 'surfaces' }, { status: 400 })
      extra.surfaces = surfaces.value
    }
    if (ownerInput !== undefined) {
      const owner = await normalizeOwner(ownerInput, await dbOwnerLookups())
      if (!owner.ok) return NextResponse.json({ error: owner.error, field: 'owner' }, { status: 400 })
      extra.owner = owner.value
    }
    const before = { owner: effectiveOwner(current), surfaces: effectiveSurfaces(current) }

    const story = await AppStory.findByIdAndUpdate(
      id,
      {
        title: title.trim(),
        description: description || '',
        shortDescription: shortDescription || '',
        imageUrl: imageUrl || '',
        videoUrl: videoUrl || '',
        type: type || 'feature',
        ctaText: ctaText || '',
        ctaLink: nextCtaLink,
        isActive: isActive !== undefined ? isActive : true,
        sortOrder: sortOrder || 0,
        scheduledStart: scheduledStart || null,
        scheduledEnd: scheduledEnd || null,
        customStyles: customStyles || {},
        ...sanitizeVideoMeta(body),
        ...extra,
      },
      { new: true }
    )

    if (!story) {
      return NextResponse.json({ error: 'Story no encontrada' }, { status: 404 })
    }
    await markSaved([story.imageUrl, story.videoUrl])

    logAudit({
      tenantId: null,
      action: 'appstory.updated',
      entity: 'appStory',
      details: {
        storyId: story._id, title: story.title,
        before,
        after: { owner: effectiveOwner(story), surfaces: effectiveSurfaces(story) },
      },
      request,
    })

    return NextResponse.json(warnings.length ? { story, warnings } : { story })
  } catch (error) {
    console.error('[superadmin/app-stories/[id] PUT]', error)
    return NextResponse.json({ error: 'Error al actualizar la story' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { id } = await params
    await connectDB()

    const story = await AppStory.findByIdAndDelete(id)
    if (!story) {
      return NextResponse.json({ error: 'Story no encontrada' }, { status: 404 })
    }

    logAudit({
      tenantId: null,
      action: 'appstory.deleted',
      entity: 'appStory',
      details: { storyId: id, title: story.title },
      request,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[superadmin/app-stories/[id] DELETE]', error)
    return NextResponse.json({ error: 'Error al eliminar la story' }, { status: 500 })
  }
}
