import webpush from 'web-push'
import PushSubscription from '@/models/PushSubscription'
import LoyaltyMember from '@/models/LoyaltyMember'
import PushNotificationLog from '@/models/PushNotificationLog'
import type { PushTargetType } from '@/models/PushNotificationLog'
import { connectDB } from '@/lib/mongoose'
import { canAccess, type Plan } from '@/lib/plans'
import { canAccessLocation } from '@/lib/location-scope'
import { toPesos } from '@takeasygo/business'

try {
  webpush.setVapidDetails(
    'mailto:clickandthink1@gmail.com',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )
} catch {
  // Sin VAPID en el ambiente: Next importa todas las rutas al build y
  // setVapidDetails revienta sin claves — no debe romper el build.
}

const CHUNK_SIZE = 50

export interface SendResult {
  successCount: number
  failCount: number
  failedTokens: string[]
}

function buildPayload(title: string, body: string, url?: string) {
  return JSON.stringify({
    title,
    body,
    url: url ?? '/app',
    icon: '/tgoicon-192.png',
    badge: '/tgoicon-192.png',
  })
}

export async function sendPushToSubscription(
  sub: { endpoint: string; p256dh: string; auth: string; clientToken?: string },
  title: string,
  body: string,
  url?: string
): Promise<boolean> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      buildPayload(title, body, url)
    )
    return true
  } catch (err: any) {
    if (err?.statusCode === 410 && sub.clientToken) {
      await PushSubscription.deleteOne({ clientToken: sub.clientToken })
    }
    return false
  }
}

export async function sendBulkPush(
  subscriptions: { endpoint: string; p256dh: string; auth: string; clientToken?: string; _id?: any }[],
  title: string,
  body: string,
  url?: string
): Promise<SendResult> {
  let successCount = 0
  let failCount = 0
  const failedTokens: string[] = []
  const payload = buildPayload(title, body, url)

  for (let i = 0; i < subscriptions.length; i += CHUNK_SIZE) {
    const chunk = subscriptions.slice(i, i + CHUNK_SIZE)
    const results = await Promise.allSettled(
      chunk.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          )
          return true
        } catch (err: any) {
          if (err?.statusCode === 410 && sub.clientToken) {
            await PushSubscription.deleteOne({ clientToken: sub.clientToken })
          }
          throw err
        }
      })
    )

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        successCount++
      } else {
        failCount++
        const reason = r.status === 'rejected' ? r.reason : undefined
        failedTokens.push(reason?.message || 'unknown')
      }
    }
  }

  return { successCount, failCount, failedTokens }
}

/**
 * Envía una notificación push a todos los admins suscriptos de un tenant.
 * Se usa cuando un pedido pasa a ser visible en el workspace (pago online
 * confirmado por webhook, o transferencia confirmada por el cliente).
 * El tag `order-{orderNumber}` consolida notificaciones del mismo pedido.
 *
 * `locationId` (sede del pedido): cuando se pasa, los subs con stamp de
 * rol/assignedLocations (panel admin) se filtran con la misma regla que
 * canAccessLocation — un manager/cashier scoped NO recibe pedidos de otras
 * sedes. Los subs legacy sin stamp (anteriores al deploy) reciben todo
 * hasta re-suscribirse (el banner del panel re-suscribe en cada visita).
 */
export async function sendAdminPushNotification(
  tenantId: string,
  plan: string,
  tenantName: string,
  tenantSlug: string,
  orderNumber: string,
  total: number, // en centavos
  customerName: string,
  locationId?: string | null
): Promise<void> {
  // Solo disponible en Trial, Crecimiento y Premium
  const adminSubs = canAccess(plan as Plan, 'adminPushNotifications')
    ? await PushSubscription.find({ tenantId }).lean()
    : []
  if (adminSubs.length === 0) return

  // ── Aislamiento por sede ────────────────────────────────────────────────
  const eligibleSubs = locationId
    ? adminSubs.filter((sub) => {
        if (!sub.role) return true // legacy sin stamp: comportamiento previo
        return canAccessLocation(
          { role: sub.role, assignedLocations: (sub.assignedLocations ?? []).map(String) },
          locationId
        )
      })
    : adminSubs
  if (eligibleSubs.length === 0) return

  const payload = JSON.stringify({
    title: `🔔 Nuevo pedido en ${tenantName}`,
    body: `#${orderNumber} — $${toPesos(total).toLocaleString('es-AR')} — ${customerName}`,
    icon: '/tgoicon-192.png',
    badge: '/tgoicon-192.png',
    url: `/${tenantSlug}/admin/orders`,
    tag: `order-${orderNumber}`,
    orderNumber,
  })

  for (const sub of eligibleSubs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    } catch (err: any) {
      if (err?.statusCode === 410) {
        await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {})
      }
    }
  }
}

