export interface SelectedCustomizationOption {
  name: string
  extraPrice: number
  subGroups?: SelectedCustomization[]
}

export interface SelectedCustomization {
  groupName: string
  selectedOptions: SelectedCustomizationOption[]
}

export type CartItemType = 'menuItem' | 'promotion' | 'reward'

export interface SelectedVariant {
  name: string
  price: number
  takeawayPrice?: number
  businessPrice?: number
}

/** Una unidad elegida dentro de un slot de promoción (bundle). */
export interface PromoBundleUnit {
  menuItemId: string
  itemName: string
  slotName: string
  selectedVariant?: SelectedVariant
  customizations?: SelectedCustomization[]
  customizationSummary?: string
}

/** Selección completa de un slot dentro del bundle de una promoción. */
export interface PromoBundleSlot {
  slotName: string
  units: PromoBundleUnit[]
}

export interface CartItem {
  cartItemId: string           // `${menuItemId}:plain` or `${menuItemId}:${Date.now()}`
  menuItemId?: string
  promotionId?: string         // ID de la promoción si type === 'promotion'
  _promotionTitle?: string     // Título de la promo, para subtítulo en carrito
  _slotName?: string           // Nombre del slot, para subtítulo en carrito
  _itemName?: string           // Ítem elegido dentro de la promo (líneas legacy)
  _promotionShortDescription?: string
  /** Solo type === 'promotion': bundle completo (1 línea = 1 combo entero). */
  _bundle?: PromoBundleSlot[]
  name: string
  description?: string
  imageUrl?: string
  basePrice: number
  extraPrice: number           // sum of selected options' extraPrice
  price: number                // basePrice + extraPrice
  quantity: number
  customizations: SelectedCustomization[]
  customizationSummary: string // e.g. "Papa fritas · Al punto"
  selectedVariant?: SelectedVariant
  addedFrom?: 'menu' | 'upsell_sheet' | 'checkout_banner' | 'promotion' | 'group' | 'best_sellers' | 'store'
  type: CartItemType
  /** Solo type === 'reward': ítem de la tienda canjeado con puntos (línea $0). */
  storeItemId?: string
  /** Solo type === 'reward': costo en puntos del premio. */
  pointsCost?: number          // 'menuItem' or 'promotion'
  /** Precio original de lista del menú. Si existe, significa que el item tiene descuento de categoría y el QR no aplica sobre él. */
  originalPrice?: number
  /** Precio takeaway original de lista del menú. Si existe, significa que el item tiene descuento de categoría en modo takeaway y el QR no aplica sobre él. */
  takeawayOriginalPrice?: number
}
