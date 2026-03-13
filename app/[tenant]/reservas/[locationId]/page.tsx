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

  return (
    <ReservaForm
      tenant={JSON.parse(JSON.stringify(tenant))}
      location={JSON.parse(JSON.stringify(location))}
    />
  )
}
