import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { notFound } from 'next/navigation'
import { isTenantPubliclyOperational } from '@/lib/tenant-gates'
import { locationPathSegment } from '@/lib/menu/location-ref'
import LocationPicker from '@/components/menu/LocationPicker'
import LocationMenuPage from './[locationId]/page'

// ============================================================================
// /<comercio>/menu — el link general del comercio (31/10/2026)
// ============================================================================
//   · Una sola sede: muestra su menú directo, en esta misma dirección corta
//     (antes redirigía a /<comercio>/menu/<_id>).
//   · Varias sedes: selector «Elegí la sede» (antes mandaba a la primera, y un
//     QR de una sede podía abrir el menú de otra). Conserva la query del link.
// ============================================================================

export default async function MenuIndexPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { tenant: tenantSlug } = await params
  const rawParams = await searchParams
  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean<{ _id: import('mongoose').Types.ObjectId; name?: string }>()
  if (!tenant || !isTenantPubliclyOperational(tenant as never)) notFound()

  const locations = await Location.find({ tenantId: tenant._id, isActive: true })
    .sort({ createdAt: 1 })
    .select('_id slug name address settings.orderModes')
    .lean<{ _id: unknown; slug?: string; name: string; address?: string; settings?: { orderModes?: string[] } }[]>()
  if (locations.length === 0) notFound()

  if (locations.length === 1) {
    return LocationMenuPage({ params: Promise.resolve({ tenant: tenantSlug, locationId: locationPathSegment(locations[0]) }) })
  }

  const qs = new URLSearchParams()
  for (const [key, val] of Object.entries(rawParams)) {
    if (typeof val === 'string' && val) qs.set(key, val)
  }
  return (
    <LocationPicker
      tenantSlug={tenantSlug}
      tenantName={tenant.name || tenantSlug}
      query={qs.toString()}
      locations={locations.map((l) => ({
        _id: String(l._id),
        slug: l.slug,
        name: l.name,
        address: l.address,
        orderModes: l.settings?.orderModes,
      }))}
    />
  )
}
