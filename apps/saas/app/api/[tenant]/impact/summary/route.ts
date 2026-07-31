import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import mongoose from 'mongoose'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import { hashPhone } from '@/lib/crypto'
import { getImpactSummary } from '@/lib/impact'

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params

  const phone = req.nextUrl.searchParams.get('phone')
  const userId = req.nextUrl.searchParams.get('userId')

  if (!phone && !userId) {
    return NextResponse.json({ error: 'phone or userId requerido' }, { status: 400 })
  }

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id').lean() as any
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  let phoneHash: string

  if (phone) {
    phoneHash = hashPhone(phone)
  } else {
    const user = await User.findById(userId).select('phone').lean() as any
    if (!user?.phone) {
      return NextResponse.json({ error: 'Usuario sin teléfono vinculado' }, { status: 404 })
    }
    phoneHash = hashPhone(user.phone)
  }

  const summary = await getImpactSummary({
    tenantId: tenant._id,
    phoneHash,
  })

  if (!summary) {
    return NextResponse.json({
      commercesSupported: 0,
      nearbyPurchases: 0,
      discoveredBusinesses: 0,
      discoveredNeighborhoods: [],
      badges: [],
      totalOrders: 0,
    })
  }

  return NextResponse.json(summary, {
    headers: { 'Cache-Control': 'private, max-age=30' },
  })
}