/**
 * Notificación push a los admins del tenant cuando un miembro crea un canje
 * en la tienda. Mismo gate y patrón que sendAdminPushNotification; el tag
 * `redemption-{id}` evita duplicados del mismo canje.
 */
export async function sendAdminRedemptionPushNotification(
  tenantId: string,
  plan: string,
  tenantName: string,
  tenantSlug: string,
  redemptionId: string,
  memberName: string,
  itemName: string,
  points: number
): Promise<void> {
  const adminSubs = canAccess(plan as Plan, 'adminPushNotifications')
    ? await PushSubscription.find({ tenantId }).lean()
    : []
  if (adminSubs.length === 0) return

  const payload = JSON.stringify({
    title: `🎉 Nuevo canje en ${tenantName}`,
    body: `${memberName} canjeó ${itemName} — ${points} pts`,
    icon: '/tgoicon-192.png',
    badge: '/tgoicon-192.png',
    url: `/${tenantSlug}/admin/store`,
    tag: `redemption-${redemptionId}`,
  })

  for (const sub of adminSubs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    } catch (err: any) {
      if (err?.statusCode === 410) {
        await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {})
      }
    }
  }
}

/**
 * ¿Corresponde emitir el push de "nuevo canje" al admin para este redemption?
 * Suprimido para canjes con orderId (los crea el checkout en orders/route):
 * esos avisos los gestiona el flujo del pedido — emitirlo duplicaría la
 * notificación. Solo aplica al único emisor: POST /store/redemptions.
 */
export function shouldSendAdminRedemptionPush(
  redemption: { orderId?: unknown } | null | undefined
): boolean {
  return Boolean(redemption) && !redemption!.orderId
}

export async function getSubscribersByPhoneHashes(
  tenantId: string,
  phoneHashes: string[]
): Promise<any[]> {
  if (phoneHashes.length === 0) return []
  return PushSubscription.find({
    tenantId,
    phoneHash: { $in: phoneHashes },
  }).lean()
}

export async function getMemberSubscribers(tenantId: string): Promise<any[]> {
  const members = await LoyaltyMember.find({
    tenantId,
    status: 'active',
  }).select('phoneHash _id name').lean()

  const phoneHashes = members.map(m => m.phoneHash).filter(Boolean)
  if (phoneHashes.length === 0) return []

  const subs = await PushSubscription.find({
    tenantId,
    phoneHash: { $in: phoneHashes },
  }).lean()

  return subs
}

export async function logPushNotification(
  data: {
    tenantId?: string
    sentBy: string
    sentByRole: 'admin' | 'manager' | 'superadmin'
    title: string
    body: string
    url?: string
    targetType: PushTargetType
    targetCount: number
    successCount: number
    failCount: number
  }
) {
  return PushNotificationLog.create({
    tenantId: data.tenantId,
    sentBy: data.sentBy,
    sentByRole: data.sentByRole,
    title: data.title,
    body: data.body,
    url: data.url || '',
    targetType: data.targetType,
    targetCount: data.targetCount,
    successCount: data.successCount,
    failCount: data.failCount,
  })
}

export async function getLastBroadcastTime(tenantId: string): Promise<Date | null> {
  const last = await PushNotificationLog.findOne({
    tenantId,
    targetType: { $in: ['all_members', 'all_consumers'] },
    sentByRole: { $ne: 'superadmin' },
  }).sort({ createdAt: -1 }).select('createdAt').lean()

  return last?.createdAt ?? null
}
