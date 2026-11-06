import { calculateComboPrice } from "@takeasygo/business/browser"
import type { OrderItem, Product } from "@takeasygo/types"

// ============================================================================
// Combos en el POS — armado de líneas, sin React
// ============================================================================
// Un combo son varias líneas del carrito unidas por `comboInstanceId`: la línea
// padre lleva el precio; cada plato va en cero, con su personalización. El server
// recalcula todo contra la carta (lib/pos-online/catalogPrices).
// ============================================================================

export function isComboLine(line: Pick<OrderItem, "comboInstanceId">): boolean {
  return Boolean(line.comboInstanceId)
}

/** ¿Trae mitad y mitad? No se puede pedir dentro de un combo. */
export function hasHalfModifiers(item: Pick<OrderItem, "modifiers">): boolean {
  return (item.modifiers ?? []).some((m) => /^(Primera|Segunda) mitad: /.test(m.name))
}

/** Separa los combos del resto: la grilla de productos no los muestra. */
export function splitCombos(products: Product[]): { regular: Product[]; combos: Product[] } {
  const regular: Product[] = []
  const combos: Product[] = []
  for (const p of products) (p.isCombo ? combos : regular).push(p)
  return { regular, combos }
}

/**
 * Líneas de un combo a partir de los platos elegidos (una unidad cada uno). El
 * precio de carta de cada agregado viaja en `listPrice` para que el server lo
 * valide; en la línea queda en cero para no contarlo dos veces.
 */
export function buildComboLines<T extends OrderItem>(combo: Product, units: T[], instanceId: string): (T | OrderItem)[] {
  const data = combo.comboData
  if (!data) throw new Error("[combo] Producto sin datos de combo")
  const price = calculateComboPrice({
    priceMode: data.priceMode,
    fixedPrice: data.fixedPrice ?? 0,
    chargeCustomizationExtras: data.chargeCustomizationExtras,
    items: units.map((u) => ({ price: u.unitPrice, extraPrice: (u.modifiers ?? []).reduce((s, m) => s + m.price, 0) })),
  })
  const shared = { comboId: data.id, comboInstanceId: instanceId, comboName: data.name }
  const parent: OrderItem = {
    productId: data.id,
    name: data.name,
    quantity: 1,
    unitPrice: price.totalPrice,
    total: price.totalPrice,
    ...shared,
  }
  const components = units.map((u) => ({
    ...u,
    ...shared,
    comboComponent: true,
    quantity: 1,
    unitPrice: 0,
    total: 0,
    modifiers: u.modifiers?.length ? u.modifiers.map((m) => ({ name: m.name, price: 0, listPrice: m.price })) : undefined,
  }))
  return [parent, ...components]
}

/** Quita una línea. Si es de un combo, cae el combo entero. */
export function removeCartLine<T extends Pick<OrderItem, "comboInstanceId">>(cart: T[], index: number): T[] {
  const instance = cart[index]?.comboInstanceId
  return instance ? cart.filter((l) => l.comboInstanceId !== instance) : cart.filter((_, i) => i !== index)
}

/** Campos de combo que viajan al server con cada línea. */
export function comboWireFields(item: OrderItem): Partial<OrderItem> {
  if (!item.comboInstanceId) return {}
  return {
    comboId: item.comboId,
    comboInstanceId: item.comboInstanceId,
    comboName: item.comboName,
    ...(item.comboComponent ? { comboComponent: true } : {}),
  }
}
