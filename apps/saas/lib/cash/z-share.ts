import Tenant from '@/models/Tenant'

// ============================================================================
// Link compartible del reporte Z — vigencia (Consenso v1 §4)
// ============================================================================

export const Z_SHARE_TTL_DAYS = 30

/** ¿El link del cierre sigue vigente? Vence a los 30 días del cierre. */
export function isShareTokenValid(closedAt: Date | string | null | undefined, now = new Date()): boolean {
  if (!closedAt) return false
  const closed = new Date(closedAt).getTime()
  if (!Number.isFinite(closed)) return false
  return now.getTime() - closed <= Z_SHARE_TTL_DAYS * 24 * 60 * 60 * 1000
}

/** Ruta pública del cierre (relativa al sitio del SaaS). */
export function zSharePath(tenantSlug: string, shareToken: string): string {
  return `/${tenantSlug}/cierre/${shareToken}`
}

/**
 * URL absoluta del cierre (informe de caja X4). El POS no conoce el slug del
 * comercio, así que el link lo arma el servidor. null si el link ya venció.
 */
export function zShareUrl(
  origin: string,
  tenantSlug: string,
  shareToken: string,
  closedAt: Date | string | null | undefined,
  now = new Date()
): string | null {
  if (!isShareTokenValid(closedAt, now)) return null
  return `${origin.replace(/\/$/, '')}${zSharePath(encodeURIComponent(tenantSlug), encodeURIComponent(shareToken))}`
}

/** Origen público del SaaS: NEXT_PUBLIC_URL o, si falta, el de la petición. */
export function publicOrigin(requestUrl: string): string {
  const env = process.env.NEXT_PUBLIC_URL?.trim()
  if (env && /^https?:\/\//.test(env)) return env.replace(/\/$/, '')
  return new URL(requestUrl).origin
}

export async function tenantSlugOf(tenantId: string): Promise<string | null> {
  const t = await Tenant.findById(tenantId).select('slug').lean<{ slug?: string }>()
  return t?.slug ?? null
}
