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
  visit: { title: 'Va al local', short: 'Fue al local', detail: 'Pide en el local desde el QR de la mesa o da su celular al pagar en la caja.' },
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

// ── Plata (protección del margen) ───────────────────────────────────────────

/** $ en formato argentino, sin decimales. Entra en centavos. */
export function pesosAR(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('es-AR')}`
}

/**
 * Gasto mínimo del invitado para que el premio no supere `pct` % de lo que
 * gastó (misma cuenta que lib/referrals.requiredSpendCents). 0 = sin tope.
 * Ej.: premio de $9.000 al 15 % → $60.000. @storedAs cents
 */
export function requiredSpendFor(rewardValueCents: number | null | undefined, pct: number): number {
  if (!rewardValueCents || pct <= 0) return 0
  return Math.ceil((rewardValueCents * 100) / pct)
}

// ── Reglas y condiciones (fuente única de los textos) ─────────────────────
// Las mismas reglas se explican al socio, al invitado y al admin, cada uno
// desde su lado. Si cambia una regla en lib/referrals.ts, se cambia acá.

export interface RulesInput {
  tenantName: string
  activeTasks: ReferralTaskKey[]
  secondOrderWindowDays: number
  rewardValidityDays: number
  monthlyInviteLimit: number
  rewardName: string | null
  endsAt: string | null
  /** Mínimos y tope de costo del premio (protección del margen). @storedAs cents */
  minOrderCents?: number
  minOrderByTask?: Partial<Record<'first_online_order' | 'visit' | 'second_order', number | null>>
  requiredSpendCents?: number
}

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' })

/** Cómo funciona, para el socio que invita (3 pasos). */
export const MEMBER_HOW_IT_WORKS = [
  { title: 'Compartí tu link', body: 'Mandalo por WhatsApp o redes. Es personal: así sabemos que tu amigo viene de tu parte.' },
  { title: 'Tu amigo se suma y compra', body: 'Se suma gratis al club con tu link y empieza a pedir. Él también suma sus propios puntos.' },
  { title: 'Vos ganás en cada paso', body: 'Sumás puntos cada vez que tu amigo avanza y, al completar todo, te ganás el premio.' },
]

/** Reglas y condiciones que lee el socio que invita. */
export function memberRules(r: RulesInput): Array<{ title: string; body: string }> {
  const rules: Array<{ title: string; body: string }> = [
    { title: 'Solo amigos nuevos', body: `Cuentan personas que nunca compraron en ${r.tenantName} ni eran socias del club.` },
    { title: 'Con tu link', body: 'Tu amigo tiene que sumarse con tu link. Si lo abre y se suma más tarde desde el mismo celular (hasta 30 días), también cuenta.' },
    { title: 'Mismo celular', body: 'Tu amigo tiene que pedir con el celular con el que se sumó: así reconocemos sus compras.' },
    { title: 'Un paso cuenta cuando el pedido se entrega', body: 'Los puntos se suman cuando el pedido de tu amigo se entrega. Si después se cancela, se descuentan los puntos de ese paso.' },
  ]
  const mins = minimumsText(r)
  if (mins) rules.push({ title: 'Compra mínima', body: mins })
  if (r.activeTasks.includes('registered')) {
    rules.push({ title: 'Puntos del registro', body: 'Quedan «pendientes» hasta que tu amigo hace su primera compra. Si nunca compra, no se acreditan.' })
  }
  if (r.activeTasks.includes('visit')) {
    rules.push({ title: 'Visita al local', body: 'Cuenta cuando tu amigo pide en el local desde el QR de la mesa, o cuando da su celular al pagar en la caja.' })
  }
  if (r.activeTasks.includes('second_order')) {
    rules.push({ title: 'Volver a comprar', body: `La segunda compra tiene que ser dentro de los ${r.secondOrderWindowDays} días de la primera.` })
  }
  if (r.rewardName) {
    rules.push({
      title: 'El premio',
      body: `«${r.rewardName}» se desbloquea cuando tu amigo completa todos los pasos${r.requiredSpendCents ? ` y lleva gastados al menos ${pesosAR(r.requiredSpendCents)} en compras que cuentan` : ''}. Lo usás en el local mostrando el código; vence a los ${r.rewardValidityDays} días. Si antes de usarlo se cancela un pedido que lo había desbloqueado, el premio se cancela.`,
    })
  }
  if (r.monthlyInviteLimit > 0) rules.push({ title: 'Límite', body: `Hasta ${r.monthlyInviteLimit} amigos nuevos cada 30 días.` })
  rules.push(
    { title: 'Un amigo, un socio', body: 'Cada amigo cuenta para un solo socio: el primero que lo invitó.' },
    { title: 'No vale invitarte a vos', body: 'Ni con otro número, otro email o desde tu mismo celular: esas invitaciones no suman.' },
  )
  if (r.endsAt) rules.push({ title: 'Vigencia', body: `Vale para amigos que se sumen hasta el ${fmtDay(r.endsAt)}. Los que ya se sumaron siguen sumando después.` })
  rules.push({ title: 'Privacidad', body: 'De tus amigos solo ves el nombre, la inicial del apellido y en qué paso van. Ellos no ven tus datos.' })
  return rules
}

/** «Cada pedido tiene que ser de al menos $X (la visita al local, $Y)». '' si no hay mínimos. */
export function minimumsText(r: Pick<RulesInput, 'minOrderCents' | 'minOrderByTask'>): string {
  const base = r.minOrderCents ?? 0
  const by = r.minOrderByTask ?? {}
  const label: Record<string, string> = { first_online_order: 'la compra online', visit: 'la visita al local', second_order: 'la segunda compra' }
  const overrides = (Object.keys(label) as Array<keyof typeof label>)
    .filter((k) => by[k as 'visit'] != null && by[k as 'visit'] !== base)
    .map((k) => `${label[k]}, ${pesosAR(by[k as 'visit']!)}`)
  if (base <= 0 && overrides.length === 0) return ''
  const head = base > 0 ? `Un pedido cuenta si sus productos suman al menos ${pesosAR(base)} (sin contar el envío)` : 'Un pedido cuenta para un paso si llega al mínimo de ese paso (sin contar el envío)'
  return `${head}${overrides.length ? `; ${overrides.join('; ')}` : ''}. Un pedido más chico se vende igual, pero no suma para el programa.`
}

/** Lo que lee el amigo invitado antes de sumarse. */
export function inviteeRules(r: { tenantName: string; referrerName: string; welcomePoints: number }): string[] {
  return [
    `Sumarte al club es gratis${r.welcomePoints > 0 ? ` y recibís ${r.welcomePoints} puntos de bienvenida` : ''}.`,
    `Cada compra en ${r.tenantName} te suma puntos que podés canjear por premios.`,
    'Pedí siempre con este mismo celular para que tus compras sumen.',
    `${r.referrerName} va a ver tu nombre, la inicial de tu apellido y si ya compraste. Nada más: ni tu celular ni tu email.`,
    'Esta invitación es para personas que todavía no son socias ni compraron en el comercio.',
  ]
}

/** Lo que tiene que hacer el comercio para que el programa funcione. */
export const ADMIN_SETUP_STEPS = [
  { title: 'Cargá el premio', body: 'Creá el premio como artículo en la Tienda del club (por ejemplo «Pizza grande gratis») y elegilo acá abajo.' },
  { title: 'Definí puntos y reglas', body: 'Elegí cuántos puntos gana el socio por cada paso de su amigo, los plazos y el límite. Después activá el programa.' },
  { title: 'Cuidá tu margen', body: 'Poné una compra mínima por pedido (tu ticket promedio es una buena referencia) y un tope de costo del premio. Así un café no desbloquea un almuerzo.' },
  { title: 'Avisale al equipo de caja', body: 'Al cobrar en el POS, que pregunten «¿sos socio del club?» y carguen el celular: así la compra suma puntos y cuenta como visita.' },
  { title: 'Entregá los premios', body: 'Cuando un socio muestre el código de su premio, validalo en Tienda → Solicitudes, como cualquier canje.' },
]

/** Reglas automáticas que el sistema aplica siempre (el admin no las configura). */
export const ADMIN_AUTOMATIC_RULES = [
  'Solo cuentan personas nuevas: que nunca compraron en tu comercio ni eran socias del club.',
  'Cada amigo cuenta para un solo socio: el primero que lo invitó.',
  'No vale invitarse a uno mismo: se controla el celular, el email, el usuario y el dispositivo.',
  'Un paso cuenta cuando el pedido se entrega y llega a la compra mínima. Si el pedido se cancela, los puntos de ese paso se descuentan solos.',
  'La compra mínima se mide sobre los productos, ya con descuentos y sin el envío: el delivery no infla el monto.',
  'El premio se entrega recién cuando el invitado gastó lo suficiente para que el valor del premio no supere el tope que elegiste.',
  'Los puntos del registro quedan pendientes hasta la primera compra del amigo: un registro falso no cuesta nada.',
  'El premio se entrega una sola vez por amigo. Si se cancela un pedido antes de que el socio lo use, el premio se cancela y vuelve el stock.',
  'Los puntos ganados quedan fijos: si cambiás la configuración, aplica a lo que se gane desde ese momento.',
  'Los socios ven solo nombre e inicial de sus amigos; los amigos no ven datos del socio.',
]

export const clubTokenKey = (tenantSlug: string) => `club_token_${tenantSlug}`
export const clubMembershipKey = (tenantSlug: string, locationId?: string | null) => (locationId ? `club_${tenantSlug}_${locationId}` : `club_${tenantSlug}`)
