import { connectDB } from '@/lib/mongoose'
import RestaurantDirectory from '@/models/RestaurantDirectory'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'

export async function GET(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    await connectDB()

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const q = searchParams.get('q')

    const filter: Record<string, any> = {}
    if (status && ['listed', 'claimed', 'converted'].includes(status)) {
      filter.status = status
    }
    if (q && q.trim()) {
      filter.$text = { $search: q.trim() }
    }

    const entries = await RestaurantDirectory.find(filter).sort({ createdAt: -1 }).lean()

    // Totales para stats
    const [totalListed, totalClaimed, totalConverted] = await Promise.all([
      RestaurantDirectory.countDocuments({ status: 'listed' }),
      RestaurantDirectory.countDocuments({ status: 'claimed' }),
      RestaurantDirectory.countDocuments({ status: 'converted' }),
    ])

    return NextResponse.json({
      entries,
      stats: { listed: totalListed, claimed: totalClaimed, converted: totalConverted },
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    await connectDB()

    const body = await request.json()

    // Validación mínima
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    }
    if (!body.address?.trim()) {
      return NextResponse.json({ error: 'La dirección es obligatoria' }, { status: 400 })
    }

    // Validar coordenadas si vienen
    if (body.geo?.coordinates) {
      const [lng, lat] = body.geo.coordinates
      if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        return NextResponse.json({ error: 'Coordenadas fuera de rango' }, { status: 400 })
      }
    }

    const entry = await RestaurantDirectory.create({
      ...body,
      addedBy: 'superadmin',
    })

    return NextResponse.json({ entry }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
