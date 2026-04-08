import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'
import { requireAuth } from '@/lib/apiAuth'
import { canAccess } from '@/lib/plans'
import type { Plan } from '@/lib/plans'
import mongoose from 'mongoose'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    const { searchParams } = request.nextUrl
    const format = searchParams.get('format') ?? 'csv'

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .select('_id plan loyalty')
      .lean<{ _id: mongoose.Types.ObjectId; plan: Plan; loyalty: any }>()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    if (!canAccess(tenant.plan, 'loyaltyExport')) {
      return NextResponse.json(
        { error: 'La exportación requiere plan Crecimiento o superior' },
        { status: 403 }
      )
    }

    const members = await LoyaltyMember.find({ tenantId: tenant._id })
      .sort({ joinedAt: -1 })
      .lean<any[]>()

    const clubName = tenant.loyalty?.clubName || `Club ${tenantSlug}`
    const filename = `${clubName.replace(/\s+/g, '_')}_members_${new Date().toISOString().split('T')[0]}`

    if (format === 'json') {
      const clean = members.map(m => ({
        name:        m.name,
        phone:       m.phone ? `****${m.phone.slice(-4)}` : '',
        email:       m.email,
        status:      m.status,
        joinedAt:    m.joinedAt,
        source:      m.source,
        totalOrders: m.cache?.totalOrders ?? 0,
        totalSpent:  m.cache?.totalSpent  ?? 0,
        lastOrderAt: m.cache?.lastOrderAt ?? null,
        notes:       m.notes ?? '',
      }))

      return NextResponse.json(
        { members: clean, exportedAt: new Date().toISOString() },
        {
          headers: {
            'Content-Disposition': `attachment; filename="${filename}.json"`,
            'Content-Type': 'application/json',
          },
        }
      )
    }

    const headers = ['Nombre', 'Teléfono', 'Email', 'Estado', 'Fecha de ingreso', 'Fuente', 'Pedidos', 'Total gastado', 'Último pedido', 'Notas']
    const rows = members.map(m => [
      escapeCsv(m.name),
      escapeCsv(m.phone ? `****${m.phone.slice(-4)}` : ''),
      escapeCsv(m.email),
      escapeCsv(m.status),
      escapeCsv(new Date(m.joinedAt).toLocaleDateString('es-AR')),
      escapeCsv(m.source),
      String(m.cache?.totalOrders ?? 0),
      String(m.cache?.totalSpent  ?? 0),
      m.cache?.lastOrderAt ? escapeCsv(new Date(m.cache.lastOrderAt).toLocaleDateString('es-AR')) : '',
      escapeCsv((m.notes ?? '').replace(/"/g, "'")),
    ])

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')

    return new NextResponse(csv, {
      headers: {
        'Content-Disposition': `attachment; filename="${filename}.csv"`,
        'Content-Type': 'text/csv; charset=utf-8',
      },
    })
  } catch (error) {
    console.error('[loyalty/export GET]', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

function escapeCsv(value: string): string {
  if (/[",;\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
