/**
 * lib/security-alerts.ts — Avisos de seguridad del SuperAdmin (19/11/2026).
 *
 * Usa el SMTP que ya existe (lib/email.ts): sin servicios nuevos ni costos.
 * Destinatarios: el email de la cuenta y, si está configurado,
 * SECURITY_ALERT_EMAIL (segundo canal, idealmente en otro dominio/proveedor
 * que el email de login). Nunca incluye contraseñas, códigos ni tokens.
 * Nunca lanza: un fallo de SMTP no debe romper el login.
 */
import { sendEmail, escapeHtml, safeHeader } from '@/lib/email'

export interface SecurityAlert {
  /** Email de la cuenta afectada. */
  accountEmail: string | null | undefined
  /** Asunto corto, sin datos sensibles. */
  subject: string
  /** Qué pasó, en una línea. */
  summary: string
  ip?: string | null
  userAgent?: string | null
  /** Qué hacer si no fue el dueño de la cuenta. */
  ifNotYou?: string
}

function recipients(accountEmail: string | null | undefined): string[] {
  const list = new Set<string>()
  if (accountEmail) list.add(accountEmail.toLowerCase().trim())
  const second = process.env.SECURITY_ALERT_EMAIL?.trim()
  if (second) for (const e of second.split(',')) if (e.trim()) list.add(e.trim().toLowerCase())
  return [...list]
}

export async function sendSecurityAlert(alert: SecurityAlert): Promise<void> {
  if (!process.env.SMTP_HOST) return
  const to = recipients(alert.accountEmail)
  if (to.length === 0) return
  const when = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#0d0b0a">
      <h2 style="font-size:18px;margin:0 0 12px">Aviso de seguridad — TakeasyGO</h2>
      <p style="font-size:14px;line-height:1.5;margin:0 0 12px">${escapeHtml(alert.summary)}</p>
      <table style="font-size:13px;color:#4a4542;border-collapse:collapse">
        <tr><td style="padding:2px 12px 2px 0">Cuenta</td><td>${escapeHtml(alert.accountEmail ?? '—')}</td></tr>
        <tr><td style="padding:2px 12px 2px 0">Fecha</td><td>${escapeHtml(when)} (hora Argentina)</td></tr>
        <tr><td style="padding:2px 12px 2px 0">IP</td><td>${escapeHtml(alert.ip || 'desconocida')}</td></tr>
        <tr><td style="padding:2px 12px 2px 0">Dispositivo</td><td>${escapeHtml((alert.userAgent || 'desconocido').slice(0, 160))}</td></tr>
      </table>
      <p style="font-size:13px;line-height:1.5;margin:16px 0 0;color:#c0392b">
        ${escapeHtml(alert.ifNotYou ?? 'Si no fuiste vos: entrá al panel, cerrá todas las sesiones desde Seguridad y cambiá la contraseña. Si perdiste el acceso, usá el procedimiento de recuperación offline.')}
      </p>
    </div>`
  await Promise.all(
    to.map((addr) =>
      sendEmail(addr, safeHeader(`[Seguridad] ${alert.subject}`), html).catch((err) => {
        console.error('[security-alert] No se pudo enviar el aviso:', err?.message ?? err)
      }),
    ),
  )
}

/** IP y user-agent de una request (para auditoría y avisos). */
export function requestFingerprint(headers: Headers | null | undefined): { ip: string; userAgent: string } {
  const ip = headers?.get('x-forwarded-for')?.split(',')[0]?.trim() || headers?.get('x-real-ip') || ''
  const userAgent = (headers?.get('user-agent') ?? '').slice(0, 300)
  return { ip, userAgent }
}
