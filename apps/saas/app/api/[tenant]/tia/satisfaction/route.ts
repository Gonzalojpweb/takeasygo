import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Feedback from '@/models/Feedback'
import Tenant from '@/models/Tenant'

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id').lean() as any
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  const result = await Feedback.aggregate([
    { $match: { tenantId: tenant._id, satisfaction: { $exists: true, $ne: null } } },
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
