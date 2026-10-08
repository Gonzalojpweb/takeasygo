import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import CustomerEvent from '@/models/CustomerEvent'
import { requireAuth } from '@/lib/apiAuth'
import { NextRequest, NextResponse } from 'next/server'
import { canAccess } from '@/lib/plans'
import type { Plan } from '@/lib/plans'
import { buildPeriodLabel } from '@/lib/report-range'
import { navigationCache } from '@/lib/analytics/navigation-cache'

/**
 * GET /api/[tenant]/analytics/navigation
 *
 * Métricas de navegación del menú público / dine-in / business sobre
 * `customerevents` (los eventos instrumentados en Fase 0+1).
 *
 * - Ventana: `?days=N` (default 30, máx 90).
 * - Auth: requireAuth + plan con acceso a `reports` (mismo gating que
 *   /analytics/upsell).
 * - Cache: en memoria por tenant+days con TTL 60s + headers
 *   `Cache-Control: private, max-age=60`.
 * - Índice usado: {tenantId, type, createdAt}.
 */

const DEFAULT_WINDOW_DAYS = 30
const MAX_WINDOW_DAYS = 90
const CACHE_TTL_MS = 60_000

const NAV_TYPES = [
  'menu_opened',
  'product_view',
  'cart_add',
  'cart_remove',
  'checkout_started',
  'checkout_submitted',
  'checkout_completed',
  'reward_viewed',
  'reward_interaction',
] as const

type NavType = (typeof NAV_TYPES)[number]

function resolveDays(searchParams: URLSearchParams): number {
  const raw = Number(searchParams.get('days'))
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_WINDOW_DAYS
  return Math.min(Math.trunc(raw), MAX_WINDOW_DAYS)
}

function pct(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> },
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .select('_id plan')
      .lean<{ _id: import('mongoose').Types.ObjectId; plan: Plan }>()
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    if (!canAccess(tenant.plan ?? 'try', 'reports')) {
      return NextResponse.json({ error: 'Plan insuficiente' }, { status: 403 })
    }

    const days = resolveDays(request.nextUrl.searchParams)
    const cacheKey = `${tenant._id.toString()}|${days}`
    const cached = navigationCache.get(cacheKey)
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return NextResponse.json(cached.body, {
        headers: {
          'Cache-Control': 'private, max-age=60, stale-while-revalidate=30',
          'X-Cache': 'HIT',
        },
      })
    }

    const now = new Date()
    const since = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)),
    )

    // Cuenta solo sesiones reales (sin null ni string vacío que emiten
    // eventos server-side sin sesión).
    const uniqueSessionsExpr = (field: string) => ({
      $size: {
        $filter: {
          input: `$${field}`,
          cond: { $and: [{ $ne: ['$$this', null] }, { $ne: ['$$this', ''] }] },
        },
      },
    })

    const [facet] = await CustomerEvent.aggregate<{
      totals: { _id: NavType; count: number; uniqueSessions: number }[]
      daily: { _id: { type: NavType; day: string }; count: number }[]
      sessions: { n: number }[]
      items: { _id: { type: string; id: string; name: string }; count: number }[]
    }>([
      {
        $match: {
          tenantId: tenant._id,
          createdAt: { $gte: since },
          type: { $in: [...NAV_TYPES] },
        },
      },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: '$type',
                count: { $sum: 1 },
                sessions: { $addToSet: '$metadata.sessionId' },
              },
            },
            { $project: { count: 1, uniqueSessions: uniqueSessionsExpr('sessions') } },
          ],
          daily: [
            {
              $group: {
                _id: {
                  type: '$type',
                  day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                },
                count: { $sum: 1 },
              },
            },
          ],
          sessions: [
            { $group: { _id: null, sessions: { $addToSet: '$metadata.sessionId' } } },
            { $project: { _id: 0, n: uniqueSessionsExpr('sessions') } },
          ],
          items: [
            {
              $match: {
                type: { $in: ['product_view', 'cart_add'] },
                'data.menuItemId': { $exists: true },
              },
            },
            {
              $group: {
                _id: { type: '$type', id: '$data.menuItemId', name: '$data.itemName' },
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 20 },
          ],
        },
      },
    ])

    const totals: Record<NavType, { count: number; uniqueSessions: number }> = {} as never
    for (const type of NAV_TYPES) {
      // eslint-disable-next-line security/detect-object-injection
      totals[type] = { count: 0, uniqueSessions: 0 }
    }
    for (const row of facet?.totals ?? []) {
      if (row && row._id in totals) {
        totals[row._id] = { count: row.count, uniqueSessions: row.uniqueSessions }
      }
    }

    const dailyCounts = new Map<string, Partial<Record<NavType, number>>>()
    for (const row of facet?.daily ?? []) {
      const { day, type } = row._id
      const bucket = dailyCounts.get(day) ?? {}
      // eslint-disable-next-line security/detect-object-injection
      bucket[type] = row.count
      dailyCounts.set(day, bucket)
    }

    const daily: { date: string; counts: Partial<Record<NavType, number>>; total: number }[] = []
    for (let i = 0; i < days; i++) {
      const date = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10)
      const counts = dailyCounts.get(date) ?? {}
      const total = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0)
      daily.push({ date, counts, total })
    }

    const toItemRows = (type: string) =>
      (facet?.items ?? [])
        .filter((row) => row._id.type === type)
        .slice(0, 10)
        .map((row) => ({ menuItemId: row._id.id, name: row._id.name, count: row.count }))

    // Claves en UTC: la serie diaria se agrupa con $dateToString (UTC).
    const fromKey = since.toISOString().slice(0, 10)
    const toKey = now.toISOString().slice(0, 10)

    const body = {
      period: {
        days,
        from: fromKey,
        to: toKey,
        label: buildPeriodLabel(fromKey, toKey),
      },
      totals: NAV_TYPES.map((type) => ({
        type,
        // eslint-disable-next-line security/detect-object-injection
        ...totals[type],
      })),
      uniqueSessions: facet?.sessions?.[0]?.n ?? 0,
      daily,
      topItems: {
        views: toItemRows('product_view'),
        adds: toItemRows('cart_add'),
      },
      conversion: {
        menuToView: pct(totals.product_view.count, totals.menu_opened.count),
        viewToAdd: pct(totals.cart_add.count, totals.product_view.count),
        addToCheckout: pct(totals.checkout_started.count, totals.cart_add.count),
        checkoutToSubmitted: pct(
          totals.checkout_submitted.count,
          totals.checkout_started.count,
        ),
        submittedToCompleted: pct(
          totals.checkout_completed.count,
          totals.checkout_submitted.count,
        ),
      },
    }

    navigationCache.set(cacheKey, { at: Date.now(), body })

    return NextResponse.json(body, {
      headers: {
        'Cache-Control': 'private, max-age=60, stale-while-revalidate=30',
        'X-Cache': 'MISS',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Error al obtener analytics de navegación' }, { status: 500 })
  }
}
