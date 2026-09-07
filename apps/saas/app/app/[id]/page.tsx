import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import RestaurantDetail from '@/components/explore/RestaurantDetail'
import type { RestaurantCardData } from '@/types/restaurant-card'
import { connectDB } from '@/lib/mongoose'
import Location from '@/models/Location'
import RestaurantDirectory from '@/models/RestaurantDirectory'
import Rating from '@/models/Rating'
import { checkIsOpenNow } from '@/lib/service-hours'
import mongoose from 'mongoose'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ type?: string }>
}

async function fetchRestaurant(id: string, type: string) {
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
          gallery: 1,
          'geo.coordinates': 1,
          'settings.acceptsOrders': 1,
          'settings.estimatedPickupTime': 1,
          'settings.orderModes': 1,
          'tenant._id': 1, 'tenant.name': 1, 'tenant.slug': 1,
          'tenant.branding.logoUrl': 1, 'tenant.branding.primaryColor': 1,
          'tenant.cachedScores.icoScore': 1,
        },
      },
    ])
    if (!loc) return null

    const restaurant: RestaurantCardData = {
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
      serviceHours: loc.serviceHours,
      gallery: (loc.gallery || []).filter(Boolean).slice(0, 8),
    }

    // Fetch ICO score
    const icoScore = loc.tenant?.cachedScores?.icoScore ?? null

    // Fetch reviews (top 3, most recent with 4-5 stars)
    const reviews = await Rating.find({
      tenantId: loc.tenant?._id,
      locationId: loc._id,
      stars: { $gte: 4 },
    })
      .sort({ createdAt: -1 })
      .limit(3)
      .select('stars comment createdAt')
      .lean()

    // Fetch rating summary
    const ratingAgg = await Rating.aggregate([
      { $match: { tenantId: loc.tenant?._id, locationId: loc._id } },
      { $group: { _id: null, avg: { $avg: '$stars' }, count: { $sum: 1 } } },
    ])
    if (ratingAgg.length > 0) {
      restaurant.averageRating = Math.round(ratingAgg[0].avg * 10) / 10
      restaurant.ratingCount = ratingAgg[0].count
    }

    return { restaurant, icoScore, reviews }
  }

  const entry = await RestaurantDirectory.findOne({
    _id: id,
    status: { $in: ['listed', 'claimed'] },
  }).lean() as any
  if (!entry) return null

  const restaurant: RestaurantCardData = {
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

  return { restaurant, icoScore: null, reviews: [] }
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params
  const { type = 'network' } = await searchParams
  const result = await fetchRestaurant(id, type)
  if (!result) return { title: 'Restaurante · TGO' }

  const { restaurant: r } = result
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
  const result = await fetchRestaurant(id, type)
  if (!result) notFound()

  const { restaurant, icoScore, reviews } = result

  // Derive ICO ring from score
  let icoRing: 'none' | 'thin' | 'marked' | 'gold' = 'none'
  if (icoScore != null) {
    if (icoScore >= 90) icoRing = 'gold'
    else if (icoScore >= 70) icoRing = 'marked'
    else if (icoScore >= 50) icoRing = 'thin'
  }
  const hasCrown = icoScore != null && icoScore >= 85

  return (
    <div className="h-screen w-screen overflow-hidden">
      <RestaurantDetail
        restaurant={restaurant}
        reviews={reviews as any}
        icoScore={icoScore}
        icoRing={icoRing}
        hasCrown={hasCrown}
        gallery={restaurant.gallery as string[]}
      />
    </div>
  )
}
