import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { LOCATION_SLUG_RE, OBJECT_ID_RE } from '@/lib/menu/location-ref'

// ============================================================================
// GET /api/menu-link?t=<comercio>&l=<_id de la sede>&rest=<resto>&<query original>
// ============================================================================
// Compatibilidad de las direcciones viejas del menú (31/10/2026). proxy.ts
// manda acá toda dirección /<comercio>/menu/<_id>…; esto busca el slug de la
// sede y redirige a /<comercio>/menu/<slug><resto>?<query original>.
// Así los QR impresos y los links compartidos siguen funcionando.
// Redirección temporal (307): si un día cambia el slug, el navegador no queda
// con la dirección vieja cacheada.
// ============================================================================

const TENANT_RE = /^[a-z0-9-]{2,50}$/
const REST_RE = /^(\/[A-Za-z0-9_-]+)*\/?$/
const INTERNAL = new Set(['t', 'l', 'rest'])

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const tenantSlug = (sp.get('t') ?? '').toLowerCase()
  const locationId = (sp.get('l') ?? '').toLowerCase()
  const rest = sp.get('rest') ?? ''
  if (!TENANT_RE.test(tenantSlug) || !OBJECT_ID_RE.test(locationId) || !REST_RE.test(rest)) {
    return NextResponse.json({ error: 'Dirección inválida' }, { status: 400 })
  }

  // La query original del cliente (sin los parámetros internos de esta ruta).
  const original = new URLSearchParams()
  for (const [k, v] of sp.entries()) if (!INTERNAL.has(k)) original.append(k, v)
  const qs = original.toString()
  const suffix = qs ? `?${qs}` : ''

  await connectDB()
  const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id').lean<{ _id: import('mongoose').Types.ObjectId }>()
  const location = tenant
    ? await Location.findOne({ _id: locationId, tenantId: tenant._id }).select('slug isActive').lean<{ slug?: string; isActive?: boolean }>()
    : null

  // Sede que ya no existe o sin slug válido: al menú del comercio (que resuelve
  // una sola sede o muestra el selector). Nunca de vuelta al _id (bucle).
  const target =
    location?.isActive && location.slug && LOCATION_SLUG_RE.test(location.slug)
      ? `/${tenantSlug}/menu/${location.slug}${rest}`
      : `/${tenantSlug}/menu`
  return NextResponse.redirect(new URL(`${target}${suffix}`, request.nextUrl.origin), 307)
}
