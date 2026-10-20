import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Reservation from '@/models/Reservation'
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { requireAuth, getSessionUser } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'
import { guardResourceLocation } from '@/lib/location-scope'
import { safeDecrypt } from '@/lib/crypto'
import { sendReservationConfirmation, sendReservationCancellation } from '@/lib/reservationNotifications'

function decryptReservation(r: any) {
  return { ...r, name: safeDecrypt(r.name), phone: safeDecrypt(r.phone) }
}

async function resolveTenant(tenantSlug: string) {
  await connectDB()
  return Tenant.findOne({ slug: tenantSlug, isActive: true })
}

// Sin GET por id: era público y devolvía la reserva descifrada (nombre,
// teléfono, email, clientToken) a quien tuviera el ObjectId, que viaja en la
// back_url de MP. Ningún cliente lo usaba: la página de éxito lee la DB y el
// panel admin lista por GET /reservas.

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

    if (!mongoose.Types.ObjectId.isValid(reservaId)) {
      return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 })
    }
    const prev = await Reservation.findOne({ _id: reservaId, tenantId: tenant._id }).lean()
    if (!prev) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 })

    // Sede de la reserva (no del request): un usuario con sedes asignadas no
    // opera reservas de otra sede → 404, sin filtrar existencia.
    const sessionUser = await getSessionUser(request)
    const scopeError = guardResourceLocation(sessionUser, prev.locationId, 'Reserva no encontrada')
    if (scopeError) return scopeError

    const permError = await enforcePermissionForRequest(request, {
      tenant,
      tenantId: tenant._id.toString(),
      locationId: prev.locationId?.toString() ?? null,
      permission: 'reservations.write',
    })
    if (permError) return permError

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
      const location = (await Location.findById(prev.locationId).lean()) as {
        name?: string
        spaces?: Array<{ _id?: unknown; name: string }>
      } | null
      const spaceName = location?.spaces?.find(
        s => String(s._id) === String(prev.spaceId)
      )?.name
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
          paymentAmountCents: prev.payment?.amount || 0,
          spaceName,
        },
        { name: tenant.name, slug: tenant.slug },
        location?.name || undefined,
        tenant._id.toString(),
        prev.locationId?.toString()
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
        { name: tenant.name, slug: tenant.slug },
        tenant._id.toString(),
        prev.locationId?.toString()
      ).catch(e => console.error('[reservas] cancel notification error:', e))
    }

    return NextResponse.json({ reservation: decryptReservation(reservation) })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
