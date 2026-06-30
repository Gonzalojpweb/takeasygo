import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import CustomerProfile from '@/models/CustomerProfile'
import Consumer from '@/models/Consumer'
import { safeDecrypt } from '@/lib/crypto'
import { canAccess } from '@/lib/plans'
import { requireAuth } from '@/lib/apiAuth'
import { getHealthScoreTrend, getTrendSummary } from '@/lib/cis/history'
import { getActionForSegment } from '@/lib/cis/actions'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/[tenant]/crm/[id]/profile — Customer Profile V2 completo
// ─────────────────────────────────────────────────────────────────────────────
// Combina datos de Consumer + CustomerProfile + métricas + inteligencia
// en un solo response para el frontend.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; id: string }> }
) {
  try {
    const { tenant: tenantSlug, id } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, status: { $in: ['active', 'paused'] } })
    if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (!canAccess(tenant.plan, 'crm')) {
      return NextResponse.json({ error: 'CRM no disponible en tu plan actual.' }, { status: 403 })
    }

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    // Buscar el consumer base
    const consumer = await Consumer.findOne({ _id: id, tenantIds: tenant._id }).lean()
    if (!consumer) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

    // Buscar el profile enriquecido
    const profile = await CustomerProfile.findOne({
      phoneHash: consumer.phoneHash,
      tenantId: tenant._id,
    }).lean()

    // Obtener tendencia de Health Score (P4)
    const trend = profile ? await getHealthScoreTrend(consumer.phoneHash, tenant._id) : null
    const trendSummary = profile ? await getTrendSummary(consumer.phoneHash, tenant._id) : null

    // Obtener acción recomendada (P9)
    const action = profile ? getActionForSegment(profile.segment) : null

    // Construir respuesta unificada
    const response = {
      // Datos base del Consumer
      _id: consumer._id,
      name: consumer.name ? safeDecrypt(consumer.name) : '',
      phone: consumer.phone ? safeDecrypt(consumer.phone) : '',
      email: consumer.email ? safeDecrypt(consumer.email) : '',
      isLoyaltyMember: consumer.isLoyaltyMember ?? false,
      isCorporate: consumer.isCorporate ?? false,

      // Métricas CML (del profile o defaults)
      metrics: profile ? {
        orderCount: profile.orderCount,
        totalSpent: profile.totalSpent,
        avgTicket: profile.avgTicket,
        lifetimeValue: profile.lifetimeValue,
        firstOrderAt: profile.firstOrderAt,
        lastOrderAt: profile.lastOrderAt,
        daysSinceLastOrder: profile.daysSinceLastOrder,
        daysSinceFirstOrder: profile.daysSinceFirstOrder,
        visitFrequency: profile.visitFrequency,
        avgOrderInterval: profile.avgOrderInterval,
        favoriteCategories: profile.favoriteCategories,
        favoriteProducts: profile.favoriteProducts,
        favoriteDays: profile.favoriteDays,
        favoriteHours: profile.favoriteHours,
        uniqueProducts: profile.uniqueProducts,
        menuViews: profile.menuViews,
        productViews: profile.productViews,
        cartAdds: profile.cartAdds,
        checkoutStarts: profile.checkoutStarts,
        completedOrders: profile.completedOrders,
        conversionRate: profile.conversionRate,
        rewardUsageCount: profile.rewardUsageCount,
        rewardUsageRate: profile.rewardUsageRate,
        clubJoinDate: profile.clubJoinDate,
        clubStatus: profile.clubStatus,
        clubPoints: profile.clubPoints,
      } : null,

      // Inteligencia (CIL + CSL)
      segment: profile?.segment ?? 'NEW',
      signals: profile?.signals ?? [],
      healthScore: profile?.healthScore ?? { total: 0, components: {}, calculatedAt: null },
      healthScoreHistory: profile?.healthScoreHistory ?? [],

      // Tendencia (P4)
      healthScoreTrend: trend?.trend ?? 'insufficient_data',
      healthScoreTrendSummary: trendSummary,

      // Acción recomendada (P9)
      recommendedAction: action,

      // Metadatos
      metricsCalculatedAt: profile?.metricsCalculatedAt ?? null,
      lastSegmentAt: profile?.lastSegmentAt ?? null,
      lastSignalsAt: profile?.lastSignalsAt ?? null,
      lastHealthScoreAt: profile?.lastHealthScoreAt ?? null,
    }

    return NextResponse.json(response)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
