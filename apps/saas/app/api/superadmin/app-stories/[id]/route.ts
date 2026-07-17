import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import AppStory from '@/models/AppStory'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

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
    } = body

    if (!title?.trim()) {
      return NextResponse.json({ error: 'El título es obligatorio' }, { status: 400 })
    }

    await connectDB()

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
        ctaLink: ctaLink || '',
        isActive: isActive !== undefined ? isActive : true,
        sortOrder: sortOrder || 0,
        scheduledStart: scheduledStart || null,
        scheduledEnd: scheduledEnd || null,
        customStyles: customStyles || {},
      },
      { new: true }
    )

    if (!story) {
      return NextResponse.json({ error: 'Story no encontrada' }, { status: 404 })
    }

    logAudit({
      tenantId: null,
      action: 'appstory.updated',
      entity: 'appStory',
      details: { storyId: story._id, title: story.title },
      request,
    })

    return NextResponse.json({ story })
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
