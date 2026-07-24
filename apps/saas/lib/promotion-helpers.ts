/**
 * Shared helpers for promotions — NO mongoose imports (safe for client components)
 */

export type SlotCustomizationMode = 'none' | 'variant' | 'full'

/**
 * Resuelve el modo de personalización efectivo para un slot.
 * Jerarquía: slot.customizationMode > slot.allowCustomization > promo.allowCustomization > default 'full'
 */
export function resolveSlotCustomizationMode(
  slot: { customizationMode?: SlotCustomizationMode; allowCustomization?: boolean | null },
  promoAllowCustomization?: boolean
): SlotCustomizationMode {
  if (slot.customizationMode) return slot.customizationMode
  if (slot.allowCustomization === true) return 'full'
  if (slot.allowCustomization === false) return 'none'
  if (promoAllowCustomization === false) return 'none'
  return 'full'
}
