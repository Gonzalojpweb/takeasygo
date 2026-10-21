// ============================================================================
// scope-denials.ts — Observabilidad de accesos denegados por sede
// ============================================================================
// Cada vez que un guard de sede rechaza un request (recurso o sede fuera del
// alcance del usuario) queda en la bitácora (`multisede.scope_denied`, con la
// sede pedida, consultable por sede). Si el mismo usuario acumula
// DENIAL_THRESHOLD rechazos en DENIAL_WINDOW_MS, se manda una alerta de
// seguridad (máx. 1 por usuario por hora): puede ser un bug de UI que manda
// la sede equivocada o alguien probando ids de otras sedes.
//
// Nunca lanza: la observabilidad no puede romper el request.
// ============================================================================

import mongoose from 'mongoose'
import AuditLog from '@/models/AuditLog'
import SecurityAlertThrottle from '@/models/SecurityAlertThrottle'
import { logAudit } from '@/lib/audit'

export const DENIAL_THRESHOLD = 5
export const DENIAL_WINDOW_MS = 10 * 60 * 1000
const ALERT_COOLDOWN_MS = 60 * 60 * 1000
const ALERT_EMAIL = process.env.SECURITY_ALERT_EMAIL || 'takeasygo.latam@gmail.com'

export interface ScopeDenial {
  tenantId: string | null | undefined
  userId: string | null | undefined
  role?: string | null
  route: string
  locationId: unknown
}

/** Devuelve true si disparó una alerta (para tests). */
export async function recordScopeDenial(denial: ScopeDenial): Promise<boolean> {
  try {
    if (!denial.tenantId) return false
    const locationId = denial.locationId && mongoose.Types.ObjectId.isValid(String(denial.locationId))
      ? String(denial.locationId)
      : null

    await logAudit({
      tenantId: denial.tenantId,
      action: 'multisede.scope_denied',
      entity: 'location',
      locationId,
      details: { route: denial.route, requestedLocationId: locationId },
      userId: denial.userId && mongoose.Types.ObjectId.isValid(denial.userId) ? denial.userId : null,
      userName: '',
      userRole: denial.role ?? '',
    })

    if (!denial.userId || !mongoose.Types.ObjectId.isValid(denial.userId)) return false
    const recent = await AuditLog.countDocuments({
      tenantId: denial.tenantId,
      userId: denial.userId,
      action: 'multisede.scope_denied',
      createdAt: { $gte: new Date(Date.now() - DENIAL_WINDOW_MS) },
    })
    if (recent < DENIAL_THRESHOLD) return false

    // Throttle atómico: una alerta por usuario por hora.
    const key = `scope_denied:${denial.tenantId}:${denial.userId}`
    const now = new Date()
    const res = await SecurityAlertThrottle.updateOne(
      { key, lastSentAt: { $lte: new Date(now.getTime() - ALERT_COOLDOWN_MS) } },
      { $set: { lastSentAt: now } }
    )
    if (res.modifiedCount === 0) {
      const inserted = await SecurityAlertThrottle.updateOne(
        { key },
        { $setOnInsert: { key, lastSentAt: now } },
        { upsert: true }
      )
      if (inserted.upsertedCount === 0) return false // ya alertado en la última hora
    }

    console.warn('[SECURITY ALERT][multisede] accesos denegados repetidos', JSON.stringify({ ...denial, recent }))
    const { sendEmail, escapeHtml } = await import('@/lib/email')
    await sendEmail(
      ALERT_EMAIL,
      `[Takeasygo][Seguridad] ${recent} accesos denegados por sede en 10 min`,
      `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;">
        <h2 style="font-size:18px;margin:0 0 12px;">Accesos denegados por sede repetidos</h2>
        <p style="font-size:14px;margin:0 0 8px;">Tenant: <code>${escapeHtml(String(denial.tenantId))}</code></p>
        <p style="font-size:14px;margin:0 0 8px;">Usuario: <code>${escapeHtml(String(denial.userId))}</code> (${escapeHtml(denial.role ?? '')})</p>
        <p style="font-size:14px;margin:0 0 8px;">Última ruta: <code>${escapeHtml(denial.route)}</code></p>
        <p style="font-size:14px;margin:0;">Detalle en la bitácora: acción <code>multisede.scope_denied</code>.</p>
      </div>`
    ).catch(() => {})
    return true
  } catch (error) {
    console.error('[scope-denials] error registrando el rechazo', error)
    return false
  }
}
