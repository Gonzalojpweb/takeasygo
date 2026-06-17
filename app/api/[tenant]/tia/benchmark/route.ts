import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { computeBenchmarks } from '@/lib/tia/benchmark'

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params

  await connectDB()

  const Tenant = (await import('@/models/Tenant')).default
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id plan').lean() as any
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  if (!['buy', 'full'].includes(tenant.plan)) {
    return NextResponse.json({ error: 'TIA not available for this plan' }, { status: 403 })
  }

  try {
    const data = await computeBenchmarks(tenant._id.toString())
    return NextResponse.json(data)
  } catch (error) {
    console.error('[TIA Benchmark]', error)
    return NextResponse.json({ error: 'Error computing benchmarks' }, { status: 500 })
  }
}
