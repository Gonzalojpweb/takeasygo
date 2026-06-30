import type { OrderItem } from "@takeasygo/types"

export function calculateOrderTotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => {
    const modifiersTotal =
      item.modifiers?.reduce((mSum, mod) => mSum + mod.price, 0) ?? 0
    return sum + item.total + modifiersTotal * item.quantity
  }, 0)
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
    if (item.total !== item.unitPrice * item.quantity) {
      errors.push(
        `Item "${item.name}" total mismatch: expected ${
          item.unitPrice * item.quantity
        }, got ${item.total}`
      )
    }
  }

  return { valid: errors.length === 0, errors }
}
