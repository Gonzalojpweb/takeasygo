// ============================================================================
// Canales de venta de una promoción o combo (20/11/2026)
// ============================================================================
// El comercio elige dónde vale cada oferta: Delivery, Para retirar o En el
// salón (menú QR de mesa). Lista vacía = todos los canales.
//
// · Promociones: el viejo campo `visibility` («Publicar en») nunca se respetó
//   (ni el menú ni el pedido lo miraban), así que por decisión del dueño las
//   promos existentes quedan en «Todos»: solo cuenta `channels`.
// · Combos: `visibility` sí se respetaba (sin delivery). Sin `channels`, se
//   traduce igual que antes: takeaway → retiro + delivery, dine-in → salón.
//
// Módulo puro (sin Mongo): lo usan el server, el menú, el checkout y el panel.
// ============================================================================

export const SALES_CHANNELS = ['delivery', 'takeaway', 'dine-in'] as const
export type SalesChannel = (typeof SALES_CHANNELS)[number]

/** short: «Solo delivery / para retirar / en el salón» · forText: «es solo para …» */
export const SALES_CHANNEL_INFO: Record<SalesChannel, { label: string; short: string; forText: string; emoji: string; hint: string }> = {
  delivery: { label: 'Delivery', short: 'delivery', forText: 'delivery', emoji: '🛵', hint: 'Pedidos con envío a domicilio' },
  takeaway: { label: 'Para retirar', short: 'para retirar', forText: 'retirar en el local', emoji: '🥡', hint: 'El cliente pide online y retira en el local' },
  'dine-in': { label: 'En el salón', short: 'en el salón', forText: 'consumir en el salón', emoji: '🍽️', hint: 'Menú QR de las mesas' },
}

export function isSalesChannel(value: unknown): value is SalesChannel {
  return typeof value === 'string' && (SALES_CHANNELS as readonly string[]).includes(value)
}

/**
 * Normaliza lo que manda el panel: sin repetidos, en orden fijo, y «todos
 * marcados» se guarda como lista vacía (= todos, también los canales que se
 * agreguen en el futuro). Devuelve null si viene algo inválido.
 */
export function normalizeChannels(input: unknown): SalesChannel[] | null {
  if (input == null) return []
  if (!Array.isArray(input)) return null
  if (input.some((c) => !isSalesChannel(c))) return null
  const set = new Set(input as SalesChannel[])
  const ordered = SALES_CHANNELS.filter((c) => set.has(c))
  return ordered.length === SALES_CHANNELS.length ? [] : ordered
}

function cleanList(raw: unknown): SalesChannel[] {
  if (!Array.isArray(raw)) return []
  const set = new Set(raw.filter(isSalesChannel))
  const ordered = SALES_CHANNELS.filter((c) => set.has(c))
  return ordered.length === SALES_CHANNELS.length ? [] : ordered
}

/** Canales de una promoción ([] = todos). Ignora el `visibility` heredado. */
export function promotionChannels(promo: { channels?: unknown } | null | undefined): SalesChannel[] {
  return cleanList(promo?.channels)
}

/** Canales de un combo ([] = todos), con la traducción del `visibility` viejo. */
export function comboChannels(combo: { channels?: unknown; visibility?: unknown } | null | undefined): SalesChannel[] {
  const explicit = cleanList(combo?.channels)
  if (explicit.length > 0) return explicit
  if (combo?.visibility === 'takeaway') return ['delivery', 'takeaway']
  if (combo?.visibility === 'dine-in') return ['dine-in']
  return []
}

/** Modo del pedido (orderMode) → canal. 'business' no es un canal de oferta. */
export function channelForMode(mode: string | null | undefined): SalesChannel | null {
  return isSalesChannel(mode) ? mode : null
}

/** ¿La oferta vale para un pedido en este modo? */
export function isOfferedInMode(channels: readonly SalesChannel[], mode: string | null | undefined): boolean {
  if (channels.length === 0) return true
  const channel = channelForMode(mode)
  return channel != null && channels.includes(channel)
}

/**
 * ¿Se muestra en este menú? El menú QR de mesa es «salón». El menú online
 * (para llevar) muestra lo de delivery y lo de retiro: la modalidad se elige
 * recién en el checkout, y una oferta de un solo canal lleva su etiqueta.
 */
export function isVisibleInMenu(channels: readonly SalesChannel[], menuMode: string | null | undefined): boolean {
  if (channels.length === 0) return true
  if (menuMode === 'dine-in') return channels.includes('dine-in')
  if (menuMode === 'business') return false
  return channels.includes('takeaway') || channels.includes('delivery')
}

function joinLabels(channels: readonly SalesChannel[], field: 'short' | 'forText' = 'short'): string {
  const names = channels.map((c) => SALES_CHANNEL_INFO[c][field])
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

/** Etiqueta para la tarjeta del menú: «Solo delivery». null = todos los canales. */
export function channelBadge(channels: readonly SalesChannel[]): { emoji: string; text: string } | null {
  if (channels.length === 0) return null
  const text = `Solo ${joinLabels(channels)}`
  return { emoji: channels.length === 1 ? SALES_CHANNEL_INFO[channels[0]].emoji : '📍', text }
}

/** Resumen para el panel: «Todos los canales» / «Delivery y para retirar». */
export function channelSummary(channels: readonly SalesChannel[]): string {
  if (channels.length === 0) return 'Todos los canales'
  const text = joinLabels(channels)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Mensaje al cliente cuando la oferta no vale en la modalidad elegida. */
export function channelMismatchMessage(kind: 'promo' | 'combo', title: string, channels: readonly SalesChannel[]): string {
  const what = kind === 'combo' ? 'El combo' : 'La promoción'
  return `${what} "${title}" es solo para ${joinLabels(channels, 'forText')}.`
}
