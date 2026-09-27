/**
 * lib/onboarding/notify.ts
 * Punto único de notificación cuando un tenant envía su onboarding a revisión.
 * Canal 1: email a takeasygo.latam@gmail.com
 * Canal 2: push notification (placeholder para integrar en Fase 2)
 */
import { sendEmail } from '../email'

interface NotifyTenant {
  name: string
  slug: string
  onboarding?: { submittedAt?: Date | null }
}

export async function notifyReviewSubmission(tenant: NotifyTenant) {
  const subject = `🔔 Revisión requerida: ${tenant.name}`
  const htmlBody = `
    <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 32px; background: #ffffff; border-radius: 16px; border: 1px solid #ede9e5;">
      <div style="margin-bottom: 24px;">
        <div style="width:32px;height:32px;background:#0d0b0a;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;">
          <span style="color:#fff;font-size:18px;font-style:italic;">T</span>
        </div>
      </div>
      <h1 style="font-size:22px;font-weight:600;color:#0d0b0a;margin:0 0 12px;">Nuevo tenant en revisión</h1>
      <p style="font-size:14px;color:#6b6460;line-height:1.6;margin:0 0 20px;">
        <strong>${tenant.name}</strong> (slug: <code>${tenant.slug}</code>) envió su menú para revisión y aprobación.
      </p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/superadmin/tenants"
         style="display:inline-block;background:#0d0b0a;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:14px 28px;border-radius:100px;">
        Ver en superadmin
      </a>
    </div>
  `

  // Canal 1: Email
  try {
    await sendEmail('takeasygo.latam@gmail.com', subject, htmlBody)
  } catch (e) {
    console.error('[notify] Error enviando email de revisión:', e)
  }

  // Canal 2: Push notification — placeholder para Fase 2
  // Integrar con FCM, OneSignal, o web-push según decisión de Gonzalo
  console.log(`[notify] push placeholder → ${tenant.slug} envió onboarding`)
}
