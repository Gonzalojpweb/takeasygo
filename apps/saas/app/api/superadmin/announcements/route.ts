import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import SystemAnnouncement from '@/models/SystemAnnouncement'
import { auth } from '@/lib/auth'

// Middleware de verificación para asegurar que solo Superadmin acceda
async function checkSuperadmin() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'superadmin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  return null
}

export async function GET(request: NextRequest) {
  try {
    const errorResponse = await checkSuperadmin()
    if (errorResponse) return errorResponse

    await connectDB()
    const { searchParams } = request.nextUrl
    
    // Obtener todos los anuncios, ordenados por los más recientes
    const announcements = await SystemAnnouncement.find()
      .sort({ createdAt: -1 })
      .lean()
      
    return NextResponse.json({ announcements })
  } catch (error) {
    console.error('[superadmin/announcements GET]', error)
    return NextResponse.json({ error: 'Error al obtener anuncios' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const errorResponse = await checkSuperadmin()
    if (errorResponse) return errorResponse

    const body = await request.json()
    const { title, content, type, status, targetPlans, targetTenantIds, requiresConsent } = body

    if (!title?.trim() || !content?.trim()) {
      return NextResponse.json({ error: 'Título y contenido son requeridos' }, { status: 400 })
    }

    await connectDB()

    const newAnnouncement = await SystemAnnouncement.create({
      title: title.trim(),
      content: content.trim(),
      type: type || 'update',
      status: status || 'draft',
      targetPlans: Array.isArray(targetPlans) ? targetPlans : [],
      targetTenantIds: Array.isArray(targetTenantIds) ? targetTenantIds : [],
      publishedAt: status === 'published' ? new Date() : null,
      requiresConsent: requiresConsent || false,
    })

    return NextResponse.json({ announcement: newAnnouncement }, { status: 201 })
  } catch (error) {
    console.error('[superadmin/announcements POST]', error)
    return NextResponse.json({ error: 'Error al crear el anuncio' }, { status: 500 })
  }
}
