import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import LocationManager from '@/components/superadmin/LocationManager'
import { Types } from 'mongoose'

interface Props {
  params: Promise<{ tenantId: string }>
}

export default async function TenantLocationsPage({ params }: Props) {
  const { tenantId } = await params
  await connectDB()

  const tenant = await Tenant.findById(tenantId).lean<{
    _id: Types.ObjectId
    name: string
    slug: string
  }>()
  if (!tenant) notFound()

  const locations = await Location.find({ tenantId, isActive: true }).lean<
    Array<{
      _id: Types.ObjectId
      name: string
      slug: string
      address: string
      phone: string
      isActive: boolean
      geo?: { type: string; coordinates: [number, number] }
      networkVisible: boolean
      cuisineTypes: string[]
      settings: { orderModes: ('takeaway' | 'dine-in')[] }
    }>
  >()

  const menus = await Menu.find({ tenantId }).lean<Array<{ locationId: Types.ObjectId }>>()
  const menuLocationIds = new Set(menus.map(m => m.locationId.toString()))

  const locationsWithMenuInfo = locations.map(loc => ({
    _id: loc._id.toString(),
    name: loc.name,
    slug: loc.slug,
    address: loc.address,
    phone: loc.phone ?? '',
    isActive: loc.isActive,
    hasMenu: menuLocationIds.has(loc._id.toString()),
    orderModes: loc.settings?.orderModes ?? (['takeaway'] as ('takeaway' | 'dine-in')[]),
    lat: loc.geo?.coordinates ? loc.geo.coordinates[1] : null,
    lng: loc.geo?.coordinates ? loc.geo.coordinates[0] : null,
    networkVisible: loc.networkVisible ?? false,
    cuisineTypes: loc.cuisineTypes ?? [],
  }))

  return (
    <div className="max-w-lg">
      <Link
        href="/superadmin/tenants"
        className="flex items-center gap-2 text-zinc-500 hover:text-white text-sm mb-4 transition-colors">
        <ChevronLeft size={14} /> Volver a tenants
      </Link>

      <div className="mb-6">
        <h1 className="text-white text-2xl font-bold">Sedes</h1>
        <p className="text-zinc-500 text-sm mt-1">
          {tenant.name} —{' '}
          <span className="font-mono text-zinc-400">{tenant.slug}</span>
        </p>
      </div>

      <LocationManager
        tenantSlug={tenant.slug}
        initialLocations={locationsWithMenuInfo}
      />
    </div>
  )
}
