import { connectDB } from '@/lib/mongoose'
import Location from '@/models/Location'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRole } from '@/lib/apiAuth'
import { guardSharedOrLocation } from '@/lib/location-scope'
import { loadClonableConfig, cloneMenu } from '@/lib/location-clone'
import { logAudit } from '@/lib/audit'
import { slugifyOrFallback } from '@/lib/slugify'

export async function GET(
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

    const locations = await Location.find({ tenantId: tenant._id, isActive: true })
    return NextResponse.json({ locations })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(
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

    // Alta de sede: admin de nivel tenant (un admin con sedes asignadas no
    // crea sedes nuevas).
    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError
    const scopeError = await guardSharedOrLocation(request, null, 'Acceso denegado')
    if (scopeError) return scopeError

    const rawBody = await request.json()
    // Pertenencia y credenciales del agente no se asignan desde el body.
    const {
      _id: _ignoredId, tenantId: _ignoredTenant, printerAgent: _ignoredAgent,
      cloneFromLocationId, cloneMenu: shouldCloneMenu,
      ...body
    } = rawBody ?? {}

    // Alta copiando la configuracion operativa de otra sede del tenant.
    let clonedConfig: Record<string, unknown> | null = null
    if (cloneFromLocationId) {
      clonedConfig = await loadClonableConfig(tenant._id, String(cloneFromLocationId))
      if (!clonedConfig) {
        return NextResponse.json({ error: 'Sede de origen no encontrada' }, { status: 404 })
      }
    }

    // El modo onboarding (upsert por slug) solo vale mientras el negocio está
    // en el alta: con el negocio aprobado sobrescribiría una sede existente.
    const onboardingStatus = (tenant as { onboarding?: { status?: string } }).onboarding?.status
    const isOnboarding = request.headers.get('x-onboarding') === '1'
      && !!onboardingStatus && !['none', 'approved'].includes(onboardingStatus)

    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    }

    // ── Validar prefix (si se provee) ──────────────────────────────────
    if (body.prefix !== undefined && body.prefix !== null && body.prefix !== '') {
      const prefix = String(body.prefix).toUpperCase().trim()
      if (!/^[A-Z0-9]{2,4}$/.test(prefix)) {
        return NextResponse.json({ error: 'El prefijo debe tener 2-4 caracteres alfanuméricos mayúsculas' }, { status: 400 })
      }
      const existing = await Location.findOne({ tenantId: tenant._id, prefix, _id: { $ne: body._id } }).select('_id').lean()
      if (existing) {
        return NextResponse.json({ error: `El prefijo "${prefix}" ya está en uso en otra sede` }, { status: 409 })
      }
      body.prefix = prefix
    }

    let geoWarning: string | null = null

    if (isOnboarding) {
      delete body.geo
      if (body.address) {
        const { geocodeText } = await import('@/lib/geocode')
        try {
          const result = await geocodeText(body.address)
          if (result) {
            body.geo = { type: 'Point', coordinates: [result.lng, result.lat] }
          } else {
            // No frenamos el alta: la sede queda sin coordenadas y se corrige después.
            geoWarning = 'No pudimos ubicar la dirección en el mapa. Se guardó igual.'
          }
        } catch {
          geoWarning = 'No pudimos ubicar la dirección en el mapa. Se guardó igual.'
        }
      }

      // Texto libre → slug válido (el nombre puede traer tildes, mayúsculas, símbolos).
      body.slug = slugifyOrFallback(body.name, body.slug)
    }

    // ── Timezone: sede nueva hereda del tenant si no se provee ──────────
    // (si se clona, la de la sede origen tiene prioridad sobre la del tenant)
    if (!body.timezone) {
      body.timezone = (clonedConfig?.timezone as string | undefined)
        || (tenant as any).timezone || 'America/Argentina/Buenos_Aires'
    }

    let location
    if (isOnboarding) {
      // Reenvío idempotente: un prospecto rechazado que vuelve a editar recae en
      // este mismo paso y { tenantId, slug } es único → create rompería con 500
      // y lo dejaría trabado sin poder reenviar la solicitud.
      const toWrite: Record<string, unknown> = { ...body }
      delete toWrite.tenantId
      location = await Location.findOneAndUpdate(
        { tenantId: tenant._id, slug: body.slug },
        { $set: toWrite },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      )
    } else {
      const clonedSettings = (clonedConfig?.settings ?? {}) as Record<string, unknown>
      location = await Location.create({
        ...(clonedConfig ?? {}),
        ...body,
        settings: { ...clonedSettings, ...(body.settings ?? {}) },
        tenantId: tenant._id,
      })
    }

    logAudit({ tenantId: tenant._id.toString(), action: 'settings.location.created', entity: 'location', entityId: location._id.toString(), details: { name: body.name }, request })
    // Menu copiado de la sede origen (ids nuevos, likes en cero).
    const menuCloned = clonedConfig && shouldCloneMenu
      ? await cloneMenu(tenant._id, String(cloneFromLocationId), location._id)
      : false

    return NextResponse.json({ location, geoWarning, menuCloned }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
