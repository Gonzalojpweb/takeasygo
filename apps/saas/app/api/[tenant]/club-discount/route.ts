import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import ClubDiscount from '@/models/ClubDiscount'
import Tenant from '@/models/Tenant'
import mongoose from 'mongoose'
import Location from '@/models/Location'
import { isClubDiscountEnabledForLocation, type LocationCommercialSettings } from '@/lib/location-resolvers'

/**
 * GET /api/{tenant}/club-discount
 * Endpoint público: retorna el ClubDiscount activo del tenant.
 * No incluye datos sensibles (maxRedemptions, usedCount, createdBy).
 * El consumer usa esto para saber qué items tienen descuento visible.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id')
    if (!tenant) {
      return NextResponse.json({ discount: null })
    }

    // Override por sede: si la sede desactivó el descuento del club, la carta
    // de esa sede no lo muestra.
    const locationId = request.nextUrl.searchParams.get('locationId')
    if (locationId && mongoose.Types.ObjectId.isValid(locationId)) {
      const location = await Location.findOne({ _id: locationId, tenantId: tenant._id })
        .select('settings.clubDiscountEnabled')
        .lean<{ settings?: LocationCommercialSettings }>()
      if (location && !isClubDiscountEnabledForLocation(location.settings)) {
        return NextResponse.json({ discount: null })
      }
    }

    const discount = await ClubDiscount.findOne({
      tenantId: tenant._id,
      active: true,
    })
      .select('scope categoryIds subcategoryIds itemIds discountPercent cooldownHours maxUsesPerConsumer')
      .lean()

    if (!discount) {
      return NextResponse.json({ discount: null })
    }

    return NextResponse.json({
      discount: {
        scope: discount.scope,
        categoryIds: discount.categoryIds,
        subcategoryIds: discount.subcategoryIds,
        itemIds: discount.itemIds,
        discountPercent: discount.discountPercent,
        cooldownHours: discount.cooldownHours,
        maxUsesPerConsumer: discount.maxUsesPerConsumer ?? 0,
      },
    })
  } catch (error) {
    console.error('GET public club-discount error:', error)
    return NextResponse.json({ discount: null })
  }
}
