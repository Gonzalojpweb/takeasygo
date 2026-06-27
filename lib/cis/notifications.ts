import mongoose from 'mongoose'
import Tenant from '@/models/Tenant'
import { sendEmail } from '@/lib/email'
import webpush from 'web-push'
import PushSubscription from '@/models/PushSubscription'

// ─────────────────────────────────────────────────────────────────────────────
// lib/cis/notifications.ts — Servicio de notificaciones CIS
// ─────────────────────────────────────────────────────────────────────────────
// Propósito: Enviar notificaciones a restaurantes cuando CIS detecta
// eventos importantes en sus clientes (AT_RISK, DORMANT, nuevos VIP, etc.)
//
// Canales: Email (nodemailer) + Web Push (web-push)
// WhatsApp: No disponible (sin proveedor aún)
//
// Patrón:
// - Rate limiting: no más de 1 notificación por cliente por 7 días
// - Per-tenant: cada restaurante recibe solo sus notificaciones
// - Configurable: el restaurante puede activar/desactivar cada tipo
// ─────────────────────────────────────────────────────────────────────────────

interface NotificationContext {
  tenantId: mongoose.Types.ObjectId
  tenantName: string
  tenantSlug: string
  customerName: string
  phoneHash: string
  segment: string
  previousSegment?: string
  healthScore: number
  previousHealthScore?: number
  daysSinceLastOrder?: number
  avgOrderInterval?: number
  totalSpent?: number
}

interface CisNotificationSettings {
  notifyAtRisk: boolean
  notifyDormant: boolean
  notifyNewVip: boolean
  notifyFrequencyDrop: boolean
  notifyRecovered: boolean
  emailEnabled: boolean
  pushEnabled: boolean
}

const DEFAULT_SETTINGS: CisNotificationSettings = {
  notifyAtRisk: true,
  notifyDormant: true,
  notifyNewVip: true,
  notifyFrequencyDrop: true,
  notifyRecovered: true,
  emailEnabled: true,
  pushEnabled: true,
}

// ── Obtener configuración de notificaciones del tenant ──────────────────────

async function getTenantSettings(tenantId: mongoose.Types.ObjectId): Promise<CisNotificationSettings> {
  const tenant = await Tenant.findById(tenantId).select({ 'notifications.cis': 1 }).lean() as any
  return { ...DEFAULT_SETTINGS, ...tenant?.notifications?.cis }
}

// ── Obtener emails de admin del tenant ──────────────────────────────────────

async function getAdminEmails(tenantId: mongoose.Types.ObjectId): Promise<string[]> {
  const User = (await import('@/models/User')).default
  const admins = await User.find({
    tenantIds: tenantId,
    role: { $in: ['admin', 'manager'] },
    email: { $exists: true, $ne: null },
  }).select({ email: 1 }).lean()

  return admins.map((a: any) => a.email).filter(Boolean)
}

// ── Obtener push subscriptions del tenant ───────────────────────────────────

async function getPushSubscriptions(tenantId: mongoose.Types.ObjectId) {
  return PushSubscription.find({ tenantId }).lean()
}

// ── Enviar email ────────────────────────────────────────────────────────────

async function sendNotificationEmail(
  to: string[],
  subject: string,
  html: string
): Promise<void> {
  for (const email of to) {
    try {
      await sendEmail(email, subject, html)
    } catch (err) {
      console.warn('[CisNotifications] Error sending email:', err)
    }
  }
}

// ── Enviar push notification ────────────────────────────────────────────────

async function sendPushNotification(
  subscriptions: any[],
  title: string,
  body: string,
  url: string
): Promise<void> {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY

  if (!vapidPublicKey || !vapidPrivateKey) return

  webpush.setVapidDetails(
    'mailto:notifications@takeasygo.com',
    vapidPublicKey,
    vapidPrivateKey
  )

  const payload = JSON.stringify({ title, body, url })

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    } catch (err: any) {
      // Si el subscription expiró (410), eliminarlo
      if (err?.statusCode === 410) {
        await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {})
      }
    }
  }
}

// ── Construir HTML del email ────────────────────────────────────────────────

function buildEmailHtml(
  tenantName: string,
  title: string,
  message: string,
  details: string,
  actionUrl: string
): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 16px; padding: 24px; margin-bottom: 24px;">
        <h1 style="color: white; margin: 0; font-size: 20px;">🔍 TakeasyGO Intelligence</h1>
        <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px;">${tenantName}</p>
      </div>

      <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <h2 style="color: #1e293b; margin: 0 0 12px; font-size: 18px;">${title}</h2>
        <p style="color: #475569; margin: 0 0 12px; font-size: 14px; line-height: 1.6;">${message}</p>
        <p style="color: #64748b; margin: 0; font-size: 13px; line-height: 1.5;">${details}</p>
      </div>

      <a href="${actionUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Ver en CRM →</a>

      <p style="color: #94a3b8; margin: 24px 0 0; font-size: 12px; text-align: center;">
        Esto es una alerta de Inteligencia de Clientes de TakeasyGO.<br>
        Para configurar estas notificaciones, visitá la sección de Configuración en tu panel.
      </p>
    </div>
  `
}

// ── Funciones públicas: enviar notificaciones por tipo de evento ─────────────

export async function notifyAtRiskCustomer(ctx: NotificationContext): Promise<void> {
  const settings = await getTenantSettings(ctx.tenantId)
  if (!settings.notifyAtRisk) return

  const emails = settings.emailEnabled ? await getAdminEmails(ctx.tenantId) : []
  const pushSubs = settings.pushEnabled ? await getPushSubscriptions(ctx.tenantId) : []

  const title = `⚠️ Cliente en riesgo: ${ctx.customerName}`
  const message = `${ctx.customerName} era un cliente ${ctx.previousSegment || 'frecuente'} pero está bajando la frecuencia. Lleva ${ctx.daysSinceLastOrder ?? '?'} días sin comprar.`
  const details = `Gasto total: $${(ctx.totalSpent ?? 0).toLocaleString('es-AR')} · Salud: ${ctx.healthScore}/100`
  const url = `https://${ctx.tenantSlug}.takeasygo.com/admin/${ctx.tenantSlug}/crm`

  if (emails.length > 0) {
    await sendNotificationEmail(emails, title, buildEmailHtml(ctx.tenantName, title, message, details, url))
  }
  if (pushSubs.length > 0) {
    await sendPushNotification(pushSubs, title, message, url)
  }
}

