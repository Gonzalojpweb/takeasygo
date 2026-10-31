import { connectDB } from '@/lib/mongoose'
import Tenant, { type ITenant } from '@/models/Tenant'
import Location from '@/models/Location'
import { isTenantPubliclyOperational } from '@/lib/tenant-gates'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import LocationPicker from '@/components/menu/LocationPicker'

export default async function TenantPage() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug })
    .lean<ITenant & { _id: import('mongoose').Types.ObjectId; name?: string }>()
  if (!tenant || !isTenantPubliclyOperational(tenant)) notFound()

  const locations = await Location.find({ tenantId: tenant._id, isActive: true })
    .sort({ createdAt: 1 })
    .select('name address settings.orderModes slug')
    .lean<{ _id: import('mongoose').Types.ObjectId; name: string; address?: string; settings?: { orderModes?: string[] }; slug?: string }[]>()

  // Una sola sede: al link corto del menú (31/10: ya no al _id de la sede).
  if (locations.length === 1) {
    redirect(`/${tenantSlug}/menu`)
  }

  return (
    <LocationPicker
      tenantSlug={tenantSlug!}
      tenantName={tenant.name || tenantSlug!}
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
