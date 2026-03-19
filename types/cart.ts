export interface SelectedCustomizationOption {
  name: string
  extraPrice: number
}

export interface SelectedCustomization {
  groupName: string
  selectedOptions: SelectedCustomizationOption[]
}

export interface CartItem {
  cartItemId: string           // `${menuItemId}:plain` or `${menuItemId}:${Date.now()}`
  menuItemId: string
  name: string
  basePrice: number
  extraPrice: number           // sum of selected options' extraPrice
  price: number                // basePrice + extraPrice
  quantity: number
  customizations: SelectedCustomization[]
  customizationSummary: string // e.g. "Papa fritas · Al punto"
  addedFrom?: 'menu' | 'upsell_sheet' | 'checkout_banner'
}
