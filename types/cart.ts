export interface SelectedCustomizationOption {
  name: string
  extraPrice: number
}

export interface SelectedCustomization {
  groupName: string
  selectedOptions: SelectedCustomizationOption[]
}

export type CartItemType = 'menuItem' | 'promotion'

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
  addedFrom?: 'menu' | 'upsell_sheet' | 'checkout_banner'
  type: CartItemType          // 'menuItem' or 'promotion'
}
