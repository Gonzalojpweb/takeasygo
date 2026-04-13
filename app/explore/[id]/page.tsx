import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import RestaurantDetail from '@/components/explore/RestaurantDetail'
import type { NearbyRestaurant } from '@/app/api/explore/nearby/route'
import { connectDB } from '@/lib/mongoose'
import Location from '@/models/Location'
import RestaurantDirectory from '@/models/RestaurantDirectory'
import { checkIsOpenNow } from '@/lib/service-hours'
import mongoose from 'mongoose'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ type?: string }>
}

async function fetchRestaurant(id: string, type: string): Promise<NearbyRestaurant | null> {
  if (!mongoose.isValidObjectId(id)) return null

  await connectDB()

  if (type === 'network') {
    const [loc] = await Location.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(id), isActive: true } },
      {
        $lookup: {
          from: 'tenants',
          localField: 'tenantId',
          foreignField: '_id',
          as: 'tenant',
        },
      },
      { $unwind: { path: '$tenant', preserveNullAndEmptyArrays: false } },
      { $match: { 'tenant.status': 'active' } },
      {
        $project: {
          _id: 1, name: 1, address: 1, phone: 1,
          cuisineTypes: 1,
          serviceHours: 1,
          'geo.coordinates': 1,
          'settings.acceptsOrders': 1,
          'settings.estimatedPickupTime': 1,
          'settings.orderModes': 1,
          'tenant._id': 1, 'tenant.name': 1, 'tenant.slug': 1,
          'tenant.branding.logoUrl': 1, 'tenant.branding.primaryColor': 1,
        },
      },
    ])
    if (!loc) return null
    return {
      id: loc._id.toString(),
      type: 'network',
      name: loc.tenant?.name ?? loc.name,
      address: loc.address,
      lat: loc.geo?.coordinates?.[1],
      lng: loc.geo?.coordinates?.[0],
      distanceM: 0,
      phone: loc.phone ?? '',
      cuisineTypes: loc.cuisineTypes ?? [],
      openingHours: '',
      isOpenNow: checkIsOpenNow(loc.serviceHours),
      tenantSlug: loc.tenant?.slug,
      tenantName: loc.tenant?.name,
      logoUrl: loc.tenant?.branding?.logoUrl ?? '',
      primaryColor: loc.tenant?.branding?.primaryColor ?? '#000000',
      acceptsOrders: loc.settings?.acceptsOrders ?? true,
      estimatedPickupTime: loc.settings?.estimatedPickupTime ?? 20,
      orderModes: loc.settings?.orderModes ?? ['takeaway'],
    }
  }

  const entry = await RestaurantDirectory.findOne({
    _id: id,
    status: { $in: ['listed', 'claimed'] },
  }).lean() as any
  if (!entry) return null

  return {
    id: entry._id.toString(),
    type: 'listed',
    name: entry.name,
    address: entry.address,
    lat: entry.geo?.coordinates?.[1],
    lng: entry.geo?.coordinates?.[0],
    distanceM: 0,
    phone: entry.phone ?? '',
    cuisineTypes: entry.cuisineTypes ?? [],
    openingHours: entry.openingHours ?? '',
    isOpenNow: null,
    externalMenuUrl: entry.externalMenuUrl ?? '',
    status: entry.status,
  }
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params
  const { type = 'network' } = await searchParams
  const r = await fetchRestaurant(id, type)
  if (!r) return { title: 'Restaurante · TakeasyGO' }

  const image = r.logoUrl || '/real512.jpg'
  return {
    title: `${r.name} · TakeasyGO`,
    description: `${r.address} — Pedí takeaway en TakeasyGO`,
    openGraph: {
      title: r.name,
      description: `${r.address} — Pedí takeaway sin filas`,
      images: [{ url: image, width: 512, height: 512 }],
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: r.name,
      description: r.address,
      images: [image],
    },
  }
}

export default async function RestaurantPage({ params, searchParams }: Props) {
  const { id } = await params
  const { type = 'network' } = await searchParams
  const restaurant = await fetchRestaurant(id, type)
  if (!restaurant) notFound()

  return (
    <div className="h-screen w-screen overflow-hidden">
      <RestaurantDetail restaurant={restaurant} />
    </div>
  )
}
