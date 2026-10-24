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
