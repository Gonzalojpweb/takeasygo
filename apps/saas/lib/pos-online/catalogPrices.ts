import Menu from '@/models/Menu'
import Combo from '@/models/Combo'
import { calculateComboPrice, flattenMenuSnapshot, isComboAvailable, isComboOnSchedule, validateComboSelection, type RawMenu } from '@takeasygo/business'
import Location from '@/models/Location'
import { DEFAULT_TIMEZONE } from '@/lib/restaurant-time'
import type { Product, ProductModifier } from '@takeasygo/types'
import { PosError } from './errors'
import type { PosOrderItemInput } from './orderMapper'

// ============================================================================
// Precios del catálogo — el server no confía en los precios que manda el POS
// ============================================================================
// El POS calcula con la carta que bajó de GET /pos/menu; entre esa descarga y
// esta escritura la carta pudo cambiar (o el payload pudo venir manipulado).
// Acá se re-valida contra el catálogo VIGENTE con la MISMA regla de aplanado
// (@takeasygo/business/menu-flatten): mismo catálogo, mismo precio.
//
// Contrato (decisión de producto): cualquier diferencia se RECHAZA con 409 —
// el cajero re-sincroniza el menú y reintenta. Nunca se persiste un importe
// que no cierra contra el catálogo.
//
// Espeja el cálculo de ProductConfigurationPanel del POS:
//  · normal → unitPrice = product.price; modificadores etiquetados
//             `${grupo}: ${opción}` con el extraPrice del catálogo
//  · mitad  → unitPrice = halfPrice(1er sabor) + halfPrice(2do sabor), con
//             etiquetas `Primera mitad: …` / `Segunda mitad: …`
// ============================================================================

const HALF_FIRST_PREFIX = 'Primera mitad: '
const HALF_SECOND_PREFIX = 'Segunda mitad: '
const HALF_GROUP_NAMES = ['__half_first', '__half_second'] as const

/**
 * Catálogo aplanado de una sede: la MISMA vista que sirve GET /pos/menu.
 * Una sede tiene a lo sumo un menú activo (índice único tenant+location).
 */
export async function loadPosCatalog(
  tenantId: string,
  locationId: string
): Promise<Map<string, Product>> {
  const menus = (await Menu.find({ tenantId, locationId, isActive: true })
    .lean()
    .exec()) as unknown as RawMenu[]
  const flat = flattenMenuSnapshot(menus)
  return new Map(flat.products.map((p) => [p.id, p]))
}

/**
 * Mapa etiqueta → precios válidos, recursivo por subgrupos.
 * Los grupos sintéticos de mitad y mitad (`__half_*`) se excluyen: el POS
 * normal nunca los emite como modificadores (espeja su handleConfirm).
 */
function collectModifierPrices(
  groups: readonly ProductModifier[] | undefined,
  into: Map<string, Set<number>>
): void {
  for (const group of groups ?? []) {
    if (group.name.startsWith('__half_')) continue
    for (const option of group.options ?? []) {
      const label = `${group.name}: ${option.name}`
      let prices = into.get(label)
      if (!prices) {
        prices = new Set()
        into.set(label, prices)
      }
      prices.add(option.price)
      if (option.subGroups?.length) collectModifierPrices(option.subGroups, into)
    }
  }
}

function isHalfLabel(name: string): boolean {
  return name.startsWith(HALF_FIRST_PREFIX) || name.startsWith(HALF_SECOND_PREFIX)
}

