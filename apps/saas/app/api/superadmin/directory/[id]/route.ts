import { connectDB } from '@/lib/mongoose'
import { checkGeoBody } from '@/lib/geo/validate-point'
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

    // Validar coordenadas si vienen (rango y latitud ≠ longitud)
    const geoCheck = checkGeoBody(body.geo)
    if (!geoCheck.ok) {
      return NextResponse.json({ error: geoCheck.error }, { status: 400 })
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
