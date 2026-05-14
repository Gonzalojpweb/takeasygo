import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Reservation from '@/models/Reservation'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { rateLimit } from '@/lib/rateLimit'
import { safeDecrypt } from '@/lib/crypto'
import { sendReservationConfirmation, sendReservationCancellation } from '@/lib/reservationNotifications'

function decryptReservation(r: any) {
  return { ...r, name: safeDecrypt(r.name), phone: safeDecrypt(r.phone) }
}

async function resolveTenant(tenantSlug: string) {
  await connectDB()
  return Tenant.findOne({ slug: tenantSlug, isActive: true })
}

// GET /api/[tenant]/reservas/[reservaId] — público con rate limiting
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; reservaId: string }> }
) {
  try {
    const { tenant: tenantSlug, reservaId } = await params

    const { success } = await rateLimit(`get-reserva:${reservaId}`, 10, 60_000)
    if (!success) {
      return NextResponse.json({ error: 'Demasiadas solicitudes. Esperá un minuto.' }, { status: 429 })
    }

    const tenant = await resolveTenant(tenantSlug)
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const reservation = await Reservation.findOne({ _id: reservaId, tenantId: tenant._id }).lean()
    if (!reservation) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 })

    return NextResponse.json({ reservation: decryptReservation(reservation) })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// PUT /api/[tenant]/reservas/[reservaId] — admin updates status
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; reservaId: string }> }
) {
  try {
    const { tenant: tenantSlug, reservaId } = await params
    const tenant = await resolveTenant(tenantSlug)
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const body = await request.json()
    const { status } = body

    const allowed = ['confirmed', 'cancelled', 'seated', 'no_show']
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
    }

    const prev = await Reservation.findOne({ _id: reservaId, tenantId: tenant._id }).lean()
    if (!prev) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 })

    const decryptedPrev = decryptReservation(prev)
    const updateFields: any = { status }
    if (status === 'confirmed') {
      updateFields['notifications.confirmationSent'] = true
    } else if (status === 'cancelled') {
      updateFields['notifications.cancellationSent'] = true
    }

    const reservation = await Reservation.findOneAndUpdate(
      { _id: reservaId, tenantId: tenant._id },
      { $set: updateFields },
      { returnDocument: 'after', lean: true }
    )
    if (!reservation) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 })

    if (status === 'confirmed' && !prev.notifications?.confirmationSent) {
      const location = await Location.findById(prev.locationId).lean()
      sendReservationConfirmation(
        {
          reservationNumber: prev.reservationNumber,
          name: decryptedPrev.name,
          phone: decryptedPrev.phone,
          email: prev.email || undefined,
          clientToken: prev.clientToken || undefined,
          date: prev.date,
          time: prev.time,
          partySize: prev.partySize,
          notes: prev.notes || '',
          status: 'confirmed',
        },
        { name: tenant.name, slug: tenant.slug },
        location?.name || undefined
      ).catch(e => console.error('[reservas] notification error:', e))
    }

    if (status === 'cancelled' && !prev.notifications?.cancellationSent) {
      sendReservationCancellation(
        {
          reservationNumber: prev.reservationNumber,
          name: decryptedPrev.name,
          phone: decryptedPrev.phone,
          email: prev.email || undefined,
          clientToken: prev.clientToken || undefined,
          date: prev.date,
          time: prev.time,
          partySize: prev.partySize,
          notes: prev.notes || '',
          status: 'cancelled',
        },
        { name: tenant.name, slug: tenant.slug }
      ).catch(e => console.error('[reservas] cancel notification error:', e))
    }

    return NextResponse.json({ reservation: decryptReservation(reservation) })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
