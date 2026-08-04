import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import Consumer from '@/models/Consumer'
import CustomerProfile from '@/models/CustomerProfile'
import { safeDecrypt } from '@/lib/crypto'
import { canAccess } from '@/lib/plans'
import { escapeRegex } from '@takeasygo/business'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/[tenant]/crm/customers — Lista enriquecida con filtros CIS
// ─────────────────────────────────────────────────────────────────────────────
// Devuelve consumers con segment + healthScore del CustomerProfile.
// Soporta filtros: segment, healthScoreMin/Max, ltvMin/Max, lastOrderFrom/To.
// CIS data es null si el customer no fue procesado por el cron todavía.

const PAGE_SIZE = 50

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, status: { $in: ['active', 'paused'] } })
    if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (!canAccess(tenant.plan, 'crm')) {
      return NextResponse.json({ error: 'CRM no disponible en tu plan actual.' }, { status: 403 })
    }

    const url = new URL(request.url)
    const search = url.searchParams.get('search') || ''
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || `${PAGE_SIZE}`)))
    const sortBy = url.searchParams.get('sortBy') || 'lastOrderAt'
    const sortOrder = url.searchParams.get('order') === 'asc' ? 1 : -1

    // Filtros CIS
    const segmentFilter = url.searchParams.get('segment') || ''
    const healthScoreMin = url.searchParams.get('healthScoreMin')
    const healthScoreMax = url.searchParams.get('healthScoreMax')
    const ltvMin = url.searchParams.get('ltvMin')
    const ltvMax = url.searchParams.get('ltvMax')
    const lastOrderFrom = url.searchParams.get('lastOrderFrom')
    const lastOrderTo = url.searchParams.get('lastOrderTo')

    const hasCisFilters = segmentFilter || healthScoreMin || healthScoreMax || ltvMin || ltvMax || lastOrderFrom || lastOrderTo

    // Si hay filtros CIS, primero buscar los phoneHashes que cumplen
    let cisPhoneHashes: string[] | null = null
    if (hasCisFilters) {
      const cisFilter: Record<string, any> = { tenantId: tenant._id }

      if (segmentFilter) {
        const segments = segmentFilter.split(',').map(s => s.trim()).filter(Boolean)
        cisFilter.segment = segments.length === 1 ? segments[0] : { $in: segments }
      }

      if (healthScoreMin || healthScoreMax) {
        cisFilter['healthScore.total'] = {}
        if (healthScoreMin) cisFilter['healthScore.total'].$gte = parseInt(healthScoreMin)
        if (healthScoreMax) cisFilter['healthScore.total'].$lte = parseInt(healthScoreMax)
      }

      if (ltvMin || ltvMax) {
        cisFilter.totalSpent = {}
        if (ltvMin) cisFilter.totalSpent.$gte = parseInt(ltvMin)
        if (ltvMax) cisFilter.totalSpent.$lte = parseInt(ltvMax)
      }

      if (lastOrderFrom || lastOrderTo) {
        cisFilter.lastOrderAt = {}
        if (lastOrderFrom) cisFilter.lastOrderAt.$gte = new Date(lastOrderFrom)
        if (lastOrderTo) cisFilter.lastOrderAt.$lte = new Date(lastOrderTo)
      }

      const matchingProfiles = await CustomerProfile.find(cisFilter)
        .select({ phoneHash: 1 })
        .lean()

      cisPhoneHashes = matchingProfiles.map((p: any) => p.phoneHash)

      // Si no hay profiles que matcheen, devolver vacío
      if (cisPhoneHashes.length === 0) {
        return NextResponse.json({ consumers: [], total: 0, page: 1, pages: 0 })
      }
    }

    // Construir filtro de Consumer
    const consumerFilter: Record<string, any> = { tenantIds: tenant._id }

    if (cisPhoneHashes) {
      consumerFilter.phoneHash = { $in: cisPhoneHashes }
    }

    if (search) {
      consumerFilter.$or = [
        { name: { $regex: escapeRegex(search), $options: 'i' } },
        { phone: { $regex: escapeRegex(search), $options: 'i' } },
        { email: { $regex: escapeRegex(search), $options: 'i' } },
        { phoneHash: { $regex: escapeRegex(search), $options: 'i' } },
      ]
    }

    const sort: Record<string, 1 | -1> = {}
    const allowedSortFields = ['lastOrderAt', 'totalOrders', 'totalSpent', 'firstOrderAt', 'name']
    if (allowedSortFields.includes(sortBy)) {
      sort[sortBy] = sortOrder
    } else {
      sort.lastOrderAt = -1
    }

    const [rawConsumers, total] = await Promise.all([
      Consumer.find(consumerFilter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Consumer.countDocuments(consumerFilter),
    ])

    // Obtener datos CIS (segment + healthScore) para el batch de consumers
    const phoneHashes = rawConsumers
      .map((c: any) => c.phoneHash)
      .filter(Boolean)

    const profiles = await CustomerProfile.find({
      phoneHash: { $in: phoneHashes },
      tenantId: tenant._id,
    })
      .select({ phoneHash: 1, segment: 1, 'healthScore.total': 1, totalSpent: 1, avgTicket: 1, visitFrequency: 1, daysSinceLastOrder: 1 })
      .lean()

    // Indexar profiles por phoneHash para lookup O(1)
    const profileByPhoneHash = new Map<string, any>(
      profiles.map((p: any) => [p.phoneHash, p])
    )

    const consumers = rawConsumers.map((c: any) => {
      const profile = profileByPhoneHash.get(c.phoneHash)
      return {
        _id: c._id,
        name: c.name ? safeDecrypt(c.name) : '',
        phone: c.phone ? safeDecrypt(c.phone) : '',
        email: c.email ? safeDecrypt(c.email) : '',
        totalOrders: c.totalOrders ?? 0,
        totalSpent: c.totalSpent ?? 0,
        firstOrderAt: c.firstOrderAt ?? null,
        lastOrderAt: c.lastOrderAt ?? null,
        isLoyaltyMember: c.isLoyaltyMember ?? false,
        isCorporate: c.isCorporate ?? false,
        // Datos CIS (null si no fue procesado)
        segment: profile?.segment ?? null,
        healthScore: profile?.healthScore?.total ?? null,
        avgTicket: profile?.avgTicket ?? null,
        visitFrequency: profile?.visitFrequency ?? null,
        daysSinceLastOrder: profile?.daysSinceLastOrder ?? null,
      }
    })

    return NextResponse.json({
      consumers,
      total,
      page,
      pages: Math.ceil(total / limit),
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
