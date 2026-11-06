import type { ComboPriceMode } from '@takeasygo/types'

export interface ComboPricingInputItem {
  price: number
  extraPrice?: number
}

export interface CalculateComboPriceParams {
  priceMode: ComboPriceMode
  fixedPrice?: number
  items: ComboPricingInputItem[]
  chargeCustomizationExtras?: boolean
}

export interface ComboPriceResult {
  basePrice: number
  extraPrice: number
  totalPrice: number
}

/**
 * Calcula el precio de un combo (compartido entre SaaS y POS).
 *
 * - fixed: basePrice = fixedPrice.
 * - sumItems: basePrice = suma de los precios de los ítems.
 * - extras: si chargeCustomizationExtras !== false, suma de extraPrice de las personalizaciones.
 */
export function calculateComboPrice({
  priceMode,
  fixedPrice = 0,
  items,
  chargeCustomizationExtras = true,
}: CalculateComboPriceParams): ComboPriceResult {
  let basePrice = 0
  if (priceMode === 'fixed') {
    basePrice = fixedPrice
  } else {
    basePrice = items.reduce((acc, it) => acc + (it.price || 0), 0)
  }

  const extraPrice = chargeCustomizationExtras
    ? items.reduce((acc, it) => acc + (it.extraPrice || 0), 0)
    : 0

  return {
    basePrice,
    extraPrice,
    totalPrice: basePrice + extraPrice,
  }
}

export interface CatalogItemAvailability {
  isAvailable?: boolean
  stockPortions?: number | null
}

/**
 * Verifica si un combo está disponible evaluando en tiempo de lectura
 * la disponibilidad de cada producto en su `itemPool`.
 *
 * Regla: Cualquier producto pausado (isAvailable === false) o sin porciones
 * de stock (stockPortions === 0) pausa el combo entero.
 */
export function isComboAvailable(
  combo: { itemPool?: string[]; isActive?: boolean },
  catalogItemsMap: Map<string, CatalogItemAvailability> | Record<string, CatalogItemAvailability>
): boolean {
  if (combo.isActive === false) return false
  if (!combo.itemPool || combo.itemPool.length === 0) return false

  const getCatalogItem = (id: string): CatalogItemAvailability | undefined => {
    if (catalogItemsMap instanceof Map) {
      return catalogItemsMap.get(id)
    }
    return catalogItemsMap[id]
  }

  for (const itemId of combo.itemPool) {
    const item = getCatalogItem(itemId)
    if (!item) return false
    if (item.isAvailable === false) return false
    if (typeof item.stockPortions === 'number' && item.stockPortions <= 0) return false
  }

  return true
}

/** ¿El horario del combo incluye este momento? Sin horario, siempre. */
export function isComboOnSchedule(
  schedule: { days?: number[]; from?: string; to?: string } | null | undefined,
  now: Date,
  timezone: string
): boolean {
  if (!schedule) return true
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const read = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(read('weekday'))
  if (schedule.days?.length && !schedule.days.includes(day)) return false
  if (!schedule.from || !schedule.to) return true
  const time = `${read('hour').padStart(2, '0')}:${read('minute').padStart(2, '0')}`
  // Franja que cruza la medianoche: 20:00 a 02:00.
  return schedule.from <= schedule.to ? time >= schedule.from && time < schedule.to : time >= schedule.from || time < schedule.to
}

export interface ValidateComboSelectionParams {
  itemPool: string[]
  minItems?: number
  maxItems?: number
  allowRepeat?: boolean
  selectedItemIds: string[]
}

/**
 * Valida que una selección de ítems cumpla con las reglas del combo.
 */
export function validateComboSelection({
  itemPool,
  minItems = 2,
  maxItems = 2,
  allowRepeat = true,
  selectedItemIds,
}: ValidateComboSelectionParams): { valid: boolean; error?: string } {
  const poolSet = new Set(itemPool)

  if (selectedItemIds.length < minItems) {
    return { valid: false, error: `Debés seleccionar al menos ${minItems} platos para este combo.` }
  }

  if (selectedItemIds.length > maxItems) {
    return { valid: false, error: `No podés seleccionar más de ${maxItems} platos para este combo.` }
  }

  for (const id of selectedItemIds) {
    if (!poolSet.has(id)) {
      return { valid: false, error: `El producto seleccionado (${id}) no pertenece a este combo.` }
    }
  }

  if (!allowRepeat) {
    const uniqueIds = new Set(selectedItemIds)
    if (uniqueIds.size !== selectedItemIds.length) {
      return { valid: false, error: 'Este combo no permite repetir el mismo plato.' }
    }
  }

  return { valid: true }
}
