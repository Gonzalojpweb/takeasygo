// ============================================================================
// Unidades de inventario — conversión explícita, nunca implícita
// ============================================================================
// DECISIONES_VIGENTES D-07: cada insumo tiene UNA unidad canónica (kg, g, l,
// ml o unit) y el ledger siempre guarda cantidades en esa unidad. Las recetas
// y recepciones pueden expresarse en otra unidad de la MISMA dimensión
// (g → kg, ml → l); entre dimensiones distintas (caja → kg) no hay conversión
// automática: se rechaza en vez de asumir 1:1.
// ============================================================================

export const INVENTORY_UNITS = ["kg", "g", "l", "ml", "unit"] as const
export type InventoryUnit = (typeof INVENTORY_UNITS)[number]

export type UnitDimension = "mass" | "volume" | "count"

const UNIT_DEF: Record<InventoryUnit, { dimension: UnitDimension; toBase: number }> = {
  kg: { dimension: "mass", toBase: 1000 },
  g: { dimension: "mass", toBase: 1 },
  l: { dimension: "volume", toBase: 1000 },
  ml: { dimension: "volume", toBase: 1 },
  unit: { dimension: "count", toBase: 1 },
}

export const UNIT_LABELS: Record<InventoryUnit, string> = {
  kg: "kg",
  g: "g",
  l: "l",
  ml: "ml",
  unit: "u.",
}

export function isInventoryUnit(value: unknown): value is InventoryUnit {
  return typeof value === "string" && (INVENTORY_UNITS as readonly string[]).includes(value)
}

export function unitDimension(unit: InventoryUnit): UnitDimension {
  return UNIT_DEF[unit].dimension
}

/** Precisión de cantidades: 6 decimales de la unidad canónica (1 mg si es kg). */
export function roundQuantity(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

/**
 * Convierte entre unidades de la misma dimensión. Devuelve null si las
 * dimensiones difieren (ej. "unit" → "kg"): el llamador decide qué hacer,
 * nunca se asume una equivalencia.
 */
export function convertQuantity(quantity: number, from: InventoryUnit, to: InventoryUnit): number | null {
  if (from === to) return quantity
  const a = UNIT_DEF[from]
  const b = UNIT_DEF[to]
  if (a.dimension !== b.dimension) return null
  return roundQuantity((quantity * a.toBase) / b.toBase)
}

/** Formatea una cantidad para la UI en la unidad dada (es-AR). */
export function formatQuantity(quantity: number, unit: InventoryUnit, maxDecimals = 2): string {
  const n = new Intl.NumberFormat("es-AR", { maximumFractionDigits: maxDecimals }).format(quantity)
  return `${n} ${UNIT_LABELS[unit]}`
}
