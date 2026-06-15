import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { fetchDashboardMetrics } from '@/lib/tia/metrics'

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params

  await connectDB()

  const Tenant = (await import('@/models/Tenant')).default
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id plan').lean() as any
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  try {
    const metrics = await fetchDashboardMetrics(tenant._id.toString())
    return NextResponse.json({ ...metrics, plan: tenant.plan })
  } catch (error) {
    console.error('[TIA Metrics]', error)
    return NextResponse.json({ error: 'Error fetching metrics' }, { status: 500 })
  }
}
