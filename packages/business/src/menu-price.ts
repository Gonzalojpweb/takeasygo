// ============================================================================
// Precio de un plato o variante según el canal — regla ÚNICA SaaS ⇄ POS
// ============================================================================
// 23/11/2026 (bug): en el editor de la carta «Comer acá» y «Para llevar» son
// campos separados. Si el comercio completaba solo «Para llevar», el precio
// de salón quedaba en 0: el menú de salón mostraba $0, el pedido de salón se
// cobraba $0 y el POS vendía a $0. Regla: el precio de salón es el propio si
// es mayor que 0; si quedó en 0 y hay precio para llevar, vale ese.
// ============================================================================

export interface ChannelPriced {
  price?: number | null
  takeawayPrice?: number | null
  businessPrice?: number | null
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)

/** Precio de salón (dine-in / POS). */
export function salonPrice(src: ChannelPriced | null | undefined): number {
  const p = num(src?.price)
  if (p > 0) return p
  return Math.max(0, num(src?.takeawayPrice))
}

/** Precio para llevar / delivery (sin precio propio, el de salón). */
export function takeawayChannelPrice(src: ChannelPriced | null | undefined): number {
  const t = num(src?.takeawayPrice)
  return t > 0 ? t : salonPrice(src)
}

/** Precio business (corporativo): el propio si está cargado; si no, el de salón. */
export function businessChannelPrice(src: ChannelPriced | null | undefined): number {
  if (src?.businessPrice != null) return Math.max(0, num(src.businessPrice))
  return salonPrice(src)
}

/** Precio según el modo del pedido o del menú. */
export function channelPrice(src: ChannelPriced | null | undefined, mode: string | null | undefined): number {
  if (mode === 'takeaway' || mode === 'delivery') return takeawayChannelPrice(src)
  if (mode === 'business') return businessChannelPrice(src)
  return salonPrice(src)
}
