import { connectDB } from '@/lib/mongoose'
import Location from '@/models/Location'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
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

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const body = await request.json()

    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    }

    let geoWarning: string | null = null

    if (request.headers.get('x-onboarding') === '1') {
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

    let location
    if (request.headers.get('x-onboarding') === '1') {
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
      location = await Location.create({ ...body, tenantId: tenant._id })
    }

    logAudit({ tenantId: tenant._id.toString(), action: 'settings.location.created', entity: 'location', entityId: location._id.toString(), details: { name: body.name }, request })
    return NextResponse.json({ location, geoWarning }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
