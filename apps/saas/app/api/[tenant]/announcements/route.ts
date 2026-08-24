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

    const { searchParams } = request.nextUrl
    const scope = searchParams.get('scope')

    const user = await getSessionUser(request)
    const userId = user?.id ? new mongoose.Types.ObjectId(user.id) : null

    const baseFilter: Record<string, any> = {
      status: 'published',
      $and: [
        { $or: [{ targetPlans: { $size: 0 } }, { targetPlans: tenant.plan }] },
        { $or: [{ targetTenantIds: { $size: 0 } }, { targetTenantIds: tenant._id }] },
      ],
    }

    // scope=all returns everything with read status; default returns only unread
    // Unread = not in readBy AND not in acceptances for this user
    if (scope !== 'all' && userId) {
      baseFilter.$and.push({
        $or: [
          { readBy: { $ne: userId } },
          { 'acceptances.userId': { $ne: userId } },
        ],
      })
    }

    const announcements = await SystemAnnouncement.find(baseFilter)
      .sort({ publishedAt: -1, createdAt: -1 })
      .lean()

    let result: any[] = announcements

    if (scope === 'all' && userId) {
      result = announcements.map(a => {
        const accepted = (a as any).acceptances?.some(
          (acc: any) => acc.userId?.equals?.(userId) ?? acc.userId?.toString?.() === userId.toString()
        ) ?? false
        const read = (a as any).readBy?.some(
          (id: mongoose.Types.ObjectId) => id.equals?.(userId) ?? id.toString?.() === userId.toString()
        ) ?? false
        return {
          ...a,
          accepted,
          read: read || accepted,
          readBy: undefined,
          acceptances: undefined,
        }
      })
    }

    return NextResponse.json({ announcements: result })
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

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const { auth } = await import('@/lib/auth')
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const userId = new mongoose.Types.ObjectId(session.user.id)
    const body = await request.json()
    const { announcementIds, action } = body

    if (Array.isArray(announcementIds) && announcementIds.length > 0) {
      if (action === 'accept') {
        // Consentimiento explícito: guardar en acceptances con timestamp
        await SystemAnnouncement.updateMany(
          { _id: { $in: announcementIds } },
          {
            $addToSet: {
              acceptances: { userId, acceptedAt: new Date() },
              readBy: userId, // Legacy: mantener compatibilidad
            },
          }
        )
      } else {
        // Mark as read normal (recordatorios semanales, etc.)
        await SystemAnnouncement.updateMany(
          { _id: { $in: announcementIds } },
          { $addToSet: { readBy: userId } }
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[[tenant]/announcements POST]', error)
    return NextResponse.json({ error: 'Error al actualizar lectura' }, { status: 500 })
  }
}
