// ============================================================================
// Carrusel «Los que se ganaron un ❤️» — selección de platos por likes
// ============================================================================
// Sección AUTOMÁTICA (como Más vendidos): nadie la arma a mano. Sale del
// contador `likesCount` de cada plato del menú de la sede, que solo suben los
// compradores (un like por pedido y plato, ver /api/[tenant]/menu/items/[id]/like).
//
// Reglas (definidas con el dueño, 19/11):
//   - un plato entra con al menos `minLikes` likes (3 por defecto, piso 2);
//   - la sección aparece solo si hay al menos 3 platos que califican;
//   - nunca más de 6 tarjetas. Si califican más, se ROTAN: cada ventana de
//     tiempo muestra 6 distintos, recorriendo toda la lista;
//   - los pausados / fuera de canal / fuera de horario los filtra quien llama
//     con la misma regla de visibilidad que el resto del menú.
// Función pura: sin DB ni React, para poder probarla y usarla en las dos cartas.
// ============================================================================

export const LIKED_MIN_ITEMS = 3
export const LIKED_MAX_ITEMS = 6
export const LIKED_DEFAULT_MIN_LIKES = 3
/** Por debajo de esto un «ranking» de likes no es creíble. */
export const LIKED_MIN_LIKES_FLOOR = 2
export const LIKED_MAX_MIN_LIKES = 50
/** Cada cuánto cambia la tanda de 6 cuando hay más platos que califican. */
export const LIKED_ROTATION_MS = 60 * 60 * 1000

export const LIKED_DEFAULT_TITLE = 'Los que se ganaron un ❤️'

export const LIKED_POSITIONS = [
  'afterFeatured',
  'beforeBestsellers',
  'afterBestsellers',
  'beforeCategories',
  'afterCategories',
] as const
export type LikedCarouselPosition = (typeof LIKED_POSITIONS)[number]

export interface LikedCarouselStyle {
  backgroundColor?: string
  textColor?: string
  accentColor?: string
  cardBgColor?: string
  heartColor?: string
}

export interface LikedCarouselSettings {
  showSection?: boolean
  sectionTitle?: string
  sectionSubtitle?: string
  position?: LikedCarouselPosition
  minLikes?: number
  style?: LikedCarouselStyle
}

export interface LikedEntry<TItem, TCategory> {
  item: TItem
  category: TCategory
}

/** `minLikes` efectivo: entero entre el piso y el techo; 3 si no hay dato válido. */
export function resolveMinLikes(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return LIKED_DEFAULT_MIN_LIKES
  return Math.min(LIKED_MAX_MIN_LIKES, Math.max(LIKED_MIN_LIKES_FLOOR, Math.round(n)))
}

/** Ventana de rotación actual (cambia cada LIKED_ROTATION_MS). */
export function likedRotationSlot(now: number = Date.now()): number {
  return Math.floor(now / LIKED_ROTATION_MS)
}

/**
 * Elige los platos del carrusel.
 *
 * @param entries   platos YA filtrados por visibilidad, en el orden del menú
 *                  (el orden del menú desempata a igual cantidad de likes).
 * @param rotation  ventana de rotación (likedRotationSlot). Solo importa si
 *                  califican más de 6 platos.
 * @returns entre 3 y 6 entradas ordenadas por likes, o [] si no alcanza.
 */
export function pickLikedItems<TItem extends { _id?: unknown; likesCount?: number | null }, TCategory>(
  entries: Array<LikedEntry<TItem, TCategory>>,
  options: { minLikes?: unknown; rotation?: number } = {},
): Array<LikedEntry<TItem, TCategory>> {
  const minLikes = resolveMinLikes(options.minLikes)

  // Un mismo plato no se repite (por las dudas: _id único por sede).
  const seen = new Set<string>()
  const qualifying: Array<LikedEntry<TItem, TCategory> & { index: number }> = []
  entries.forEach((entry, index) => {
    const id = String(entry.item._id ?? '')
    if (!id || seen.has(id)) return
    if ((entry.item.likesCount ?? 0) < minLikes) return
    seen.add(id)
    qualifying.push({ ...entry, index })
  })

  if (qualifying.length < LIKED_MIN_ITEMS) return []

  const byLikes = (a: { item: TItem; index: number }, b: { item: TItem; index: number }) =>
    (b.item.likesCount ?? 0) - (a.item.likesCount ?? 0) || a.index - b.index

  qualifying.sort(byLikes)

  let chosen = qualifying
  if (qualifying.length > LIKED_MAX_ITEMS) {
    // Rotación: ventanas consecutivas de 6 sobre la lista ordenada, dando la
    // vuelta al final. En n/6 ventanas pasan todos los platos que califican.
    const n = qualifying.length
    const rotation = Math.max(0, Math.floor(options.rotation ?? 0))
    const offset = (rotation * LIKED_MAX_ITEMS) % n
    chosen = Array.from({ length: LIKED_MAX_ITEMS }, (_, i) => qualifying[(offset + i) % n])
    chosen.sort(byLikes)
  }

  return chosen.map(({ item, category }) => ({ item, category }))
}

/** Recorre categorías y subcategorías en el orden del menú. */
export function collectMenuEntries<TCategory extends { items?: any[]; subcategories?: Array<{ items?: any[]; sortOrder?: number }> }>(
  categories: TCategory[],
  isVisible: (item: any) => boolean,
): Array<LikedEntry<any, TCategory>> {
  const out: Array<LikedEntry<any, TCategory>> = []
  for (const category of categories) {
    for (const item of category.items ?? []) {
      if (isVisible(item)) out.push({ item, category })
    }
    const subs = [...(category.subcategories ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    for (const sub of subs) {
      for (const item of sub.items ?? []) {
        if (isVisible(item)) out.push({ item, category })
      }
    }
  }
  return out
}

const HEX = /^#[0-9a-f]{3,8}$/i

/**
 * Normaliza lo que manda el formulario de Identidad antes de guardarlo.
 * Devuelve null si el valor no es un objeto.
 */
export function sanitizeLikedCarouselSettings(raw: unknown): Required<Omit<LikedCarouselSettings, 'style'>> & { style: LikedCarouselStyle } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const color = (v: unknown) => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim() : '')
  const styleRaw = (r.style && typeof r.style === 'object' ? r.style : {}) as Record<string, unknown>
  const position = LIKED_POSITIONS.includes(r.position as LikedCarouselPosition)
    ? (r.position as LikedCarouselPosition)
    : 'afterBestsellers'
  return {
    showSection: r.showSection !== false,
    sectionTitle: text(r.sectionTitle, 40) || LIKED_DEFAULT_TITLE,
    sectionSubtitle: text(r.sectionSubtitle, 80),
    position,
    minLikes: resolveMinLikes(r.minLikes),
    style: {
      backgroundColor: color(styleRaw.backgroundColor),
      textColor: color(styleRaw.textColor),
      accentColor: color(styleRaw.accentColor),
      cardBgColor: color(styleRaw.cardBgColor),
      heartColor: color(styleRaw.heartColor),
    },
  }
}

/** Contador estilo Instagram: 999 · 1,2 mil · 15 mil. */
export function formatLikes(count: number): string {
  if (count < 1000) return String(count)
  if (count < 10_000) return `${(count / 1000).toFixed(1).replace('.', ',').replace(',0', '')} mil`
  return `${Math.floor(count / 1000)} mil`
}
