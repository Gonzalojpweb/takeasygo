import type { CartItem, SelectedCustomization } from '@/types/cart'
import type { IOrderItem } from '@/models/Order'

/**
 * Reconstruye el carrito del cliente a partir de los items de un pedido.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
 * Cuando el cliente cancela un pedido varado y vuelve al checkout, no puede
 * rearmar el carrito a mano: se olvidaría de una customización o una variante y
 * el pedido siguiente saldría distinto. `order.items` ya tiene TODO lo que se
 * necesita (precio final por línea, customizaciones, variante), así que el
 * checkout se reconstruye desde ahí.
 *
 * ── LO QUE NO SE PIERDE ──────────────────────────────────────────────────────
 * `customizations` y `selectedVariant` se copian tal cual, y `extraPrice` /
 * `price` / `subtotal` son los que efectivamente se cobraron. El resumen en
 * texto se regenera con el mismo formato que usa el carrito real, así que la
 * línea se ve idéntica a como la armó el cliente.
 *
 * ── LO QUE NO SE RECUPERA (y por qué está bien) ──────────────────────────────
 * - `imageUrl`: no se persiste en el pedido. El checkout lo resuelve por
 *   `menuItemId`; si no aparece, la línea queda sin foto, no rota.
 * - `originalPrice` / `takeawayOriginalPrice`: son precios de lista para saber si
 *   el QR aplica. Si faltan, el recálculo de promociones puede diferir un poco;
 *   es preferible a inventar un precio.
 * - Items de tipo `reward`: son premios ocultos, no productos que el cliente
 *   pueda volver a agregar. Reinsertarlos en el carrito sería mostrarle algo
 *   que no existe en el menú.
 */

/** Mismo formato que CustomizationSheet: "Grupo: op1, op2 · Grupo2: op3". */
export function buildCustomizationSummary(customizations: SelectedCustomization[]): string {
  return customizations
    .flatMap((c) => {
      const groupLabel = c.groupName ? `${c.groupName}: ` : ''
      const opts = (c.selectedOptions || []).map((o) => {
        let text = o.name
        if (o.subGroups && o.subGroups.length > 0) {
          const sub = buildCustomizationSummary(o.subGroups)
          if (sub) text += ` (${sub})`
        }
        return text
      })
      if (opts.length === 0) return []
      return [`${groupLabel}${opts.join(', ')}`]
    })
    .join(' · ')
}

const ADDED_FROM_VALUES: readonly string[] = [
  'menu',
  'upsell_sheet',
  'checkout_banner',
  'promotion',
  'group',
  'best_sellers',
]

/**
 * `IOrderItem` no declara `_id`, pero los subdocumentos guardados por Mongoose
 * sí lo traen y es lo que hace único cada renglón del pedido. `addedFrom` llega
 * como string en los pedidos viejos, así que se ensancha también.
 */
type StoredOrderItem = IOrderItem & { _id?: { toString(): string } }

export function orderItemsToCartItems(items: StoredOrderItem[]): CartItem[] {
  return (items || [])
    // Los premios ocultos no son productos del menú: no vuelven al carrito.
    .filter((item) => item?.itemType !== 'reward')
    .map((item, index) => {
      const itemId = item.menuItemId?.toString() ?? item._id?.toString() ?? 'item'
      const isPromotion = item.itemType === 'promotion' || !!item.promotionId
      const customizations: SelectedCustomization[] = item.customizations || []

      const cartItem: CartItem = {
        // Único por línea del pedido. El índice va por si acaso el `_id` del
        // subdocumento no viniera (una proyección `lean` que lo excluya, por
        // ejemplo): dos `cartItemId` iguales hacen que React reutilice la fila
        // y que "aumentar cantidad"-Corrija la línea que no es.
        cartItemId: `${itemId}:${item._id?.toString() ?? index}`,
        name: item.name,
        description: item.description || undefined,
        basePrice: item.basePrice ?? 0,
        extraPrice: item.extraPrice ?? 0,
        price: item.price ?? item.subtotal ?? 0,
        quantity: item.quantity ?? 1,
        customizations,
        customizationSummary: buildCustomizationSummary(customizations),
        type: isPromotion ? 'promotion' : 'menuItem',
      }

      if (item.menuItemId) cartItem.menuItemId = item.menuItemId.toString()
      if (item.promotionId) cartItem.promotionId = item.promotionId.toString()
      if (item.promotionTitle) cartItem._promotionTitle = item.promotionTitle
      if (item.slotName) cartItem._slotName = item.slotName
      if (item.selectedVariant) cartItem.selectedVariant = item.selectedVariant
      // `addedFrom` es un string libre en el pedido, pero el carrito espera un
      // conjunto cerrado de orígenes. Un valor desconocido no se propaga.
      if (item.addedFrom && ADDED_FROM_VALUES.includes(item.addedFrom)) {
        cartItem.addedFrom = item.addedFrom as CartItem['addedFrom']
      }

      return cartItem
    })
}