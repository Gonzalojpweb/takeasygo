import { PLAN_LABELS, type Plan } from '@/lib/plans'
import { getNewFeatures, getLostFeatures } from '@/lib/plan-notifications'

const PLAN_ORDER: Record<string, number> = {
  trial: 0,
  try: 1,
  buy: 2,
  full: 3,
  anfitrion: 0,
}

function buildPlanChangeEmail(params: {
  tenantName: string
  tenantSlug: string
  oldPlan: string
  newPlan: string
  isUpgrade: boolean
  features: string[]
}): string {
  const { tenantName, tenantSlug, oldPlan, newPlan, isUpgrade, features } = params
  const dashboardUrl = `${process.env.NEXTAUTH_URL ?? 'https://takeasygo.vercel.app'}/${tenantSlug}/admin`

  const featureList = features
    .map(f => `<li style="margin-bottom:8px;font-size:14px;color:#3c3a38;line-height:1.5;">
      <span style="color:${isUpgrade ? '#16a34a' : '#dc2626'};margin-right:8px;">${isUpgrade ? '✓' : '✗'}</span>
      ${f}
    </li>`)
    .join('')

  const title = isUpgrade
    ? `¡${tenantName} ahora tiene más herramientas!`
    : `Cambio de plan en ${tenantName}`

  const subtitle = isUpgrade
    ? `Pasaste de <strong>${oldPlan}</strong> a <strong>${newPlan}</strong>. Estas son las funcionalidades que se desbloquearon:`
    : `Tu plan cambió de <strong>${oldPlan}</strong> a <strong>${newPlan}</strong>. Perdiste acceso a:`

  return `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:520px;margin:0 auto;padding:40px 32px;background:#ffffff;border-radius:16px;border:1px solid #ede9e5;">
      <div style="margin-bottom:32px;">
        <div style="display:inline-flex;align-items:center;gap:10px;">
          <div style="width:32px;height:32px;background:#0d0b0a;border-radius:8px;display:flex;align-items:center;justify-content:center;">
            <span style="color:#fff;font-size:18px;font-style:italic;">T</span>
          </div>
          <span style="font-size:16px;font-weight:600;color:#0d0b0a;">Takeasygo</span>
        </div>
      </div>

      <h1 style="font-size:22px;font-weight:700;color:#0d0b0a;margin:0 0 12px;">${title}</h1>
      <p style="font-size:14px;color:#6b6460;line-height:1.6;margin:0 0 24px;">${subtitle}</p>

      ${features.length > 0 ? `<ul style="list-style:none;padding:0;margin:0 0 32px;">${featureList}</ul>` : ''}

      <a href="${dashboardUrl}"
         style="display:inline-block;background:#0d0b0a;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:14px 28px;border-radius:100px;">
        Ir al panel
      </a>

      <p style="font-size:12px;color:#b0aaa6;margin:24px 0 0;line-height:1.6;">
        Si tenés dudas sobre tu plan, contactanos respondiendo este email.
      </p>
    </div>
  `
}

export async function notifyPlanChange(
  tenantId: string,
  tenantName: string,
  tenantSlug: string,
  oldPlan: Plan,
  newPlan: Plan
): Promise<void> {
  const { connectDB } = await import('@/lib/mongoose')
  const { default: User } = await import('@/models/User')
  const { sendEmail } = await import('@/lib/email')

  const oldOrder = PLAN_ORDER[oldPlan] ?? 0
  const newOrder = PLAN_ORDER[newPlan] ?? 0
  const isUpgrade = newOrder > oldOrder

  const features = isUpgrade
    ? getNewFeatures(oldPlan, newPlan)
    : getLostFeatures(oldPlan, newPlan)

  if (features.length === 0) return

  await connectDB()
  const admins = await User.find({
    tenantId,
    role: { $in: ['admin', 'superadmin'] },
  }).lean()

  if (admins.length === 0) return

  const html = buildPlanChangeEmail({
    tenantName,
    tenantSlug,
    oldPlan: PLAN_LABELS[oldPlan] || oldPlan,
    newPlan: PLAN_LABELS[newPlan] || newPlan,
    isUpgrade,
    features,
  })

  const subject = isUpgrade
    ? `🎉 ${tenantName} — Plan actualizado a ${PLAN_LABELS[newPlan] || newPlan}`
    : `ℹ️ ${tenantName} — Plan cambiado a ${PLAN_LABELS[newPlan] || newPlan}`

  for (const admin of admins) {
    if (!(admin as any).email) continue
    try {
      await sendEmail((admin as any).email, subject, html)
    } catch (e) {
      console.error(`[plan-notifications] Error enviando email a ${(admin as any).email}:`, e)
    }
  }
}
