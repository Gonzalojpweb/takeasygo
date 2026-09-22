/**
 * Sources that count as "upsell" for analytics.
 * This is the single source of truth — both reports and analytics import from here.
 *
 * Semantics (to be decided by product):
 *   Strict:  ['upsell_sheet', 'checkout_banner']
 *   Wide:    ['upsell_sheet', 'checkout_banner', 'best_sellers']
 *   Complete: all non-menu sources
 *
 * Current value matches reports/page.tsx convention.
 * When semantics are decided, change ONCE here.
 */
export const UPSELL_SOURCES = ['upsell_sheet', 'checkout_banner', 'best_sellers'] as const
export type UpsellSource = (typeof UPSELL_SOURCES)[number]
