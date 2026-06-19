import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import SystemAnnouncement from '@/models/SystemAnnouncement'
import Tenant from '@/models/Tenant'
import { requireAuth, getSessionUser } from '@/lib/apiAuth'
import mongoose from 'mongoose'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id plan').lean() as any
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const user = await getSessionUser(request)
    const unreadFilter = user?.id
      ? { readBy: { $ne: new mongoose.Types.ObjectId(user.id) } }
      : {}

    const announcements = await SystemAnnouncement.find({
      status: 'published',
      ...unreadFilter,
      $and: [
        {
          $or: [
            { targetPlans: { $size: 0 } },
            { targetPlans: tenant.plan },
          ],
        },
        {
          $or: [
            { targetTenantIds: { $size: 0 } },
            { targetTenantIds: tenant._id },
          ],
        },
      ],
    })
    .sort({ publishedAt: -1, createdAt: -1 })
    .lean()

    return NextResponse.json({ announcements })
  } catch (error) {
    console.error('[[tenant]/announcements GET]', error)
    return NextResponse.json({ error: 'Error al obtener novedades' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id').lean() as any
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    // Aquí necesitamos auth para saber QUIÉN está leyendo, no importa si falla el auth de tenant, 
    // pero usamos requireAuth porque sabemos que es un admin legítimo.
    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    // Para obtener el userID necesitamos descifrar la sesión
    const { auth } = await import('@/lib/auth')
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const userId = new mongoose.Types.ObjectId(session.user.id)
    const body = await request.json()
    const { announcementIds } = body // Array de IDs que se van a marcar como leídos

    if (Array.isArray(announcementIds) && announcementIds.length > 0) {
      await SystemAnnouncement.updateMany(
        { _id: { $in: announcementIds } },
        { $addToSet: { readBy: userId } }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[[tenant]/announcements POST]', error)
    return NextResponse.json({ error: 'Error al actualizar lectura' }, { status: 500 })
  }
}
