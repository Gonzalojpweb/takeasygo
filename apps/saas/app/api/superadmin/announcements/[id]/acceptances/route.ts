import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import SystemAnnouncement from '@/models/SystemAnnouncement'
import User from '@/models/User'
import { auth } from '@/lib/auth'

async function checkSuperadmin() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'superadmin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  return null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const errorResponse = await checkSuperadmin()
    if (errorResponse) return errorResponse

    const { id } = await params
    await connectDB()

    const announcement = await SystemAnnouncement.findById(id).lean()
    if (!announcement) {
      return NextResponse.json({ error: 'Anuncio no encontrado' }, { status: 404 })
    }

    const userIds = announcement.acceptances.map(a => a.userId)
    const users = await User.find({ _id: { $in: userIds } }).select('name email').lean()
    const userMap = new Map(users.map(u => [String(u._id), { name: u.name, email: u.email }]))

    const acceptances = announcement.acceptances.map(a => ({
      userId: String(a.userId),
      acceptedAt: a.acceptedAt,
      userName: userMap.get(String(a.userId))?.name || null,
      userEmail: userMap.get(String(a.userId))?.email || null,
    })).sort((a, b) => new Date(b.acceptedAt).getTime() - new Date(a.acceptedAt).getTime())

    return NextResponse.json({ acceptances })
  } catch (error) {
    console.error('[superadmin/announcements/[id]/acceptances GET]', error)
    return NextResponse.json({ error: 'Error al obtener aceptaciones' }, { status: 500 })
  }
}
