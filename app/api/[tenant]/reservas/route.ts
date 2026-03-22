import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Reservation from '@/models/Reservation'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { canAccess } from '@/lib/plans'
import { encrypt, safeDecrypt } from '@/lib/crypto'

function decryptReservation(r: any) {
  return {
    ...r,
    name:  safeDecrypt(r.name),
    phone: safeDecrypt(r.phone),
  }
}

async function resolveTenant(tenantSlug: string) {
  await connectDB()
  return Tenant.findOne({ slug: tenantSlug, isActive: true })
}

// GET /api/[tenant]/reservas?date=2024-03-15&locationId=xxx
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    const tenant = await resolveTenant(tenantSlug)
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const locationId = searchParams.get('locationId')

    const filter: any = { tenantId: tenant._id }
    if (date) filter.date = date
    if (locationId) filter.locationId = locationId

    const reservations = (await Reservation.find(filter).sort({ date: 1, time: 1 }).lean()).map(decryptReservation)
    return NextResponse.json({ reservations })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// POST /api/[tenant]/reservas — público, crea una reserva (pending_payment)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    const tenant = await resolveTenant(tenantSlug)
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    // Plan + feature gate
    if (!canAccess(tenant.plan, 'reservations')) {
      return NextResponse.json({ error: 'Feature no disponible en este plan' }, { status: 403 })
    }
    if (!tenant.features?.reservations) {
      return NextResponse.json({ error: 'Reservaciones no habilitadas' }, { status: 403 })
    }

    const body = await request.json()
    const { locationId, date, time, partySize, name, phone, notes } = body

    if (!locationId || !date || !time || !partySize || !name || !phone) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
    }

    const location = await Location.findOne({ _id: locationId, tenantId: tenant._id, isActive: true })
    if (!location) return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })

    if (!location.reservationConfig?.enabled) {
      return NextResponse.json({ error: 'Reservaciones no habilitadas para esta sede' }, { status: 400 })
    }

    // Generate reservation number
    const count = await Reservation.countDocuments({ tenantId: tenant._id })
    const reservationNumber = `R${String(count + 1).padStart(4, '0')}`

    const reservation = await Reservation.create({
      tenantId: tenant._id,
      locationId,
      reservationNumber,
      date,
      time,
      partySize,
      name:  encrypt(name.trim()),
      phone: encrypt(phone.trim()),
      notes: notes?.trim() || '',
      status: 'pending_payment',
      payment: {
        amount: location.reservationConfig.minPayment,
        status: 'pending',
        mercadopagoId: null,
        preferenceId: null,
      },
    })

    return NextResponse.json({ reservation }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
