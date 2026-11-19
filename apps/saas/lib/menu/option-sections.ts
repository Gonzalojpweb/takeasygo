// ============================================================================
// Familias de opciones (secciones) — lista sugerida + texto libre
// ============================================================================
// Modelo híbrido (definido con el dueño, 19/11): damos una lista sugerida por
// rubro y cada comercio puede escribir las suyas. `suggestSection` propone una
// familia por palabras clave para ordenar de un toque listas ya cargadas.
// ============================================================================

export const SUGGESTED_SECTIONS = [
  'Cremas',
  'Chocolates',
  'Dulce de leche',
  'Frutales',
  'Al agua',
  'Especiales',
  'Sin azúcar',
  'Veganos',
] as const

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Orden importa: la primera regla que coincide gana («Chocolate con almendras» → Chocolates).
const RULES: Array<[RegExp, string]> = [
  [/\b(sin azucar|light|diet)\b/, 'Sin azúcar'],
  [/\b(vegan|vegano|vegana)\b/, 'Veganos'],
  [/\b(dulce de leche|ddl)\b/, 'Dulce de leche'],
  [/\b(choco|chocolate|chocotorta|cacao|rocher|nutella|bombon)/, 'Chocolates'],
  [/\b(al agua|sorbete|granizado de limon)\b/, 'Al agua'],
  [/\b(limon|frutilla|frambuesa|anana|maracuya|durazno|mango|banana|cereza|frutos|kiwi|naranja|pomelo|arandano|mora|melon|sandia|uva|manzana|pera|frutal)/, 'Frutales'],
  [/\b(crema|vainilla|americana?o?|sambayon|flan|tramontana|mascarpone|tiramisu|coco|mantecol|crocantino|cielo|rusa|irlandesa|cheesecake)/, 'Cremas'],
]

/** Familia sugerida para un nombre, o null si ninguna regla aplica. */
export function suggestSection(name: string): string | null {
  const n = norm(name)
  for (const [re, section] of RULES) if (re.test(n)) return section
  return null
}

/** Familias para elegir: las sugeridas + las que el comercio ya usa (sin repetir). */
export function sectionChoices(used: Array<string | undefined | null>): string[] {
  const seen = new Map<string, string>()
  for (const s of [...SUGGESTED_SECTIONS, ...used]) {
    const t = (s ?? '').trim()
    if (t && !seen.has(norm(t))) seen.set(norm(t), t)
  }
  return [...seen.values()]
}

/**
 * Agrupa opciones por familia respetando el orden en que aparecen las familias
 * en la lista (las sin familia van al final bajo «Otros»).
 */
export function groupBySection<T extends { section?: string | null }>(options: T[], otherLabel = 'Otros'): Array<[string, T[]]> {
  const order: string[] = []
  const map = new Map<string, T[]>()
  for (const o of options) {
    const key = (o.section ?? '').trim() || ''
    if (!map.has(key)) { map.set(key, []); order.push(key) }
    map.get(key)!.push(o)
  }
  const named = order.filter(k => k)
  const result: Array<[string, T[]]> = named.map(k => [k, map.get(k)!])
  if (map.has('')) result.push([named.length ? otherLabel : '', map.get('')!])
  return result
}

/**
 * Familias para MOSTRAR al cliente. Si el local cargó familias, se usan esas.
 * Si no cargó ninguna, se sugieren por el nombre (Chocolates, Cremas…), en el
 * orden de la lista sugerida y con «Otros» al final; si así no salen al menos
 * dos familias, va todo junto sin títulos ([['', opciones]]).
 */
export function displaySections<T extends { name: string; section?: string | null }>(options: T[]): Array<[string, T[]]> {
  if (options.some(o => (o.section ?? '').trim())) return groupBySection(options, 'Otros')
  const buckets = new Map<string, T[]>()
  for (const o of options) {
    const key = suggestSection(o.name) ?? ''
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(o)
  }
  const named = SUGGESTED_SECTIONS.filter(s => buckets.has(s))
  if (named.length < 2) return [['', options]]
  const out: Array<[string, T[]]> = named.map(s => [s, buckets.get(s)!])
  if (buckets.has('')) out.push(['Otros', buckets.get('')!])
  return out
}
