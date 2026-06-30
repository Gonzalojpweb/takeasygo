import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { generateReservationSlots } from '@/lib/reservation-slots'
import { NextRequest, NextResponse } from 'next/server'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; locationId: string }> }
) {
  try {
    const { tenant: tenantSlug, locationId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const location = await Location.findOne({ _id: locationId, tenantId: tenant._id, isActive: true })
    if (!location) return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })

    const searchParams = request.nextUrl.searchParams
    const dateStr = searchParams.get('date')

    if (!dateStr || !DATE_REGEX.test(dateStr)) {
      return NextResponse.json({ error: 'Fecha inválida. Usar formato YYYY-MM-DD' }, { status: 400 })
    }

    const result = await generateReservationSlots(locationId, dateStr, location.reservationConfig || {})

    return NextResponse.json(result)
  } catch (error) {
    console.error('[reservation-slots] Error:', error)
    return NextResponse.json({ error: 'Error al obtener franjas horarias' }, { status: 500 })
  }
}
