import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { fetchDashboardMetrics } from '@/lib/tia/metrics'

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params

  await connectDB()

  const Tenant = (await import('@/models/Tenant')).default
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id plan').lean() as any
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404, headers: { 'Cache-Control': 'no-cache' } })
  }

  try {
    const metrics = await fetchDashboardMetrics(tenant._id.toString())
    return NextResponse.json({ ...metrics, plan: tenant.plan }, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' },
    })
  } catch (error) {
    console.error('[TIA Metrics]', error)
    return NextResponse.json({ error: 'Error fetching metrics' }, { status: 500, headers: { 'Cache-Control': 'no-cache' } })
  }
}
