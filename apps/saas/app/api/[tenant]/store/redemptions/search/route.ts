/**
 * API Endpoint: Search Store Redemption by Code (Admin/Staff)
 * 
 * GET /api/{tenant}/store/redemptions/search?code=TGO-XXXX-XXXX
 */

import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import StoreRedemption from '@/models/StoreRedemption'
import Tenant from '@/models/Tenant'
import { requireAuth } from '@/lib/apiAuth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // Requiere autenticación de staff/admin
    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const locationId = searchParams.get('locationId')

    if (!code) {
      return NextResponse.json({ error: 'Se requiere el código' }, { status: 400 })
    }

    const query: any = {
      tenantId: tenant._id,
      redemptionCode: code.toUpperCase().trim(),
    }
    if (locationId) query.locationId = locationId

    const redemption = await StoreRedemption.findOne(query)
    .populate('memberId', 'name email loyalty')
    .populate('storeItemId', 'name imageUrl pointsCost cashValue')
    .lean()

    if (!redemption) {
      return NextResponse.json({ error: 'Canje no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ redemption })

  } catch (error) {
    console.error('[Store Redemption Search GET] Error:', error)
    return NextResponse.json({ error: 'Error al buscar el canje' }, { status: 500 })
  }
}
