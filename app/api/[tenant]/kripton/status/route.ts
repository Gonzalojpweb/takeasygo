import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import PlatformConfig from '@/models/PlatformConfig'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const [tenant, platformConfig] = await Promise.all([
      Tenant.findOne({ slug: tenantSlug }).select('kripton').lean() as any,
      PlatformConfig.findById('platform').select('kripton').lean() as any,
    ])

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const platformEnabled = platformConfig?.kripton?.enabled ?? false

    return NextResponse.json({
      enabled: platformEnabled && !!tenant.kripton?.isConfigured,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
