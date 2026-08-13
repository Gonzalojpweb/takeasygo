import webpush from 'web-push'
import PushSubscription from '@/models/PushSubscription'
import LoyaltyMember from '@/models/LoyaltyMember'
import PushNotificationLog from '@/models/PushNotificationLog'
import type { PushTargetType } from '@/models/PushNotificationLog'
import { connectDB } from '@/lib/mongoose'
import { canAccess, type Plan } from '@/lib/plans'
import { toPesos } from '@takeasygo/business'

webpush.setVapidDetails(
  'mailto:clickandthink1@gmail.com',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

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
 */
export async function sendAdminPushNotification(
  tenantId: string,
  plan: string,
  tenantName: string,
  tenantSlug: string,
  orderNumber: string,
  total: number, // en centavos
  customerName: string
): Promise<void> {
  // Solo disponible en Trial, Crecimiento y Premium
  const adminSubs = canAccess(plan as Plan, 'adminPushNotifications')
    ? await PushSubscription.find({ tenantId }).lean()
    : []
  if (adminSubs.length === 0) return

  const payload = JSON.stringify({
    title: `🔔 Nuevo pedido en ${tenantName}`,
    body: `#${orderNumber} — $${toPesos(total).toLocaleString('es-AR')} — ${customerName}`,
    icon: '/tgoicon-192.png',
    badge: '/tgoicon-192.png',
    url: `/${tenantSlug}/admin/orders`,
    tag: `order-${orderNumber}`,
    orderNumber,
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
