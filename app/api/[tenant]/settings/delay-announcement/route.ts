import { connectDB } from '@/lib/mongoose'
import Location from '@/models/Location'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRole } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

const VALID_MODES = ['takeaway', 'delivery', 'dine-in', 'business'] as const

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const roleError = await requireAdminRole(request, tenant._id.toString())
    if (roleError) return roleError

    const body = await request.json()
    const { locationId } = body

    if (!locationId) {
      return NextResponse.json({ error: 'locationId es obligatorio' }, { status: 400 })
    }

    const location = await Location.findOne({ _id: locationId, tenantId: tenant._id }).lean<{
      settings?: { orderModes?: string[]; delayAnnouncement?: any }
      deliveryConfig?: { enabled?: boolean }
    }>()
    if (!location) {
      return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })
    }

    let orderModes = location.settings?.orderModes ?? ['takeaway']
    if (location.deliveryConfig?.enabled && !orderModes.includes('delivery')) {
      orderModes = [...orderModes, 'delivery']
    }
    const supportedModes = new Set(orderModes)

    // Construir payload per-mode solo con los modos enviados y válidos
    const delayPayload: Record<string, any> = {}
    for (const mode of VALID_MODES) {
      const modeData = body[mode]
      if (modeData === undefined) continue

      if (!supportedModes.has(mode)) {
        return NextResponse.json(
          { error: `Modo "${mode}" no está habilitado para esta sede` },
          { status: 400 }
        )
      }

      delayPayload[mode] = {
        enabled: !!modeData.enabled,
        extraMinutes: typeof modeData.extraMinutes === 'number' && modeData.extraMinutes >= 0 ? modeData.extraMinutes : 0,
        message: typeof modeData.message === 'string' ? modeData.message : '',
        updatedAt: new Date(),
      }
    }

    if (Object.keys(delayPayload).length === 0) {
      return NextResponse.json({ error: 'No se enviaron modos para actualizar' }, { status: 400 })
    }

    // Merge con delayAnnouncement existente (desde POJO con lean): solo pisar los modos enviados
    const existing = location.settings?.delayAnnouncement ?? {}
    const merged = { ...existing, ...delayPayload }

    await Location.updateOne(
      { _id: locationId },
      { $set: { 'settings.delayAnnouncement': merged } }
    )

    const updated = await Location.findById(locationId)
      .select('settings.delayAnnouncement')
      .lean<{ settings?: { delayAnnouncement?: any } }>()

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'settings.delay_announcement.updated',
      entity: 'location',
      entityId: locationId,
      details: { modes: Object.keys(delayPayload) },
      request,
    }).catch(() => {})

    return NextResponse.json({
      delayAnnouncement: updated?.settings?.delayAnnouncement ?? null,
    })
  } catch (error) {
    console.error('[DelayAnnouncement API] PATCH error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
