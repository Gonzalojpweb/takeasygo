import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const { menuDescription, about, social } = await request.json()

    const update: Record<string, unknown> = {}
    if (menuDescription !== undefined) update['profile.menuDescription'] = menuDescription
    if (about !== undefined) update['profile.about'] = about
    if (social?.instagram !== undefined) update['profile.social.instagram'] = social.instagram
    if (social?.facebook !== undefined) update['profile.social.facebook'] = social.facebook
    if (social?.twitter !== undefined) update['profile.social.twitter'] = social.twitter

    const updated = await Tenant.findByIdAndUpdate(
      tenant._id,
      { $set: update },
      { new: true }
    )

    logAudit({ tenantId: tenant._id.toString(), action: 'settings.profile.updated', entity: 'tenant', details: { fields: Object.keys(update) }, request })
    return NextResponse.json({ profile: updated?.profile })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
