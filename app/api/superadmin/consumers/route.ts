import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Consumer from '@/models/Consumer'
import { safeDecrypt } from '@/lib/crypto'
import { requireSuperAdmin } from '@/lib/apiAuth'

export async function GET(request: NextRequest) {
  const authError = await requireSuperAdmin()
  if (authError) return authError

  try {
    await connectDB()

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.trim()
    const tenantId = searchParams.get('tenantId')?.trim()
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))
    const sortBy = searchParams.get('sortBy') || 'lastOrderAt'
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 1 : -1

    const filter: Record<string, any> = {}
    if (tenantId) {
      filter.tenantIds = tenantId
    }

    let sortField = 'lastOrderAt'
    if (['totalOrders', 'totalSpent', 'lastOrderAt', 'firstOrderAt'].includes(sortBy)) {
      sortField = sortBy
    }

    const [consumers, total] = await Promise.all([
      Consumer.find(filter)
        .sort({ [sortField]: sortOrder })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Consumer.countDocuments(filter),
    ])

    let decrypted = consumers.map((c) => ({
      _id: c._id,
      name: c.name ? safeDecrypt(c.name) : '',
      email: c.email ? safeDecrypt(c.email) : '',
      phone: c.phone ? safeDecrypt(c.phone) : '',
      phoneHash: c.phoneHash,
      tenantIds: c.tenantIds,
      totalOrders: c.totalOrders,
      totalSpent: c.totalSpent,
      firstOrderAt: c.firstOrderAt,
      lastOrderAt: c.lastOrderAt,
      isLoyaltyMember: c.isLoyaltyMember,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }))

    // Client-side search on decrypted data
    if (search) {
      const q = search.toLowerCase()
      decrypted = decrypted.filter(
        (c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
      )
    }

    return NextResponse.json({
      consumers: decrypted,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