function assertHalfHalf(item: PosOrderItemInput, product: Product): void {
  const firstGroup = (product.modifiers ?? []).find((g) => g.name === HALF_GROUP_NAMES[0])
  const secondGroup = (product.modifiers ?? []).find((g) => g.name === HALF_GROUP_NAMES[1])
  if (!firstGroup || !secondGroup) {
    throw PosError.conflict(
      `"${product.name}" no admite mitad y mitad en el catálogo vigente`,
      `productId=${item.productId}`
    )
  }

  const mods = item.modifiers ?? []
  const firsts = mods.filter((m) => m.name.startsWith(HALF_FIRST_PREFIX))
  const seconds = mods.filter((m) => m.name.startsWith(HALF_SECOND_PREFIX))
  if (firsts.length !== 1 || seconds.length !== 1 || mods.length !== 2) {
    throw PosError.conflict(
      `Mitad y mitad de "${product.name}": modificadores fuera del catálogo`,
      `mods=${mods.map((m) => `${m.name}=${m.price}`).join(', ') || '(ninguno)'}`
    )
  }

  const flavorFirst = firsts[0].name.slice(HALF_FIRST_PREFIX.length)
  const flavorSecond = seconds[0].name.slice(HALF_SECOND_PREFIX.length)
  const optionFirst = firstGroup.options.find((o) => o.name === flavorFirst)
  const optionSecond = secondGroup.options.find((o) => o.name === flavorSecond)
  if (!optionFirst || !optionSecond) {
    throw PosError.conflict(
      `Sabor de mitad y mitad fuera del catálogo vigente en "${product.name}"`,
      `sabores=${flavorFirst} | ${flavorSecond}`
    )
  }

  const expectedUnit = optionFirst.price + optionSecond.price
  if (item.unitPrice !== expectedUnit) {
    throw PosError.conflict(
      `Precio de mitad y mitad de "${product.name}" fuera del catálogo vigente`,
      `unitPrice=${item.unitPrice} catalogPrice=${expectedUnit}`
    )
  }
  if (firsts[0].price !== optionFirst.price || seconds[0].price !== optionSecond.price) {
    throw PosError.conflict(
      `Modificador de mitad y mitad de "${product.name}" fuera del catálogo vigente`,
      `got=${firsts[0].price}+${seconds[0].price} catalog=${optionFirst.price}+${optionSecond.price}`
    )
  }
}

function assertNormal(item: PosOrderItemInput, product: Product): void {
  if (item.unitPrice !== product.price) {
    throw PosError.conflict(
      `Precio de "${product.name}" fuera del catálogo vigente`,
      `unitPrice=${item.unitPrice} catalogPrice=${product.price}`
    )
  }

  const validPrices = new Map<string, Set<number>>()
  collectModifierPrices(product.modifiers, validPrices)
  for (const modifier of item.modifiers ?? []) {
    if (isHalfLabel(modifier.name)) {
      throw PosError.conflict(
        `Modificador "${modifier.name}" fuera del catálogo vigente en "${product.name}"`,
        `productId=${item.productId}`
      )
    }
    const prices = validPrices.get(modifier.name)
    if (!prices || !prices.has(modifier.price)) {
      throw PosError.conflict(
        `Modificador "${modifier.name}" fuera del catálogo vigente en "${product.name}"`,
        `price=${modifier.price} productId=${item.productId}`
      )
    }
  }
}

/**
 * Valida un item contra el catálogo ya cargado (puro, sin DB).
 * Lanza `PosError.conflict` (409) ante cualquier diferencia.
 */
export function assertItemMatchesCatalog(
  item: PosOrderItemInput,
  products: ReadonlyMap<string, Product>
): void {
  const product = products.get(item.productId)
  if (!product) {
    throw PosError.conflict(
      `Producto "${item.name}" fuera del catálogo vigente`,
      `productId=${item.productId}`
    )
  }
  // Fase J: un artículo pausado (por un rol o por falta de stock) no se vende,
  // aunque el POS tenga la carta desactualizada (se sincroniza cada ~35 s).
  if (!product.isAvailable) {
    throw PosError.conflict(
      product.unavailableReason === 'stock'
        ? `«${item.name}» no tiene inventario (sin stock)`
        : `«${item.name}» está faltante (pausado)`,
      `productId=${item.productId}`
    )
  }

  const hasHalfLabel = (item.modifiers ?? []).some((m) => isHalfLabel(m.name))
  if (hasHalfLabel) {
    assertHalfHalf(item, product)
  } else {
    assertNormal(item, product)
  }
}

interface ComboForCatalog {
  _id: unknown
  name: string
  isActive: boolean
  priceMode: 'fixed' | 'sumItems'
  fixedPrice?: number | null
  itemPool: string[]
  minItems: number
  maxItems: number
  allowRepeat: boolean
  chargeCustomizationExtras: boolean
  availabilitySchedule?: { days?: number[]; from?: string; to?: string } | null
}

/**
 * Valida UN combo vendido (padre + platos). Puro, sin DB. El precio de cada
 * agregado se confirma contra la carta: en la línea viaja en cero (lo paga el
 * padre) y en `listPrice` su precio de lista.
 */
