export interface SelectedCustomizationOption {
  name: string
  extraPrice: number
  subGroups?: SelectedCustomization[]
}

export interface SelectedCustomization {
  groupName: string
  selectedOptions: SelectedCustomizationOption[]
}

export type CartItemType = 'menuItem' | 'promotion'

export interface SelectedVariant {
  name: string
  price: number
  takeawayPrice?: number
}

export interface CartItem {
  cartItemId: string           // `${menuItemId}:plain` or `${menuItemId}:${Date.now()}`
  menuItemId?: string
  promotionId?: string         // ID de la promoción si type === 'promotion'
  name: string
  basePrice: number
  extraPrice: number           // sum of selected options' extraPrice
  price: number                // basePrice + extraPrice
  quantity: number
  customizations: SelectedCustomization[]
  customizationSummary: string // e.g. "Papa fritas · Al punto"
  selectedVariant?: SelectedVariant
  addedFrom?: 'menu' | 'upsell_sheet' | 'checkout_banner'
  type: CartItemType          // 'menuItem' or 'promotion'
  /** Precio original de lista del menú. Si existe, significa que el item tiene descuento de categoría y el QR no aplica sobre él. */
  originalPrice?: number
  /** Precio takeaway original de lista del menú. Si existe, significa que el item tiene descuento de categoría en modo takeaway y el QR no aplica sobre él. */
  takeawayOriginalPrice?: number
}
