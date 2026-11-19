import type { Product, ProductModifier } from "@takeasygo/types"

// ============================================================================
// «Disponibles hoy» del POS — grupos grandes (sabores) del catálogo
// ============================================================================
// Junta los grupos de más de 12 opciones de toda la carta. Un mismo grupo de
// la categoría lo heredan varios productos (¼, ½ y 1 kg): se muestra una sola
// vez con la lista de productos que lo usan. Puro, para poder testearlo.
// ============================================================================

export const LARGE_GROUP_THRESHOLD = 12

export interface AvailabilityOption {
  id: string
  name: string
  section?: string
  soldOut: boolean
}

export interface AvailabilityGroup {
  key: string
  name: string
  products: string[]
  options: AvailabilityOption[]
}

function collect(mods: ProductModifier[] | undefined, out: ProductModifier[]): void {
  for (const m of mods ?? []) {
    out.push(m)
    for (const o of m.options) collect(o.subGroups, out)
  }
}

export function largeOptionGroups(products: Product[]): AvailabilityGroup[] {
  const byKey = new Map<string, AvailabilityGroup>()
  for (const p of products) {
    if (p.isCombo) continue
    const mods: ProductModifier[] = []
    collect(p.modifiers, mods)
    for (const m of mods) {
      const withId = m.options.filter((o) => o.id)
      if (withId.length <= LARGE_GROUP_THRESHOLD) continue
      // Mismo grupo = mismas opciones (por id): así se dedupe el heredado.
      const key = withId.map((o) => o.id).sort().join(",")
      const existing = byKey.get(key)
      if (existing) {
        if (!existing.products.includes(p.name)) existing.products.push(p.name)
        continue
      }
      byKey.set(key, {
        key,
        name: m.name,
        products: [p.name],
        options: withId.map((o) => ({ id: o.id as string, name: o.name, section: o.section, soldOut: o.soldOut === true })),
      })
    }
  }
  return [...byKey.values()].sort((a, b) => b.options.length - a.options.length)
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

/** Opciones filtradas por texto y agrupadas por familia (sin familia al final). */
export function sectionedOptions(options: AvailabilityOption[], query: string): Array<[string, AvailabilityOption[]]> {
  const q = norm(query.trim())
  const list = q ? options.filter((o) => norm(o.name).includes(q)) : options
  const order: string[] = []
  const map = new Map<string, AvailabilityOption[]>()
  for (const o of list) {
    const k = o.section?.trim() ?? ""
    if (!map.has(k)) { map.set(k, []); order.push(k) }
    map.get(k)!.push(o)
  }
  const named = order.filter(Boolean).map((k) => [k, map.get(k)!] as [string, AvailabilityOption[]])
  if (map.has("")) named.push([named.length ? "Otros" : "", map.get("")!])
  return named
}
