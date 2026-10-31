import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantRole, ADMIN_ROLES } from '@/lib/apiAuth'
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

    const authError = await requireTenantRole(request, tenant._id.toString(), ADMIN_ROLES)
    if (authError) return authError

    const { menuDescription, about, social, branding, timezone } = await request.json()

    const update: Record<string, unknown> = {}
    if (menuDescription !== undefined) update['profile.menuDescription'] = menuDescription
    if (about !== undefined) update['profile.about'] = about
    if (social?.instagram !== undefined) update['profile.social.instagram'] = social.instagram
    if (social?.facebook !== undefined) update['profile.social.facebook'] = social.facebook
    if (social?.twitter !== undefined) update['profile.social.twitter'] = social.twitter
    if (branding?.behance !== undefined) update['profile.branding.behance'] = branding.behance
    if (timezone !== undefined) {
      if (typeof timezone !== 'string' || !/^[A-Za-z]+\/[A-Za-z_]+$/.test(timezone)) {
        return NextResponse.json({ error: 'Zona horaria inválida' }, { status: 400 })
      }

      // Análisis de impacto: qué sedes heredan y cuáles cambian
      const oldTz = tenant.timezone || 'America/Argentina/Buenos_Aires'
      const activeLocations = await Location.find({ tenantId: tenant._id, isActive: true })
        .select('name timezone').lean()

      const inheritCurrent = activeLocations.filter((l: any) => !l.timezone || l.timezone === oldTz)
      const inheritNew = activeLocations.filter((l: any) => !l.timezone || l.timezone === timezone)
      const ownTz = activeLocations.filter((l: any) => l.timezone && l.timezone !== oldTz && l.timezone !== timezone)

      update.timezone = timezone

      const updated = await Tenant.findByIdAndUpdate(
        tenant._id,
        { $set: update },
        { new: true }
      )

      logAudit({
        tenantId: tenant._id.toString(),
        action: 'settings.profile.timezone_changed',
        entity: 'tenant',
        details: { from: oldTz, to: timezone },
        request,
      })

      return NextResponse.json({
        profile: updated?.profile,
        timezoneImpact: {
          total: activeLocations.length,
          willInheritNew: inheritNew.length,
          willChangeTime: inheritCurrent.filter((l: any) => !inheritNew.includes(l)).length,
          haveOwnTimezone: ownTz.length,
          inheritNewNames: inheritNew.map((l: any) => l.name),
          changeTimeNames: inheritCurrent
            .filter((l: any) => !inheritNew.includes(l))
            .map((l: any) => l.name),
        },
      })
    }

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
