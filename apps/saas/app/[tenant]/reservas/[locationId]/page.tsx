import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { notFound } from 'next/navigation'
import ReservaForm from '@/components/menu/ReservaForm'

interface Props {
  params: Promise<{ tenant: string; locationId: string }>
}

export default async function ReservaPage({ params }: Props) {
  const { tenant: tenantSlug, locationId } = await params
  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
  if (!tenant) notFound()
  if (!tenant.features?.reservations) notFound()

  const location = await Location.findOne({ _id: locationId, tenantId: tenant._id, isActive: true }).lean() as any
  if (!location) notFound()
  if (location.reservationConfig?.enabled === false) notFound()

  // 14/11/2026 (seguridad): esta página es PÚBLICA. Antes mandaba al navegador
  // el comercio y la sede enteros (integraciones, agente de impresión, cuentas
  // de pago…). Solo viaja lo que el formulario usa; espacios, solo los que
  // aceptan reservas.
  const publicTenant = { _id: String(tenant._id), name: tenant.name, slug: tenant.slug, branding: tenant.branding ?? {} }
  const publicLocation = {
    _id: String(location._id),
    name: location.name,
    phone: location.phone ?? '',
    timezone: location.timezone ?? null,
    reservationConfig: location.reservationConfig ?? {},
    spaces: ((location.spaces ?? []) as Array<{ _id: unknown; name: string; capacity: number; enabled?: boolean; reservable?: boolean; blockedDates?: string[]; order?: number }>)
      .filter((s) => s.reservable !== false)
      .map((s) => ({ _id: String(s._id), name: s.name, capacity: s.capacity, enabled: s.enabled !== false, blockedDates: s.blockedDates ?? [], order: s.order ?? 0 })),
  }

  return (
    <ReservaForm
      tenant={JSON.parse(JSON.stringify(publicTenant))}
      location={JSON.parse(JSON.stringify(publicLocation))}
    />
  )
}
