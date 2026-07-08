import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import DeliveryPerson from '@/models/DeliveryPerson'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import DeliveryTripHistory from '@/components/admin/DeliveryTripHistory'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ tenant: string; id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant: tenantSlug, id } = await params
  await connectDB()
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
  if (!tenant) return {}
  const person = await DeliveryPerson.findOne({ _id: id, tenantId: tenant._id }).select('name').lean() as any
  return {
    title: person ? `Historial de ${person.name}` : 'Historial de viajes',
  }
}

export default async function DeliveryPersonTripsPage({ params }: Props) {
  const { tenant: tenantSlug, id } = await params
  const headersList = await headers()
  const tenantSlugFromHeader = headersList.get('x-tenant-slug') || tenantSlug

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlugFromHeader, isActive: true }).lean() as any
  if (!tenant) notFound()

  const person = await DeliveryPerson.findOne({
    _id: id,
    tenantId: tenant._id,
  }).select('-tokenHash').lean()

  if (!person) notFound()

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <DeliveryTripHistory
        tenantSlug={tenantSlugFromHeader}
        personId={id}
      />
    </div>
  )
}