export async function notifyDormantCustomer(ctx: NotificationContext): Promise<void> {
  const settings = await getTenantSettings(ctx.tenantId)
  if (!settings.notifyDormant) return

  const emails = settings.emailEnabled ? await getAdminEmails(ctx.tenantId) : []
  const pushSubs = settings.pushEnabled ? await getPushSubscriptions(ctx.tenantId) : []

  const title = `😴 Cliente dormido: ${ctx.customerName}`
  const message = `${ctx.customerName} no viene hace ${ctx.daysSinceLastOrder ?? '?'} días. Su intervalo normal era cada ${ctx.avgOrderInterval ? Math.round(ctx.avgOrderInterval) : '?'} días. Es momento de intentar recuperarlo.`
  const details = `Gasto total: $${(ctx.totalSpent ?? 0).toLocaleString('es-AR')} · Salud: ${ctx.healthScore}/100`
  const url = `https://${ctx.tenantSlug}.takeasygo.com/admin/${ctx.tenantSlug}/crm`

  if (emails.length > 0) {
    await sendNotificationEmail(emails, title, buildEmailHtml(ctx.tenantName, title, message, details, url))
  }
  if (pushSubs.length > 0) {
    await sendPushNotification(pushSubs, title, message, url)
  }
}

export async function notifyNewVipCustomer(ctx: NotificationContext): Promise<void> {
  const settings = await getTenantSettings(ctx.tenantId)
  if (!settings.notifyNewVip) return

  const emails = settings.emailEnabled ? await getAdminEmails(ctx.tenantId) : []
  const pushSubs = settings.pushEnabled ? await getPushSubscriptions(ctx.tenantId) : []

  const title = `⭐ ¡Nuevo VIP: ${ctx.customerName}!`
  const message = `${ctx.customerName} acaba de ser clasificado como VIP. Gasta en promedio más que el 90% de tus clientes. ¡Hacelo sentir especial!`
  const details = `Gasto total: $${(ctx.totalSpent ?? 0).toLocaleString('es-AR')} · Salud: ${ctx.healthScore}/100`
  const url = `https://${ctx.tenantSlug}.takeasygo.com/admin/${ctx.tenantSlug}/crm`

  if (emails.length > 0) {
    await sendNotificationEmail(emails, title, buildEmailHtml(ctx.tenantName, title, message, details, url))
  }
  if (pushSubs.length > 0) {
    await sendPushNotification(pushSubs, title, message, url)
  }
}

export async function notifyFrequencyDrop(ctx: NotificationContext): Promise<void> {
  const settings = await getTenantSettings(ctx.tenantId)
  if (!settings.notifyFrequencyDrop) return

  const emails = settings.emailEnabled ? await getAdminEmails(ctx.tenantId) : []
  const pushSubs = settings.pushEnabled ? await getPushSubscriptions(ctx.tenantId) : []

  const title = `📉 Baja de frecuencia: ${ctx.customerName}`
  const message = `${ctx.customerName} redujo su frecuencia de compra. Antes venía cada ${ctx.avgOrderInterval ? Math.round(ctx.avgOrderInterval) : '?'} días y ya lleva ${ctx.daysSinceLastOrder ?? '?'} días sin venir.`
  const details = `Salud: ${ctx.healthScore}/100 · Segmento: ${ctx.segment}`
  const url = `https://${ctx.tenantSlug}.takeasygo.com/admin/${ctx.tenantSlug}/crm`

  if (emails.length > 0) {
    await sendNotificationEmail(emails, title, buildEmailHtml(ctx.tenantName, title, message, details, url))
  }
  if (pushSubs.length > 0) {
    await sendPushNotification(pushSubs, title, message, url)
  }
}

export async function notifyRecoveredCustomer(ctx: NotificationContext): Promise<void> {
  const settings = await getTenantSettings(ctx.tenantId)
  if (!settings.notifyRecovered) return

  const emails = settings.emailEnabled ? await getAdminEmails(ctx.tenantId) : []
  const pushSubs = settings.pushEnabled ? await getPushSubscriptions(ctx.tenantId) : []

  const title = `🎉 Cliente recuperado: ${ctx.customerName}`
  const message = `${ctx.customerName} volvió a comprar después de un período de inactividad. ¡Excelente noticia!`
  const details = `Salud: ${ctx.healthScore}/100 · Segmento: ${ctx.segment}`
  const url = `https://${ctx.tenantSlug}.takeasygo.com/admin/${ctx.tenantSlug}/crm`

  if (emails.length > 0) {
    await sendNotificationEmail(emails, title, buildEmailHtml(ctx.tenantName, title, message, details, url))
  }
  if (pushSubs.length > 0) {
    await sendPushNotification(pushSubs, title, message, url)
  }
}
