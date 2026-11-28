import type { OrderItem } from "@takeasygo/types"

export function calculateOrderTotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => {
    return sum + item.total
  }, 0)
}

/** Calculate item total including modifiers: (unitPrice + modifiersTotal) * quantity */
export function calculateItemTotal(item: OrderItem): number {
  const modifiersTotal = item.modifiers?.reduce((s, m) => s + m.price, 0) ?? 0
  return (item.unitPrice + modifiersTotal) * item.quantity
}

export function validateOrderItems(items: OrderItem[]): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  for (const item of items) {
    if (item.quantity <= 0) {
      errors.push(`Item "${item.name}" has invalid quantity: ${item.quantity}`)
    }
    if (item.unitPrice < 0) {
      errors.push(`Item "${item.name}" has negative unit price`)
    }
    const modifiersTotal =
      item.modifiers?.reduce((mSum, mod) => mSum + mod.price, 0) ?? 0
    const expectedTotal = (item.unitPrice + modifiersTotal) * item.quantity
    if (item.total !== expectedTotal) {
      errors.push(
        `Item "${item.name}" total mismatch: expected ${expectedTotal}, got ${item.total}`
      )
    }
  }

  return { valid: errors.length === 0, errors }
}

// ── Half-and-half (mitad y mitad) ──────────────────────────────────────────
//
// Cada comercio elige cómo cobra una pizza mitad y mitad (Tenant.halfAndHalf):
//   · 'max'      → el precio de la Grande más cara (default: lo de siempre)
//   · 'average'  → el promedio de las dos Grandes
//   · 'half_sum' → la suma de los «precio de media» de cada sabor (si un
//                  sabor no tiene precio de media, vale la mitad de su Grande)
// La misma función la usan la carta online, el servidor y el POS: todos
// cobran lo mismo. Montos en centavos.

export type HalfAndHalfPricing = 'max' | 'average' | 'half_sum'
export const HALF_AND_HALF_PRICINGS: readonly HalfAndHalfPricing[] = ['max', 'average', 'half_sum']

export function normalizeHalfPricing(value: unknown): HalfAndHalfPricing {
  return value === 'average' || value === 'half_sum' ? value : 'max'
}

interface HalfHalfItem {
  name: string
  variants?: { name: string; price: number }[]
  price: number
  /** Precio de media pizza cargado por el comercio (centavos, opcional). */
  halfPrice?: number | null
}

/**
 * Obtiene el precio de la variante "Grande" de un item.
 * Lanza Error si no existe variante "Grande" con precio > 0.
 */
function getGrandePrice(item: HalfHalfItem): number {
  const grande = item.variants?.find(v => v.name.toLowerCase() === 'grande')
  if (!grande || grande.price <= 0) {
    throw new Error(`"${item.name}" no tiene variante "Grande" válida para mitad y mitad`)
  }
  return grande.price
}

/**
 * Lo que aporta UN sabor según la regla: con 'max' su Grande completa; con
 * 'average' la mitad de su Grande; con 'half_sum' su precio de media (o la
 * mitad de la Grande si no tiene).
 */
export function halfShare(grandePrice: number, halfPrice: number | null | undefined, rule: HalfAndHalfPricing): number {
  if (rule === 'max') return grandePrice
  if (rule === 'half_sum' && typeof halfPrice === 'number' && halfPrice > 0) return Math.round(halfPrice)
  return Math.round(grandePrice / 2)
}

/** Total de la pizza a partir de lo que aporta cada sabor. */
export function halfHalfTotal(shareA: number, shareB: number, rule: HalfAndHalfPricing): number {
  return rule === 'max' ? Math.max(shareA, shareB) : shareA + shareB
}

/**
 * Precio de una pizza mitad y mitad según la regla del comercio.
 * @throws si algún item no tiene variante "Grande" válida
 */
export function calculateHalfHalfPrice(itemA: HalfHalfItem, itemB: HalfHalfItem, rule: HalfAndHalfPricing = 'max'): number {
  const a = halfShare(getGrandePrice(itemA), itemA.halfPrice, rule)
  const b = halfShare(getGrandePrice(itemB), itemB.halfPrice, rule)
  return halfHalfTotal(a, b, rule)
}

/**
 * Resuelve y valida customizaciones de mitad y mitad.
 * Usado tanto por orders/route.ts como por group-session/items/route.ts.
 *
 * @throws con mensajes descriptivos en caso de error de validación
 */
export function resolveHalfPriceCustomizations(
  clientCustomizations: any[],
  allMenuItems: any[],
  rule: HalfAndHalfPricing = 'max',
): { resolved: any[]; extraPrice: number; isHalfPrice: true } | null {
  const firstGroup = clientCustomizations.find((g: any) => g.groupName === 'Primera mitad')
  const secondGroup = clientCustomizations.find((g: any) => g.groupName === 'Segunda mitad')

  if (!firstGroup && !secondGroup) return null

  if (!firstGroup || !secondGroup) {
    throw new Error('Para pizza mitad y mitad, debés seleccionar ambas mitades')
  }

  const firstFlavor = firstGroup.selectedOptions?.[0]?.name
  const secondFlavor = secondGroup.selectedOptions?.[0]?.name

  if (!firstFlavor || !secondFlavor) {
    throw new Error('Falta seleccionar una de las mitades')
  }

  if (firstFlavor === secondFlavor) {
    throw new Error('No podés elegir el mismo sabor para ambas mitades')
  }

  const firstItem = allMenuItems.find((i: any) => i.name === firstFlavor)
  const secondItem = allMenuItems.find((i: any) => i.name === secondFlavor)

  if (!firstItem) {
    throw new Error(`"${firstFlavor}" no está disponible para mitad y mitad`)
  }
  if (!secondItem) {
    throw new Error(`"${secondFlavor}" no está disponible para mitad y mitad`)
  }

  const shareA = halfShare(getGrandePrice(firstItem), firstItem.halfPrice, rule)
  const shareB = halfShare(getGrandePrice(secondItem), secondItem.halfPrice, rule)

  return {
    resolved: [
      { groupName: 'Primera mitad', selectedOptions: [{ name: firstFlavor, extraPrice: shareA }] },
      { groupName: 'Segunda mitad', selectedOptions: [{ name: secondFlavor, extraPrice: shareB }] },
    ],
    extraPrice: halfHalfTotal(shareA, shareB, rule),
    isHalfPrice: true,
  }
}
