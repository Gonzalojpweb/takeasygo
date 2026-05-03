import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import SystemAnnouncement from '@/models/SystemAnnouncement'
import { auth } from '@/lib/auth'

async function checkSuperadmin() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'superadmin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  return null
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const errorResponse = await checkSuperadmin()
    if (errorResponse) return errorResponse

    const { id } = await params
    const body = await request.json()
    
    await connectDB()

    const currentAnnouncement = await SystemAnnouncement.findById(id)
    if (!currentAnnouncement) {
      return NextResponse.json({ error: 'Anuncio no encontrado' }, { status: 404 })
    }

    // Actualizar campos
    if (body.title !== undefined) currentAnnouncement.title = body.title.trim()
    if (body.content !== undefined) currentAnnouncement.content = body.content.trim()
    if (body.type !== undefined) currentAnnouncement.type = body.type
    if (body.targetPlans !== undefined) currentAnnouncement.targetPlans = Array.isArray(body.targetPlans) ? body.targetPlans : []
    
    if (body.status !== undefined) {
      // Si cambia a publicado por primera vez, establecer publishedAt
      if (body.status === 'published' && currentAnnouncement.status === 'draft') {
        currentAnnouncement.publishedAt = new Date()
      }
      currentAnnouncement.status = body.status
    }

    await currentAnnouncement.save()

    return NextResponse.json({ announcement: currentAnnouncement })
  } catch (error) {
    console.error('[superadmin/announcements/[id] PUT]', error)
    return NextResponse.json({ error: 'Error al actualizar el anuncio' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const errorResponse = await checkSuperadmin()
    if (errorResponse) return errorResponse

    const { id } = await params
    
    await connectDB()
    const deleted = await SystemAnnouncement.findByIdAndDelete(id)
    
    if (!deleted) {
      return NextResponse.json({ error: 'Anuncio no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[superadmin/announcements/[id] DELETE]', error)
    return NextResponse.json({ error: 'Error al eliminar el anuncio' }, { status: 500 })
  }
}
