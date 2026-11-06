import { randomUUID } from 'node:crypto'
import { calculateComboPrice, isComboAvailable, isComboOnSchedule, validateComboSelection } from '@takeasygo/business'

// ============================================================================
// Líneas de un combo en un pedido online — el server calcula todo
// ============================================================================
// Una línea padre con el precio del combo y una línea componente en cero por cada
// plato, con su personalización. Los precios salen de la carta, nunca del cliente.
// ============================================================================

export class ComboOrderError extends Error {}

export interface ComboCartUnit {
  menuItemId: string
  customizations?: any[]
  selectedVariant?: { name: string } | null
}

export interface ComboOrderContext {
  combo: any
  units: ComboCartUnit[]
  quantity: number
  /** 'dine-in' | 'takeaway' | 'delivery' | 'business' */
  mode: string
  /** Solo productos vendibles ahora en este modo. */
  menuItemMap: Map<string, any>
  timezone: string
  addedFrom?: string | null
  resolveCustomizations: (customizations: any[], groups: any[]) => { resolved: any[]; extraPrice: number }
  now?: Date
}

function modePrice(source: any, mode: string): number {
  const value =
    mode === 'takeaway' || mode === 'delivery'
      ? source.takeawayPrice ?? source.price
      : mode === 'business'
        ? source.businessPrice ?? source.price
        : source.price
  return Number(value) || 0
}

export function buildOnlineComboLines(ctx: ComboOrderContext): any[] {
  const { combo, units, menuItemMap } = ctx
  const offeredIn = ctx.mode === 'dine-in' ? 'dine-in' : 'takeaway'
  if (!combo || !combo.isActive || !['both', offeredIn].includes(combo.visibility)) {
    throw new ComboOrderError('El combo no está disponible')
  }
  if (!isComboOnSchedule(combo.availabilitySchedule, ctx.now ?? new Date(), ctx.timezone)) {
    throw new ComboOrderError(`El combo "${combo.name}" no está disponible en este horario`)
  }
  // Un producto fuera del mapa está pausado o sin stock: pausa el combo entero.
  if (!isComboAvailable(combo, menuItemMap)) {
    throw new ComboOrderError(`El combo "${combo.name}" no está disponible: falta alguno de sus productos`)
  }
  const selection = validateComboSelection({
    itemPool: combo.itemPool,
    minItems: combo.minItems,
    maxItems: combo.maxItems,
    allowRepeat: combo.allowRepeat,
    selectedItemIds: units.map((u) => String(u.menuItemId)),
  })
  if (!selection.valid) throw new ComboOrderError(selection.error ?? 'Selección inválida')

  const chargeExtras = combo.chargeCustomizationExtras !== false
  const resolvedUnits = units.map((unit) => {
    const item = menuItemMap.get(String(unit.menuItemId))
    const hasVariants = (item.variants ?? []).length > 0
    let variant: any = null
    if (hasVariants) {
      variant = item.variants.find((v: any) => v.name === unit.selectedVariant?.name)
      if (!variant) throw new ComboOrderError(`Elegí una variante válida para "${item.name}"`)
    }
    const customizations = unit.customizations ?? []
    if (customizations.some((c) => /mitad/i.test(c?.groupName ?? ''))) {
      throw new ComboOrderError('La mitad y mitad no se puede pedir dentro de un combo')
    }
    const groups = [
      ...(item.categoryCustomizationGroups ?? []),
      ...(item.customizationGroups ?? []),
      ...(variant?.customizationGroups ?? []),
    ]
    let resolved: { resolved: any[]; extraPrice: number } = { resolved: [], extraPrice: 0 }
    if (customizations.length > 0) {
      try {
        resolved = ctx.resolveCustomizations(customizations, groups)
      } catch (err) {
        throw new ComboOrderError(err instanceof Error ? err.message : 'Personalización inválida')
      }
    }
    return { item, variant, resolved, base: modePrice(variant ?? item, ctx.mode) }
  })

  const price = calculateComboPrice({
    priceMode: combo.priceMode,
    fixedPrice: combo.fixedPrice ?? 0,
    chargeCustomizationExtras: chargeExtras,
    items: resolvedUnits.map((u) => ({ price: u.base, extraPrice: Math.round(u.resolved.extraPrice) })),
  })

  const lines: any[] = []
  for (let n = 0; n < ctx.quantity; n++) {
    const comboInstanceId = randomUUID()
    const shared = { comboId: String(combo._id), comboInstanceId, comboName: combo.name, promotionId: null, addedFrom: ctx.addedFrom ?? null, hasCategoryDiscount: false }
    lines.push({
      ...shared,
      menuItemId: null,
      itemType: 'combo',
      comboComponent: false,
      categoryName: 'Combos',
      categoryId: null,
      name: combo.name,
      description: combo.description ?? '',
      basePrice: price.basePrice,
      extraPrice: price.extraPrice,
      price: price.totalPrice,
      quantity: 1,
      subtotal: price.totalPrice,
      customizations: [],
      selectedVariant: null,
      printRole: 'kitchen',
    })
    for (const unit of resolvedUnits) {
      lines.push({
        ...shared,
        menuItemId: unit.item._id,
        itemType: 'menuItem',
        comboComponent: true,
        categoryName: unit.item.categoryName ?? '',
        categoryId: unit.item.categoryId ?? null,
        name: unit.item.name,
        description: '',
        basePrice: 0,
        extraPrice: 0,
        price: 0,
        quantity: 1,
        subtotal: 0,
        customizations: unit.resolved.resolved,
        selectedVariant: unit.variant ? { name: unit.variant.name, price: 0 } : null,
        printRole: unit.item.printRole || 'kitchen',
      })
    }
  }
  return lines
}
