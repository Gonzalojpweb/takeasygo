/**
 * Sources that count as "upsell" for analytics.
 * This is the single source of truth — both reports and analytics import from here.
 *
 * Definition (strict): only sources where the system actively pushed the product.
 *   - upsell_sheet: modal de upsell
 *   - checkout_banner: banner en checkout
 *
 * NOT included: best_sellers (discovery), promotion (discount), group (group order)
 */
export const UPSELL_SOURCES = ['upsell_sheet', 'checkout_banner'] as const
export type UpsellSource = (typeof UPSELL_SOURCES)[number]
