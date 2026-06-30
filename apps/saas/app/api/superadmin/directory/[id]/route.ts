import { connectDB } from '@/lib/mongoose'
import RestaurantDirectory from '@/models/RestaurantDirectory'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { id } = await params
    await connectDB()

    const body = await request.json()

    // Validar coords si vienen
    if (body.geo?.coordinates) {
      const [lng, lat] = body.geo.coordinates
      if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        return NextResponse.json({ error: 'Coordenadas fuera de rango' }, { status: 400 })
      }
    }

    const entry = await RestaurantDirectory.findByIdAndUpdate(
      id,
      { $set: body },
      { new: true, runValidators: true }
    )

    if (!entry) return NextResponse.json({ error: 'Entrada no encontrada' }, { status: 404 })

    return NextResponse.json({ entry })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { id } = await params
    await connectDB()

    const entry = await RestaurantDirectory.findByIdAndDelete(id)
    if (!entry) return NextResponse.json({ error: 'Entrada no encontrada' }, { status: 404 })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
