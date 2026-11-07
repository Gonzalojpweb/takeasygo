/**
 * lib/menu/list-price.ts — precio de lista (originalPrice) al cambiar un precio.
 *
 * `originalPrice` / `takeawayOriginalPrice` son el precio «de lista»: si es
 * MAYOR que el precio, la carta lo muestra tachado como ahorro y las promos
 * QR lo usan para saber si aplican. Antes, al editar un precio el de lista
 * quedaba congelado en el valor viejo: después de un aumento, bajar el precio
 * por debajo del viejo mostraba un descuento tachado FALSO.
 *
 * Regla:
 *   · sin descuento visible (lista ausente o ≤ precio anterior): la lista
 *     acompaña al precio nuevo (no hay tachado);
 *   · con descuento visible (lista > precio anterior): se respeta, salvo que
 *     el precio nuevo la alcance o la supere (entonces deja de haber tachado).
 * Pura: se usa en la edición de un plato y en «Actualizar precios».
 */
export function nextListPrice(oldPrice: number, oldList: number | null | undefined, newPrice: number): number {
  const hadDiscount = oldList != null && oldList > oldPrice
  if (!hadDiscount) return newPrice
  return newPrice >= (oldList as number) ? newPrice : (oldList as number)
}

/**
 * Lista nueva cuando un ajuste masivo se aplica a la lista y al precio por
 * igual (p. ej. +10 % a todo): si había descuento, la lista se ajusta con la
 * misma función para conservar el tachado proporcional.
 */
export function adjustedListPrice(oldPrice: number, oldList: number | null | undefined, newPrice: number, adjust: (cents: number) => number): number {
  const hadDiscount = oldList != null && oldList > oldPrice
  if (!hadDiscount) return newPrice
  const list = adjust(oldList as number)
  return list > newPrice ? list : newPrice
}
