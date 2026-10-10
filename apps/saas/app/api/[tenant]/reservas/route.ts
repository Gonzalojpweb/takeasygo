import { connectDB } from '@/lib/mongoose'
import mongoose from 'mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Reservation from '@/models/Reservation'
import Counter from '@/models/Counter'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, getSessionUser } from '@/lib/apiAuth'
import { enforceLocationScope, logScopeAllowed } from '@/lib/location-scope'
import { getStrictLocationIdMode } from '@/lib/feature-flags'
import { rateLimit } from '@/lib/rateLimit'
import { canAccess } from '@/lib/plans'
import { encrypt, safeDecrypt } from '@/lib/crypto'
import { sendReservationConfirmation } from '@/lib/reservationNotifications'
import { sendWhatsApp } from '@/lib/whatsapp'
import {
  DEFAULT_MIN_ADVANCE_MINUTES,
  DEFAULT_TIMEZONE,
  getLocalDayAndMinutes,
  getTodayStrInTimezone,
  isSlotBookable,
  isValidCalendarDate,
  isValidHHMM,
  timeToMinutes,
} from '@/lib/restaurant-time'
import {
  ACTIVE_RESERVATION_STATUSES,
  getSeatsState,
  isSpacesMode,
} from '@/lib/space-capacity'

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

    if (locationId) {
      if (!mongoose.isValidObjectId(locationId)) {
        return NextResponse.json({ error: 'locationId inválido' }, { status: 400 })
      }
      // Oleada 1: aislamiento estricto por sede (flag de 3 valores off|log|enforce).
      const scopeMode = getStrictLocationIdMode(tenant as any)
      if (scopeMode !== 'off') {
        const user = await getSessionUser(request)
        const scopeError = enforceLocationScope(user, locationId)
        if (scopeError) {
          if (scopeMode === 'enforce') return scopeError
          logScopeAllowed({ route: 'GET /reservas', tenant: tenantSlug, locationId, userId: user?.id, role: user?.role })
        }
      }
    }

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

    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    const { success } = await rateLimit(`create-reserva:${ip}`, 5, 60_000)
    if (!success) {
      return NextResponse.json({ error: 'Demasiadas solicitudes. Esperá un minuto.' }, { status: 429 })
    }

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
    const { locationId, date, time, partySize, name, phone, email, clientToken, notes, spaceId } = body

    if (!locationId || !date || !time || !partySize || !name || !phone) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
    }

    // Formato de fecha y hora
    if (!isValidCalendarDate(date)) {
      return NextResponse.json({ error: 'Fecha inválida. Usar formato YYYY-MM-DD' }, { status: 400 })
    }
    if (!isValidHHMM(time)) {
      return NextResponse.json({ error: 'Horario inválido. Usar formato HH:MM' }, { status: 400 })
    }

    const location = await Location.findOne({ _id: locationId, tenantId: tenant._id, isActive: true })
    if (!location) return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })

    if (!location.reservationConfig?.enabled) {
      return NextResponse.json({ error: 'Reservaciones no habilitadas para esta sede' }, { status: 400 })
    }

    const reservationConfig = location.reservationConfig
    const timezone = location.timezone || DEFAULT_TIMEZONE
    // Los documentos viejos no traen el campo (o llegan via .lean()): ?? explícito.
    const minAdvanceMinutes = reservationConfig.minAdvanceMinutes ?? DEFAULT_MIN_ADVANCE_MINUTES
    // maxPartySize ausente o null = sin límite.
    const maxPartySize = reservationConfig.maxPartySize
    if (maxPartySize != null && partySize > maxPartySize) {
      return NextResponse.json(
        { error: `Como máximo ${maxPartySize} personas por reserva` },
        { status: 400 }
      )
    }

    // Fechas y horarios ya transcurridos no se pueden reservar
    const todayStr = getTodayStrInTimezone(timezone)
    if (date < todayStr) {
      return NextResponse.json({ error: 'La fecha de la reserva ya pasó.' }, { status: 400 })
    }
    if (date === todayStr) {
      const { minutes: nowMinutes } = getLocalDayAndMinutes(new Date(), timezone)
      if (!isSlotBookable(timeToMinutes(time), nowMinutes, minAdvanceMinutes)) {
        return NextResponse.json(
          { error: `Ese horario ya pasó. Elegí uno a partir de ${minAdvanceMinutes} minutos desde ahora.` },
          { status: 400 }
        )
      }
    }

    const spaces = location.spaces
    const spacesMode = isSpacesMode(spaces)
    const blockDuration = reservationConfig.slotConfig?.blockDurationMinutes || 90

    // En modo espacios el cliente tiene que elegir uno concreto de la sede.
    if (spacesMode) {
      if (typeof spaceId !== 'string' || !/^[0-9a-fA-F]{24}$/.test(spaceId)) {
        return NextResponse.json({ error: 'Elegí un espacio para tu reserva.' }, { status: 400 })
      }
      const space = (spaces as Array<{ _id?: unknown; name: string; capacity: number; enabled?: boolean; blockedDates?: string[] }>)
        .find(s => s._id != null && String(s._id) === spaceId)
      if (!space) {
        return NextResponse.json({ error: 'El espacio elegido no existe en esta sede.' }, { status: 400 })
      }
      if (space.enabled === false) {
        return NextResponse.json(
          { error: `El espacio "${space.name}" no está habilitado. Elegí otro.` },
          { status: 400 }
        )
      }
      if ((space.blockedDates ?? []).includes(date)) {
        return NextResponse.json(
          { error: `El espacio "${space.name}" no está disponible en esa fecha. Elegí otro.` },
          { status: 400 }
        )
      }
      if (partySize > space.capacity) {
        return NextResponse.json(
          {
            error: `Tu grupo de ${partySize} personas no entra en "${space.name}" (máximo ${space.capacity} personas).`,
          },
          { status: 400 }
        )
      }
    }

    // Disponibilidad: valida en ambos modos (automático y manual)
    const { generateReservationSlots } = await import('@/lib/reservation-slots')
    const available = await generateReservationSlots(locationId, date, reservationConfig, {
      timezone,
      minAdvanceMinutes,
      spaces,
      partySize,
      spaceId: spacesMode ? spaceId : null,
    })
    if (available.slots.length === 0) {
      return NextResponse.json(
        { error: 'Esta sede no tiene horarios de reserva configurados para ese día.', availableSlots: [] },
        { status: 409 }
      )
    }
    const requestedSlot = available.slots.find(s => s.time === time)
    if (!requestedSlot || !requestedSlot.available) {
      return NextResponse.json({
        error: 'El horario seleccionado ya no está disponible. Elegí otro.',
        availableSlots: available.slots.filter(s => s.available).map(s => s.time),
      }, { status: 409 })
    }

    // Generate reservation number (atomic counter)
    const counter = await Counter.findOneAndUpdate(
      { tenantId: tenant._id },
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    )
    const reservationNumber = `R${String(counter.seq).padStart(4, '0')}`

    // Se cobra solo si el admin dejó los pagos activos y hay seña > 0.
    const minPayment = reservationConfig.minPayment ?? 0
    const paymentAmount =
      reservationConfig.paymentsEnabled !== false && minPayment > 0 ? minPayment : 0

    const reservation = await Reservation.create({
      tenantId: tenant._id,
      locationId,
      reservationNumber,
      date,
      time,
      partySize,
      name:  encrypt(name.trim()),
      phone: encrypt(phone.trim()),
      email: email?.trim() || '',
      clientToken: clientToken || null,
      notes: notes?.trim() || '',
      spaceId: spacesMode && typeof spaceId === 'string' ? spaceId : null,
      status: 'pending_payment',
      payment: {
        amount: paymentAmount,
        status: 'pending',
        mercadopagoId: null,
        preferenceId: null,
        mpAccountId: null,
      },
      notifications: {},
    })

    // Aforo por espacios: insertar y recontar. Si entre el chequeo previo y el
    // insert otra reserva copió el lugar, la capacidad queda excedida: se
    // revierte la inserción y se contesta 409.
    if (spacesMode) {
      const after = await Reservation.find({
        locationId,
        date,
        status: { $in: [...ACTIVE_RESERVATION_STATUSES] },
      }).lean()
      const state = getSeatsState({
        spaces,
        date,
        time,
        blockDurationMinutes: blockDuration,
        reservations: after,
      })
      const spaceState = getSeatsState({
        spaces,
        date,
        time,
        blockDurationMinutes: blockDuration,
        reservations: after,
        spaceId: typeof spaceId === 'string' ? spaceId : null,
      })
      if (state.occupied > state.capacity || spaceState.occupied > spaceState.capacity) {
        await Reservation.deleteOne({ _id: reservation._id })
        return NextResponse.json(
          {
            error: 'La capacidad de este horario se llenó mientras reservabas. Elegí otro.',
            availableSlots: [],
          },
          { status: 409 }
        )
      }
    }

    const isFree = paymentAmount <= 0
    if (isFree) {
      await sendReservationConfirmation(
        {
          reservationNumber,
          name: name.trim(),
          phone: phone.trim(),
          email: email?.trim(),
          clientToken: clientToken || undefined,
          date,
          time,
          partySize,
          notes: notes?.trim() || '',
          status: 'confirmed',
        },
        { name: tenant.name, slug: tenant.slug },
        location.name,
        tenant._id.toString()
      ).catch(e => console.error('[reservas] notification error:', e))
    }

    if (tenant.notifications?.whatsappPhone && tenant.notifications.notifyOnReservation) {
      sendWhatsApp(
        tenant.notifications.whatsappPhone,
        `📅 Nueva reserva en ${tenant.name}\n👤 ${name.trim()} - ${date} ${time}\n👥 ${partySize} pers.`
      ).catch(e => console.error('[whapi] reservation notification error:', e))
    }

    return NextResponse.json({ reservation }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
