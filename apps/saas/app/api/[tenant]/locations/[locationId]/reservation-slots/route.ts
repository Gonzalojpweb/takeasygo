import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { generateReservationSlots } from '@/lib/reservation-slots'
import {
  DEFAULT_MIN_ADVANCE_MINUTES,
  DEFAULT_TIMEZONE,
  isValidCalendarDate,
} from '@/lib/restaurant-time'
import { NextRequest, NextResponse } from 'next/server'

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

    if (!isValidCalendarDate(dateStr)) {
      return NextResponse.json({ error: 'Fecha inválida. Usar formato YYYY-MM-DD' }, { status: 400 })
    }

    const partySizeParam = searchParams.get('partySize')
    let partySize = 1
    if (partySizeParam !== null) {
      partySize = Number(partySizeParam)
      if (!Number.isInteger(partySize) || partySize < 1 || partySize > 1000) {
        return NextResponse.json({ error: 'Cantidad de personas inválida' }, { status: 400 })
      }
    }

    // Espacio elegido por el cliente: tiene que existir en la sede.
    const spaceIdParam = searchParams.get('spaceId')
    let spaceId: string | null = null
    if (spaceIdParam) {
      const spacesList = (location.spaces ?? []) as Array<{ _id?: unknown }>
      const exists = spacesList.some(s => s._id != null && String(s._id) === spaceIdParam)
      if (!exists) {
        return NextResponse.json({ error: 'Espacio no válido para esta sede' }, { status: 400 })
      }
      spaceId = spaceIdParam
    }

    const reservationConfig = location.reservationConfig || {}
    const result = await generateReservationSlots(locationId, dateStr, reservationConfig, {
      timezone: location.timezone || DEFAULT_TIMEZONE,
      minAdvanceMinutes: reservationConfig.minAdvanceMinutes ?? DEFAULT_MIN_ADVANCE_MINUTES,
      spaces: location.spaces,
      partySize,
      spaceId,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('[reservation-slots] Error:', error)
    return NextResponse.json({ error: 'Error al obtener franjas horarias' }, { status: 500 })
  }
}
