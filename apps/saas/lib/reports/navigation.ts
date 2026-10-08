import mongoose from 'mongoose'
import CustomerEvent from '@/models/CustomerEvent'

/**
 * lib/reports/navigation.ts — Embudo de navegación para /admin/reports.
 *
 * Lee `customerevents` (dual-write instrumentado en Fase 0+1) para el rango
 * activo del filtro de fechas. Mismos tipos que GET /analytics/navigation y
 * lib/tia/metrics (fetchNavigationFunnel).
 */

const NAV_TYPES = [
  'menu_opened',
  'product_view',
  'cart_add',
  'checkout_started',
  'checkout_submitted',
  'checkout_completed',
] as const

export interface NavigationStats {
  menuOpened: number
  productView: number
  cartAdd: number
  checkoutStarted: number
  checkoutSubmitted: number
  checkoutCompleted: number
  uniqueSessions: number
  conversion: {
    menuToView: number | null
    viewToAdd: number | null
    addToCheckout: number | null
    checkoutToSubmitted: number | null
    submittedToCompleted: number | null
  }
  mostViewed: { name: string; count: number }[]
}

function pct(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null
}

export async function buildNavigationStats(
  tenantId: mongoose.Types.ObjectId,
  start: Date,
  end: Date,
): Promise<NavigationStats> {
  const uniqueSessionsExpr = (field: string) => ({
    $size: {
      $filter: {
        input: `$${field}`,
        cond: { $and: [{ $ne: ['$$this', null] }, { $ne: ['$$this', ''] }] },
      },
    },
  })

  const [facet] = await CustomerEvent.aggregate<{
    counts: { _id: string; count: number }[]
    sessions: { n: number }[]
    mostViewed: { name: string; count: number }[]
  }>([
    {
      $match: {
        tenantId,
        createdAt: { $gte: start, $lte: end },
        type: { $in: [...NAV_TYPES] },
      },
    },
    {
      $facet: {
        counts: [{ $group: { _id: '$type', count: { $sum: 1 } } }],
        sessions: [
          { $group: { _id: null, sessions: { $addToSet: '$metadata.sessionId' } } },
          { $project: { _id: 0, n: uniqueSessionsExpr('sessions') } },
        ],
        mostViewed: [
          {
            $match: {
              type: 'product_view',
              'data.itemName': { $exists: true },
            },
          },
          { $group: { _id: '$data.itemName', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 },
          { $project: { name: '$_id', count: 1, _id: 0 } },
        ],
      },
    },
  ])

  const byType = new Map((facet?.counts ?? []).map((row) => [row._id, row.count]))
  const menuOpened = byType.get('menu_opened') ?? 0
  const productView = byType.get('product_view') ?? 0
  const cartAdd = byType.get('cart_add') ?? 0
  const checkoutStarted = byType.get('checkout_started') ?? 0
  const checkoutSubmitted = byType.get('checkout_submitted') ?? 0
  const checkoutCompleted = byType.get('checkout_completed') ?? 0

  return {
    menuOpened,
    productView,
    cartAdd,
    checkoutStarted,
    checkoutSubmitted,
    checkoutCompleted,
    uniqueSessions: facet?.sessions?.[0]?.n ?? 0,
    conversion: {
      menuToView: pct(productView, menuOpened),
      viewToAdd: pct(cartAdd, productView),
      addToCheckout: pct(checkoutStarted, cartAdd),
      checkoutToSubmitted: pct(checkoutSubmitted, checkoutStarted),
      submittedToCompleted: pct(checkoutCompleted, checkoutSubmitted),
    },
    mostViewed: facet?.mostViewed ?? [],
  }
}
