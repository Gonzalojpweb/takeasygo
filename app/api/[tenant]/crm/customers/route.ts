import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import Consumer from '@/models/Consumer'
import CustomerProfile from '@/models/CustomerProfile'
import { safeDecrypt } from '@/lib/crypto'
import { canAccess } from '@/lib/plans'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/[tenant]/crm/customers — Lista enriquecida con datos CIS (P1-P3)
// ─────────────────────────────────────────────────────────────────────────────
// Devuelve consumers con segment + healthScore del CustomerProfile.
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

    const filter: Record<string, any> = { tenantIds: tenant._id }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phoneHash: { $regex: search, $options: 'i' } },
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
      Consumer.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Consumer.countDocuments(filter),
    ])

    // Obtener datos CIS (segment + healthScore) para el batch de consumers
    const phoneHashes = rawConsumers
      .map((c: any) => c.phoneHash)
      .filter(Boolean)

    const profiles = await CustomerProfile.find({
      phoneHash: { $in: phoneHashes },
      tenantId: tenant._id,
    })
      .select({ phoneHash: 1, segment: 1, 'healthScore.total': 1 })
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
