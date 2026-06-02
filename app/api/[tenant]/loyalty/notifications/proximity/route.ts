import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import LoyaltyMember from '@/models/LoyaltyMember'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import PushSubscription from '@/models/PushSubscription'
import Feedback from '@/models/Feedback'
import webpush from 'web-push'
import { requireAuth } from '@/lib/apiAuth'
import { haversineDistance } from '@/lib/geofencing'

webpush.setVapidDetails(
  'mailto:clickandthink1@gmail.com',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

/**
 * POST /api/{tenant}/loyalty/notifications/proximity
 * 
 * Dos modos:
 * 
 * Modo Admin (manual):
 *   - Requiere auth de admin
 *   - Envía notificaciones a TODOS los miembros con push subscriptions
 *   - Body: { locationId?, title?, body? }
 * 
 * Modo Miembro (automático, desde browser):
 *   - No requiere auth de admin
 *   - Usa clientToken para identificar al miembro
 *   - Solo envía notificación al miembro que activó el geofencing
 *   - Body: { clientToken, lat, lng, title?, body? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const body = await request.json()
    const { locationId, title, body: customBody, clientToken, lat, lng } = body

    const clubName = tenant.loyalty?.clubName || tenant.name
    const defaultRadius = tenant.wallet?.geofenceRadius || 500
    const defaultMessage = tenant.wallet?.geofenceMessage || `¡Estás cerca de ${clubName}! Pasate a visitarnos.`
    const notificationTitle = title || `Estás cerca de ${clubName}`
    const notificationBody = customBody || defaultMessage

    // ── Modo Miembro (geofencing automático desde el browser) ─────────────
    if (clientToken && typeof lat === 'number' && typeof lng === 'number') {
      const subscription = await PushSubscription.findOne({ clientToken }).lean()
      if (!subscription) {
        return NextResponse.json({ error: 'Suscripción no encontrada' }, { status: 404 })
      }

      // Verificar que el miembro pertenece a este tenant
      if (subscription.tenantId?.toString() !== tenant._id.toString()) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
      }

      // Buscar locaciones cercanas dentro del radio configurado
      const locations = await Location.find({
        tenantId: tenant._id,
        isActive: true,
        'geo.coordinates': { $exists: true },
      }).lean()

      const userPos = { lat, lng }
      let nearestLocation: string | null = null

      for (const loc of locations) {
        const locPos = {
          lat: loc.geo!.coordinates[1],
          lng: loc.geo!.coordinates[0],
        }
        const dist = haversineDistance(userPos, locPos)
        if (dist <= defaultRadius) {
          nearestLocation = loc.name
          break
        }
      }

      if (!nearestLocation) {
        return NextResponse.json({ message: 'No hay locaciones cercanas', sent: 0 })
      }

      const memberNotificationTitle = title || `¡Estás cerca de ${nearestLocation}!`
      const memberNotificationBody = customBody || defaultMessage

      const payload = JSON.stringify({
        title: memberNotificationTitle,
        body: memberNotificationBody,
        url: `/${tenantSlug}/menu`,
        icon: '/tgoicon.png',
        badge: '/tgoicon.png',
      })

      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        payload
      ).catch(async (err: any) => {
        if (err?.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: subscription._id })
        }
        throw err
      })

      // Log geofence_notified event
      await Feedback.create({
        tenantId: tenant._id,
        event: 'geofence_notified',
        clientHash: subscription.clientToken || undefined,
        metadata: { location: nearestLocation, title: memberNotificationTitle },
      }).catch(() => {})

      return NextResponse.json({ success: true, sent: 1, location: nearestLocation })
    }

    // ── Modo Admin (manual) ──────────────────────────────────────────────
    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const membersQuery: any = {
      tenantId: tenant._id,
      status: 'active',
    }

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

    let sentCount = 0
    let failedCount = 0

    const payload = JSON.stringify({
      title: notificationTitle,
      body: notificationBody,
      url: `/app/profile/club/${tenantSlug}`,
      icon: '/tgoicon.png',
      badge: '/tgoicon.png',
    })

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
        sentCount++
      } catch (error: any) {
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
