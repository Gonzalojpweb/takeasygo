import Menu from '@/models/Menu'
import { flattenMenuSnapshot, type RawMenu } from '@takeasygo/business'
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

  const hasHalfLabel = (item.modifiers ?? []).some((m) => isHalfLabel(m.name))
  if (hasHalfLabel) {
    assertHalfHalf(item, product)
  } else {
    assertNormal(item, product)
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
  for (const item of items) {
    assertItemMatchesCatalog(item, products)
  }
}
