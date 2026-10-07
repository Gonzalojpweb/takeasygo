import { connectDB } from '@/lib/mongoose'
import Location from '@/models/Location'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'
import { encrypt } from '@/lib/crypto'
import { normalizeSpacesInput, validateSpacesInput } from '@/lib/space-capacity'

async function resolveTenant(tenantSlug: string) {
  await connectDB()
  return Tenant.findOne({ slug: tenantSlug, isActive: true })
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenant: string; locationId: string }> }
) {
  try {
    const { tenant: tenantSlug, locationId } = await params
    const tenant = await resolveTenant(tenantSlug)
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const location = await Location.findOne({ _id: locationId, tenantId: tenant._id, isActive: true })
      .select('name scheduledOrdersConfig serviceHours timezone deliveryConfig settings.estimatedPickupTime settings.delayAnnouncement')
      .lean() as any
    if (!location) return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })

    const baseTime = location.settings?.estimatedPickupTime ?? 20

    return NextResponse.json({ location, effectiveEstimatedTime: baseTime, tenantName: tenant.name })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; locationId: string }> }
) {
  try {
    const { tenant: tenantSlug, locationId } = await params
    const tenant = await resolveTenant(tenantSlug)
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const body = await request.json()

    // ── Encriptar apiToken de Rapiboy si se está guardando en texto plano ──
    if (body?.rapiboyConfig?.apiToken && !body.rapiboyConfig.apiToken.includes(':')) {
      body.rapiboyConfig.apiToken = encrypt(body.rapiboyConfig.apiToken)
    }
    if (body?.rapiboyConfig?.webhookSecret && !body.rapiboyConfig.webhookSecret.includes(':')) {
      body.rapiboyConfig.webhookSecret = encrypt(body.rapiboyConfig.webhookSecret)
    }

    // ── Validate mpAccountId if provided ─────────────────────────────────────
    if (body?.settings?.mpAccountId) {
      const mpAccountId = body.settings.mpAccountId
      // Reload tenant to get mpAccounts (not in select above)
      const fullTenant = await Tenant.findById(tenant._id).select('mpAccounts').lean() as any
      const validAccount = fullTenant?.mpAccounts?.some(
        (a: any) => a._id?.toString() === mpAccountId
      )
      if (!validAccount) {
        return NextResponse.json(
          { error: 'mpAccountId no pertenece a ninguna cuenta MP de este tenant' },
          { status: 400 }
        )
      }
    }

    // ── Validate reservationConfig.minAdvanceMinutes si viene ──────────────
    if (body?.reservationConfig && 'minAdvanceMinutes' in body.reservationConfig) {
      const v = body.reservationConfig.minAdvanceMinutes
      if (!Number.isInteger(v) || v < 0 || v > 720) {
        return NextResponse.json(
          { error: 'La antelación mínima debe ser un número entero entre 0 y 720 minutos' },
          { status: 400 }
        )
      }
    }

    // ── Validate spaces (espacios/sectores de aforo) si viene ───────────────
    if (body && 'spaces' in body) {
      const spacesError = validateSpacesInput(body.spaces)
      if (spacesError) {
        return NextResponse.json({ error: spacesError }, { status: 400 })
      }
      body.spaces = normalizeSpacesInput(body.spaces as Array<Record<string, unknown>>)
    }

    // Merge profundo: preservar subdocumentos existentes (deliveryConfig, settings, serviceHours)
    // cuando el body solo trae parciales
    const existing = await Location.findOne({ _id: locationId, tenantId: tenant._id }).lean() as Record<string, any> | null
    const merged: Record<string, any> = {}
    const subdocKeys = ['deliveryConfig', 'rapiboyConfig', 'settings', 'serviceHours', 'scheduledOrdersConfig', 'reservationConfig', 'hero', 'gallery']

    for (const [key, value] of Object.entries(body)) {
      if (subdocKeys.includes(key) && typeof value === 'object' && value !== null && !Array.isArray(value) && existing?.[key]) {
        merged[key] = { ...existing[key], ...value }
      } else {
        merged[key] = value
      }
    }

    const location = await Location.findOneAndUpdate(
      { _id: locationId, tenantId: tenant._id },
      { $set: merged },
      { returnDocument: 'after', runValidators: true }
    )

    if (!location) return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })

    logAudit({ tenantId: tenant._id.toString(), action: 'settings.location.updated', entity: 'location', entityId: locationId, details: { fields: Object.keys(body) }, request })
    return NextResponse.json({ location })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; locationId: string }> }
) {
  try {
    const { tenant: tenantSlug, locationId } = await params
    const tenant = await resolveTenant(tenantSlug)
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    // Soft delete
    const location = await Location.findOneAndUpdate(
      { _id: locationId, tenantId: tenant._id },
      { $set: { isActive: false } },
      { new: true }
    )

    if (!location) return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