export function assertComboLinesMatchCatalog(
  lines: PosOrderItemInput[],
  combo: ComboForCatalog | undefined,
  products: ReadonlyMap<string, Product>,
  now: Date,
  timezone: string
): void {
  const parents = lines.filter((l) => !l.comboComponent)
  const units = lines.filter((l) => l.comboComponent)
  const parent = parents[0]
  if (parents.length !== 1 || units.length === 0) {
    throw PosError.conflict('Combo incompleto: volvé a armarlo', `instancia=${lines[0]?.comboInstanceId}`)
  }
  if (!combo || !combo.isActive || parent.productId !== String(combo._id)) {
    throw PosError.conflict(`El combo «${parent.name}» ya no está disponible`, `comboId=${parent.comboId}`)
  }
  if (!isComboOnSchedule(combo.availabilitySchedule, now, timezone)) {
    throw PosError.conflict(`El combo «${combo.name}» no está disponible en este horario`)
  }
  // Un producto pausado o sin stock pausa el combo entero.
  if (!isComboAvailable(combo, products as Map<string, Product>)) {
    throw PosError.conflict(`El combo «${combo.name}» está pausado: falta alguno de sus productos`)
  }
  const selection = validateComboSelection({
    itemPool: combo.itemPool,
    minItems: combo.minItems,
    maxItems: combo.maxItems,
    allowRepeat: combo.allowRepeat,
    selectedItemIds: units.map((u) => u.productId),
  })
  if (!selection.valid) throw PosError.conflict(selection.error ?? 'Selección de combo inválida')

  const priced = units.map((unit) => {
    const product = products.get(unit.productId) as Product
    if (unit.quantity !== 1 || unit.unitPrice !== 0 || unit.total !== 0) {
      throw PosError.conflict(`«${unit.name}» dentro de un combo va sin precio propio`, `unit=${unit.unitPrice} total=${unit.total}`)
    }
    const valid = new Map<string, Set<number>>()
    collectModifierPrices(product.modifiers, valid)
    let extra = 0
    for (const m of unit.modifiers ?? []) {
      const prices = valid.get(m.name)
      if (isHalfLabel(m.name) || !prices || m.price !== 0 || m.listPrice === undefined || !prices.has(m.listPrice)) {
        throw PosError.conflict(`Modificador "${m.name}" fuera del catálogo vigente en "${product.name}"`, `listPrice=${m.listPrice}`)
      }
      extra += m.listPrice
    }
    return { price: product.price, extraPrice: extra }
  })

  const price = calculateComboPrice({
    priceMode: combo.priceMode,
    fixedPrice: combo.fixedPrice ?? 0,
    chargeCustomizationExtras: combo.chargeCustomizationExtras,
    items: priced,
  })
  if (parent.quantity !== 1 || parent.unitPrice !== price.totalPrice || parent.total !== price.totalPrice || parent.modifiers?.length) {
    throw PosError.conflict(`Precio del combo «${combo.name}» fuera del catálogo vigente`, `unitPrice=${parent.unitPrice} catalogo=${price.totalPrice}`)
  }
}

/** Para POST /pos/orders/[id]/items — un solo item. */
export async function assertItemAgainstCatalog(
  item: PosOrderItemInput,
  tenantId: string,
  locationId: string
): Promise<void> {
  assertItemMatchesCatalog(item, await loadPosCatalog(tenantId, locationId))
}

/** Para POST /pos/orders — la orden completa con UNA lectura de catálogo. */
export async function assertOrderAgainstCatalog(
  items: PosOrderItemInput[],
  tenantId: string,
  locationId: string
): Promise<void> {
  const products = await loadPosCatalog(tenantId, locationId)
  const groups = new Map<string, PosOrderItemInput[]>()
  for (const item of items) {
    if (item.comboInstanceId) {
      const group = groups.get(item.comboInstanceId) ?? []
      group.push(item)
      groups.set(item.comboInstanceId, group)
    } else {
      assertItemMatchesCatalog(item, products)
    }
  }
  if (groups.size === 0) return

  const [combos, location] = await Promise.all([
    Combo.find({ tenantId, $or: [{ locationId: null }, { locationId }] }).lean<(ComboForCatalog & { _id: unknown })[]>(),
    Location.findOne({ _id: locationId, tenantId }).select('timezone').lean<{ timezone?: string }>(),
  ])
  const byId = new Map(combos.map((c) => [String(c._id), c]))
  const now = new Date()
  for (const lines of groups.values()) {
    assertComboLinesMatchCatalog(lines, byId.get(String(lines[0].comboId)), products, now, location?.timezone || DEFAULT_TIMEZONE)
  }
}
