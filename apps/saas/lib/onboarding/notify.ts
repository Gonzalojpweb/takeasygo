/**
 * lib/onboarding/notify.ts
 * Punto único de notificación cuando un tenant envía su onboarding a revisión.
 * Canal 1: email a takeasygo.latam@gmail.com
 * Canal 2: push notification (placeholder para integrar en Fase 2)
 */
import { sendEmail, sendOnboardingApprovedEmail, sendOnboardingRejectedEmail, escapeHtml, safeHeader } from '../email'

const FALLBACK_ADMIN_EMAIL = 'takeasygo.latam@gmail.com'

function adminInbox(): string {
  return process.env.ADMIN_EMAIL?.trim() || FALLBACK_ADMIN_EMAIL
}

const APP_BASE = () => process.env.APP_URL || 'http://localhost:3000'

interface NotifyTenant {
  name: string
  slug: string
  onboarding?: { submittedAt?: Date | null; menuPhotos?: string[] | null }
}

function menuPhotosHtml(tenant: NotifyTenant): string {
  const photos = tenant.onboarding?.menuPhotos ?? []
  if (photos.length === 0) return ''

  const thumbs = photos
    .map(
      (url) => `
        <a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;">
          <img src="${escapeHtml(url)}" alt="Foto del menú" width="96" height="72"
               style="width:96px;height:72px;object-fit:cover;border-radius:8px;border:1px solid #ede9e5;display:block;" />
        </a>`
    )
    .join('')

  return `
      <p style="font-size:14px;color:#6b6460;line-height:1.6;margin:0 0 8px;">
        Fotos del menú que subió el solicitante (${photos.length}):
      </p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin:0 0 24px;">${thumbs}</div>
  `
}

export async function notifyReviewSubmission(tenant: NotifyTenant) {
  const subject = `🔔 Revisión requerida: ${safeHeader(tenant.name)}`
  const htmlBody = `
    <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 32px; background: #ffffff; border-radius: 16px; border: 1px solid #ede9e5;">
      <div style="margin-bottom: 24px;">
        <div style="width:32px;height:32px;background:#0d0b0a;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;">
          <span style="color:#fff;font-size:18px;font-style:italic;">T</span>
        </div>
      </div>
      <h1 style="font-size:22px;font-weight:600;color:#0d0b0a;margin:0 0 12px;">Nuevo tenant en revisión</h1>
      <p style="font-size:14px;color:#6b6460;line-height:1.6;margin:0 0 20px;">
        <strong>${escapeHtml(tenant.name)}</strong> (slug: <code>${escapeHtml(tenant.slug)}</code>) envió su menú para revisión y aprobación.
      </p>
      ${menuPhotosHtml(tenant)}
      <a href="${APP_BASE()}/superadmin/tenants"
         style="display:inline-block;background:#0d0b0a;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:14px 28px;border-radius:100px;">
        Ver en superadmin
      </a>
    </div>
  `

  // Canal 1: Email
  try {
    await sendEmail(adminInbox(), subject, htmlBody)
  } catch (e) {
    console.error('[notify] Error enviando email de revisión:', e)
  }

  // Canal 2: Push notification — placeholder para Fase 2
  // Integrar con FCM, OneSignal, o web-push según decisión de Gonzalo
  console.log(`[notify] push placeholder → ${tenant.slug} envió onboarding`)
}

/**
 * Avisa al prospecto el resultado de la revisión de su onboarding.
 * - approved → link al panel del tenant
 * - rejected  → link a la pantalla de estado (muestra el motivo)
 *
 * Nunca lanza: un fallo de SMTP no debe romper la aprobación/rechazo.
 */
export async function notifyOnboardingDecision(
  tenant: NotifyTenant,
  to: string,
  action: 'approved' | 'rejected',
  reason?: string | null
) {
  if (!to) return

  try {
    if (action === 'approved') {
      await sendOnboardingApprovedEmail(to, `${APP_BASE()}/${tenant.slug}/admin`)
      console.log(`[notify] → ${to} aprobado (${tenant.slug})`)
    } else {
      await sendOnboardingRejectedEmail(
        to,
        reason?.trim() || 'No especificado',
        `${APP_BASE()}/${tenant.slug}/admin/onboarding/estado`
      )
      console.log(`[notify] → ${to} rechazado (${tenant.slug})`)
    }
  } catch (e) {
    console.error('[notify] Error enviando email de decisión de onboarding:', e)
  }
}
