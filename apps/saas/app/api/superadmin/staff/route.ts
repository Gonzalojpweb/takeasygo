import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import Tenant from '@/models/Tenant'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { escapeRegex } from '@takeasygo/business'

const INTERNAL_ROLES = ['superadmin', 'admin', 'manager', 'staff', 'cashier', 'seller']

export async function GET(req: Request) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    await connectDB()

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search') || ''
    const role = searchParams.get('role') || ''
    const tenantId = searchParams.get('tenantId') || ''

    const filter: any = { role: { $in: INTERNAL_ROLES } }

    if (role) {
      if (!INTERNAL_ROLES.includes(role)) {
        return NextResponse.json({ users: [], total: 0, stats: {} })
      }
      filter.role = role
    }

    if (tenantId) {
      filter.tenantId = tenantId
    }

    if (search) {
      const re = new RegExp(escapeRegex(search.trim()), 'i')
      filter.$or = [
        { name: re },
        { email: re },
      ]
    }

    const users = await User.find(filter)
      .select('name email image role tenantId assignedTenants isActive lastLoginAt createdAt')
      .sort({ role: 1, name: 1 })
      .lean()

    // Enrich with tenant names
    const tenantIds = [...new Set(users.map((u: any) => u.tenantId?.toString()).filter(Boolean))]
    const tenants = await Tenant.find({ _id: { $in: tenantIds } }).select('name slug').lean()
    const tenantMap = Object.fromEntries(tenants.map((t: any) => [t._id.toString(), t]))

    // Stats by role
    const stats: Record<string, number> = {}
    for (const r of INTERNAL_ROLES) {
      stats[r] = users.filter((u: any) => u.role === r).length
    }

    const enriched = users.map((u: any) => ({
      _id: u._id.toString(),
      name: u.name,
      email: u.email,
      image: u.image,
      role: u.role,
      tenantId: u.tenantId?.toString() ?? null,
      tenantName: u.tenantId ? (tenantMap[u.tenantId.toString()]?.name ?? null) : null,
      assignedTenants: u.assignedTenants?.map((id: any) => id.toString()) ?? [],
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
    }))

    return NextResponse.json({
      users: enriched,
      total: enriched.length,
      stats,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener staff' }, { status: 500 })
  }
}
