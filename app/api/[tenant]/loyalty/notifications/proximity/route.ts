import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import LoyaltyMember from '@/models/LoyaltyMember'
import Tenant from '@/models/Tenant'
import PushSubscription from '@/models/PushSubscription'
import webpush from 'web-push'
import { requireAuth } from '@/lib/apiAuth'

webpush.setVapidDetails(
  'mailto:clickandthink1@gmail.com',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

/**
 * POST /api/{tenant}/loyalty/notifications/proximity
 * 
 * Envía notificaciones de proximidad personalizadas a miembros del club
 * 
 * Body:
 * - locationId (opcional): ID de la locación para filtrar miembros cercanos
 * - title (opcional): Título personalizado de la notificación
 * - body (opcional): Cuerpo personalizado de la notificación
 * 
 * Si no se proporcionan title/body, usa mensajes genéricos personalizados con el nombre del club
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    // Buscar tenant
    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // Verificar autenticación de admin
    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const body = await request.json()
    const { locationId, title, body: customBody } = body

    // Mensaje personalizado con el nombre del club
    const clubName = tenant.loyalty?.clubName || tenant.name
    const notificationTitle = title || `Estás cerca de ${clubName}`
    const notificationBody = customBody || 
      `No olvides que con tus puntos también puedes visitarnos y canjear. Valida nuestras promociones actuales.`

    // Buscar miembros activos del club
    const membersQuery: any = {
      tenantId: tenant._id,
      status: 'active',
    }

    // Si se proporciona locationId, filtrar por miembros que hayan pedido en esa locación
    // (esto es una aproximación simple de "cercanía")
    if (locationId) {
      membersQuery['cache.lastLocationId'] = locationId
    }

    const members = await LoyaltyMember.find(membersQuery).select('_id').lean()
    const memberIds = members.map(m => m._id)

    if (memberIds.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No hay miembros activos para enviar notificaciones',
        sent: 0
      })
    }

    // Buscar suscripciones push de estos miembros
    const subscriptions = await PushSubscription.find({
      memberId: { $in: memberIds }
    }).lean()

    if (subscriptions.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No hay suscripciones push activas para estos miembros',
        sent: 0
      })
    }

    // Enviar notificaciones a cada suscripción
    let sentCount = 0
    let failedCount = 0

    const payload = JSON.stringify({
      title: notificationTitle,
      body: notificationBody,
      url: `/explore/profile/club/${tenantSlug}`,
      icon: '/tgo192.png',
      badge: '/tgo192.png',
    })

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
        sentCount++
      } catch (error: any) {
        // Si el endpoint expiró (410), eliminar la suscripción
        if (error?.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id })
        }
        failedCount++
        console.error('[Proximity Notification] Error enviando a', sub.clientToken, error)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Notificaciones enviadas: ${sentCount}, fallidas: ${failedCount}`,
      sent: sentCount,
      failed: failedCount,
      total: subscriptions.length
    })

  } catch (error) {
    console.error('[Proximity Notification] Error:', error)
    return NextResponse.json(
      { error: 'Error al enviar notificaciones de proximidad' },
      { status: 500 }
    )
  }
}
