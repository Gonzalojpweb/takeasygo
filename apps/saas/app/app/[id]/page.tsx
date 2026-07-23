import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import RestaurantDetail from '@/components/explore/RestaurantDetail'
import type { RestaurantCardData } from '@/types/restaurant-card'
import { connectDB } from '@/lib/mongoose'
import Location from '@/models/Location'
import RestaurantDirectory from '@/models/RestaurantDirectory'
import { checkIsOpenNow } from '@/lib/service-hours'
import mongoose from 'mongoose'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ type?: string }>
}

async function fetchRestaurant(id: string, type: string): Promise<RestaurantCardData | null> {
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
      type: 'network' as const,
      name: loc.tenant?.name ?? loc.name,
      slug: loc.tenant?.slug,
      address: loc.address,
      lat: loc.geo?.coordinates?.[1] ?? null,
      lng: loc.geo?.coordinates?.[0] ?? null,
      distanceM: 0,
      phone: loc.phone ?? '',
      cuisineTypes: loc.cuisineTypes ?? [],
      heroImage: loc.tenant?.branding?.logoUrl ?? '',
      isOpenNow: checkIsOpenNow(loc.serviceHours),
      isOperational: true,
      acceptsOrders: loc.settings?.acceptsOrders ?? true,
      estimatedPickupTime: loc.settings?.estimatedPickupTime ?? 20,
      orderModes: loc.settings?.orderModes ?? ['takeaway'],
      tenantSlug: loc.tenant?.slug,
      logoUrl: loc.tenant?.branding?.logoUrl ?? '',
      primaryColor: loc.tenant?.branding?.primaryColor || '#f74211',
    }
  }

  const entry = await RestaurantDirectory.findOne({
    _id: id,
    status: { $in: ['listed', 'claimed'] },
  }).lean() as any
  if (!entry) return null

  return {
    id: entry._id.toString(),
    type: 'listed' as const,
    name: entry.name,
    address: entry.address,
    lat: entry.geo?.coordinates?.[1] ?? null,
    lng: entry.geo?.coordinates?.[0] ?? null,
    distanceM: 0,
    phone: entry.phone ?? '',
    cuisineTypes: entry.cuisineTypes ?? [],
    heroImage: '',
    isOpenNow: null,
    isOperational: true,
    acceptsOrders: true,
    estimatedPickupTime: 20,
    orderModes: ['takeaway'],
  }
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params
  const { type = 'network' } = await searchParams
  const r = await fetchRestaurant(id, type)
  if (!r) return { title: 'Restaurante · TGO' }

  const image = r.logoUrl || '/tgoicon-512.png'
  return {
    title: `${r.name} · TGO`,
    description: `${r.address} — Pedí takeaway en TGO`,
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
