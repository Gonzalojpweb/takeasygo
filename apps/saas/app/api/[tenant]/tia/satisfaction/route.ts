import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Feedback from '@/models/Feedback'
import Tenant from '@/models/Tenant'
import { requireAuth } from '@/lib/apiAuth'
import { scopeLocationFilter } from '@/lib/location-scope'

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id').lean() as any
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  // Cerrado (hardening): ruta STAFF que estaba sin sesión.
  const authError = await requireAuth(request, String(tenant._id))
  if (authError) return authError

  // Alcance de sede: ?locationId= (selector) validado, o las sedes del
  // usuario; un usuario de tenant ve el consolidado.
  const sedeScope = await scopeLocationFilter(request, request.nextUrl.searchParams.get('locationId'))
  if ('error' in sedeScope) return sedeScope.error
  const sedeFilter = sedeScope.filter

  const result = await Feedback.aggregate([
    { $match: { tenantId: tenant._id, ...sedeFilter, satisfaction: { $exists: true, $ne: null } } },
    { $group: { _id: '$satisfaction', count: { $sum: 1 } } },
  ])

  const counts = { excelente: 0, buena: 0, mejorable: 0 }
  let total = 0

  for (const row of result) {
    if (row._id in counts) {
      counts[row._id as keyof typeof counts] = row.count
      total += row.count
    }
  }

  return NextResponse.json({ ...counts, total }, {
    headers: { 'Cache-Control': 's-maxage=120, stale-while-revalidate=60' },
  })
}
