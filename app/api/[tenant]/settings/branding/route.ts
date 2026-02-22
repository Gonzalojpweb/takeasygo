import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const body = await request.json()
    const { branding } = body

    if (!branding || typeof branding !== 'object') {
      return NextResponse.json({ error: 'Branding inválido' }, { status: 400 })
    }

    // Only allow updating known branding fields
    const allowed = ['primaryColor', 'secondaryColor', 'backgroundColor', 'textColor', 'logoUrl', 'fontFamily', 'borderRadius', 'menuLayout', 'darkMode']
    const update: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in branding) {
        update[`branding.${key}`] = branding[key]
      }
    }

    const updated = await Tenant.findByIdAndUpdate(
      tenant._id,
      { $set: update },
      { new: true }
    )

    return NextResponse.json({ branding: updated?.branding })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
