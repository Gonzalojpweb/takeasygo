// ============================================================================
// Programa de referidos — textos y helpers del lado del cliente (sin Mongo)
// ============================================================================
// lib/referrals.ts usa Mongoose y no puede ir al navegador: acá viven los
// nombres de los pasos, el armado del link y el mensaje para compartir.
// ============================================================================

export type ReferralTaskKey = 'registered' | 'first_online_order' | 'visit' | 'second_order'
export type StepState = 'credited' | 'pending' | 'reverted' | 'todo'

export const TASK_ORDER: ReferralTaskKey[] = ['registered', 'first_online_order', 'visit', 'second_order']

/** Cómo lo ve el que invita: lo que hace su amigo. */
export const TASK_COPY: Record<ReferralTaskKey, { title: string; short: string; detail: string }> = {
  registered: { title: 'Se suma al club con tu link', short: 'Se sumó', detail: 'Los puntos se acreditan cuando hace su primera compra.' },
  first_online_order: { title: 'Hace su primera compra online', short: 'Compra online', detail: 'Un pedido delivery o take away entregado.' },
  visit: { title: 'Va al local', short: 'Fue al local', detail: 'Pide en el local desde el QR de la mesa.' },
  second_order: { title: 'Vuelve a comprar', short: 'Volvió', detail: 'Una segunda compra dentro del plazo.' },
}

export const STEP_STATE_LABEL: Record<StepState, string> = {
  credited: 'Listo',
  pending: 'Pendiente',
  reverted: 'Se canceló',
  todo: 'Falta',
}

export function referralCookieName(tenantSlug: string): string {
  return `tgo_ref_${tenantSlug.replace(/[^a-z0-9-]/gi, '')}`
}

/** Recuerda el link 30 días: cualquier registro al club en ese tiempo lo toma. */
export function rememberReferralCode(tenantSlug: string, code: string) {
  try {
    document.cookie = `${referralCookieName(tenantSlug)}=${encodeURIComponent(code)}; Max-Age=${30 * 86_400}; Path=/; SameSite=Lax`
  } catch {
    // Sin cookies: el registro desde esta página igual manda el código.
  }
}

export function inviteLink(origin: string, tenantSlug: string, code: string): string {
  return `${origin}/${tenantSlug}/club/invitado/${code}`
}

export function shareMessage(clubName: string, link: string): string {
  return `Te invito al ${clubName}: sumate gratis con mi link y empezá a ganar puntos. ${link}`
}

export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

export const clubTokenKey = (tenantSlug: string) => `club_token_${tenantSlug}`
export const clubMembershipKey = (tenantSlug: string, locationId?: string | null) => (locationId ? `club_${tenantSlug}_${locationId}` : `club_${tenantSlug}`)
