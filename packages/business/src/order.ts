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

interface HalfHalfItem {
  name: string
  variants?: { name: string; price: number }[]
  price: number
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
 * Calcula el precio extra de una pizza mitad y mitad.
 * Fórmula: MAX(precio_grande_A, precio_grande_B)
 *
 * @throws si algún item no tiene variante "Grande" válida
 */
export function calculateHalfHalfPrice(itemA: HalfHalfItem, itemB: HalfHalfItem): number {
  return Math.max(getGrandePrice(itemA), getGrandePrice(itemB))
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

  const extraPrice = calculateHalfHalfPrice(firstItem, secondItem)

  return {
    resolved: [
      {
        groupName: 'Primera mitad',
        selectedOptions: [{ name: firstFlavor, extraPrice: getGrandePrice(firstItem) }],
      },
      {
        groupName: 'Segunda mitad',
        selectedOptions: [{ name: secondFlavor, extraPrice: getGrandePrice(secondItem) }],
      },
    ],
    extraPrice,
    isHalfPrice: true,
  }
}
