import { connectDB } from '@/lib/mongoose'
import Location from '@/models/Location'
import Tenant from '@/models/Tenant'
import RestaurantDirectory from '@/models/RestaurantDirectory'
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { logExploreEvent, generateSessionId } from '@/lib/explore-tracking'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const type = request.nextUrl.searchParams.get('type') ?? 'network'

    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    await connectDB()

    if (type === 'network') {
      // Check if the location's tenant is alwaysVisible
      const locationDoc = await Location.findById(id).select('tenantId').lean()
      const tenantDoc = locationDoc
        ? await Tenant.findById(locationDoc.tenantId).select('alwaysVisible').lean()
        : null
      const isAlwaysVisible = tenantDoc?.alwaysVisible === true

      const [loc] = await Location.aggregate([
        {
          $match: {
            _id: new mongoose.Types.ObjectId(id),
            isActive: true,
            ...(isAlwaysVisible ? {} : { networkVisible: true }),
          },
        },
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
            _id: 1,
            name: 1,
            address: 1,
            phone: 1,
            'geo.coordinates': 1,
            'settings.acceptsOrders': 1,
            'settings.estimatedPickupTime': 1,
            'settings.orderModes': 1,
            'tenant._id': 1,
            'tenant.name': 1,
            'tenant.slug': 1,
            'tenant.branding.logoUrl': 1,
            'tenant.branding.primaryColor': 1,
          },
        },
      ])

      if (!loc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

      logExploreEvent({
        sessionId: request.headers.get('x-session-id') || generateSessionId(),
        eventType: 'restaurant_view',
        view: 'detail',
        restaurantId: loc._id.toString(),
        tenantSlug: loc.tenant?.slug,
        request,
      })

      return NextResponse.json({
        id: loc._id.toString(),
        type: 'network',
        name: loc.tenant?.name ?? loc.name,
        address: loc.address,
        lat: loc.geo?.coordinates?.[1],
        lng: loc.geo?.coordinates?.[0],
        phone: loc.phone ?? '',
        cuisineTypes: [],
        openingHours: '',
        tenantSlug: loc.tenant?.slug,
        tenantName: loc.tenant?.name,
        logoUrl: loc.tenant?.branding?.logoUrl ?? '',
        primaryColor: loc.tenant?.branding?.primaryColor || '#f74211',
        acceptsOrders: loc.settings?.acceptsOrders ?? true,
        estimatedPickupTime: loc.settings?.estimatedPickupTime ?? 20,
        orderModes: loc.settings?.orderModes ?? ['takeaway'],
      }, {
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
      })
    }

    // listed
    const entry = await RestaurantDirectory.findOne({
      _id: id,
      status: { $in: ['listed', 'claimed'] },
    }).lean()

    if (!entry) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    const e = entry as any

    logExploreEvent({
      sessionId: request.headers.get('x-session-id') || generateSessionId(),
      eventType: 'restaurant_view',
      view: 'detail',
      restaurantId: e._id.toString(),
      tenantSlug: e.name,
      request,
      metadata: { sourceType: 'directory' },
    })

    return NextResponse.json({
      id: e._id.toString(),
      type: 'listed',
      name: e.name,
      address: e.address,
      lat: e.geo?.coordinates?.[1],
      lng: e.geo?.coordinates?.[0],
      phone: e.phone ?? '',
      cuisineTypes: e.cuisineTypes ?? [],
      openingHours: e.openingHours ?? '',
      serviceHours: e.serviceHours?.length > 0 ? { takeaway: e.serviceHours } : undefined,
      externalMenuUrl: e.externalMenuUrl ?? '',
      logoUrl: e.logoUrl ?? '',
      heroImage: e.heroImageUrl ?? e.logoUrl ?? '',
      heroImageUrl: e.heroImageUrl ?? '',
      description: e.description ?? '',
      website: e.website ?? '',
      instagram: e.instagram ?? '',
      facebook: e.facebook ?? '',
      status: e.status,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    })
  } catch (error) {
    console.error('[explore/restaurant]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
