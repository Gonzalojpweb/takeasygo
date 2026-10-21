import { connectDB } from '@/lib/mongoose'
import mongoose from 'mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Reservation from '@/models/Reservation'
import Counter from '@/models/Counter'
import { nextPerLocationNumber } from '@/lib/perLocationNumber'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, getSessionUser } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'
import { enforceLocationScope, logScopeAllowed, scopeLocationFilter } from '@/lib/location-scope'
import { getStrictLocationIdMode, isFlagEnabled, FLAGS } from '@/lib/feature-flags'
import { rateLimit } from '@/lib/rateLimit'
import { canAccess } from '@/lib/plans'
import { encrypt, safeDecrypt } from '@/lib/crypto'
import { sendReservationConfirmation } from '@/lib/reservationNotifications'
import { sendWhatsApp } from '@/lib/whatsapp'
import { pickAdminWhatsApp } from '@/lib/location-resolvers'
import { acquireReservationLock } from '@/lib/reservation-lock'
import { applyAutoNoShow } from '@/lib/reservation-no-show'
import { toPesos } from '@takeasygo/business'
import {
  DEFAULT_MIN_ADVANCE_MINUTES,
  addDaysToDateStr,
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

    const permError = await enforcePermissionForRequest(request, {
      tenant,
      tenantId: tenant._id.toString(),
      locationId,
      permission: 'reservations.read',
    })
    if (permError) return permError

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

    // Alcance de sede siempre activo (además del flag de arriba): sede ajena
    // → 404; sin locationId, un usuario de sede ve solo las suyas.
    const sedeScope = await scopeLocationFilter(request, locationId)
    if ('error' in sedeScope) return sedeScope.error
    Object.assign(filter, sedeScope.filter)

    // No-show automático (perezoso) antes de leer.
    await applyAutoNoShow(tenant._id, locationId ? { _id: locationId } : {})

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
    const maxAdvanceDays = reservationConfig.maxAdvanceDays
    if (maxAdvanceDays != null && date > addDaysToDateStr(todayStr, maxAdvanceDays)) {
      return NextResponse.json(
        { error: `Se puede reservar con hasta ${maxAdvanceDays} días de anticipación.` },
        { status: 400 }
      )
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

    // R-1: exclusión mutua por (sede, fecha). Disponibilidad, numeración y
    // alta corren con el lock tomado: dos requests concurrentes no pueden
    // pasar ambos el chequeo y sobrevender la franja.
    const releaseLock = await acquireReservationLock(tenant._id, locationId, date)
    if (!releaseLock) {
      return NextResponse.json(
        { error: 'Hay muchas reservas en curso para esa fecha. Intentá de nuevo en unos segundos.' },
        { status: 409 }
      )
    }
    const releaseAnd = async (response: NextResponse) => {
      await releaseLock()
      return response
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
      return releaseAnd(NextResponse.json(
        { error: 'Esta sede no tiene horarios de reserva configurados para ese día.', availableSlots: [] },
        { status: 409 }
      ))
    }
    const requestedSlot = available.slots.find(s => s.time === time)
    // Lista de espera: con el horario lleno, el cliente puede pedir que lo
    // anoten (body.waitlist). No ocupa lugar ni cobra seña hasta confirmarse.
    const isWaitlist = body.waitlist === true && !!requestedSlot && !requestedSlot.available
    if ((!requestedSlot || !requestedSlot.available) && !isWaitlist) {
      return releaseAnd(NextResponse.json({
        error: 'El horario seleccionado ya no está disponible. Elegí otro.',
        availableSlots: available.slots.filter(s => s.available).map(s => s.time),
        waitlistAvailable: !!requestedSlot,
      }, { status: 409 }))
    }

    // Generate reservation number: perLocation (flag ON + prefijos completos) o legacy
    let reservationNumber: string
    const { allLocationsHavePrefix } = await import('@/lib/perLocationNumber')
    const numberingReady = isFlagEnabled(tenant, FLAGS.NUMBERING_PER_LOCATION)
      && await allLocationsHavePrefix(tenant._id)
    if (numberingReady) {
      reservationNumber = await nextPerLocationNumber({
        tenantId: tenant._id,
        locationId,
        type: 'reservation',
        location: { name: location.name, prefix: (location as any).prefix },
      })
    } else {
      const counter = await Counter.findOneAndUpdate(
        { tenantId: tenant._id },
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
      )
      reservationNumber = `R${String(counter.seq).padStart(4, '0')}`
    }

    // Se cobra solo si el admin dejó los pagos activos y hay seña > 0.
    const minPayment = reservationConfig.minPayment ?? 0
    const paymentAmount =
      reservationConfig.paymentsEnabled !== false && minPayment > 0 ? minPayment : 0
    const isFree = paymentAmount <= 0

    if (isWaitlist) {
      const waitlistEntry = await Reservation.create({
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
        status: 'waitlist',
        payment: { amount: 0, status: 'pending', mercadopagoId: null, preferenceId: null, mpAccountId: null },
        notifications: { confirmationSent: false },
      })
      return releaseAnd(NextResponse.json({ reservation: waitlistEntry, waitlist: true }, { status: 201 }))
    }

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
      // Reserva gratis → la confirmación (cliente + WhatsApp al admin) sale en
      // ESTE mismo request: el flag nace en true para que un webhook/reconcile
      // tardío no la duplique. Con seña queda en false hasta el pago.
      notifications: { confirmationSent: isFree },
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
        return releaseAnd(NextResponse.json(
          {
            error: 'La capacidad de este horario se llenó mientras reservabas. Elegí otro.',
            availableSlots: [],
          },
          { status: 409 }
        ))
      }
    }

    await releaseLock()

    // ════════════════════════════════════════════════════════════════════
    // ORDEN CRÍTICO: la confirmación al cliente y la creación de la
    // preferencia de cobro (seña) ocurren SOLO después del chequeo de
    // concurrencia. Si el request es descartado (409), nunca se cobra ni
    // se notifica al cliente.
    // ════════════════════════════════════════════════════════════════════

    const spaceName = spacesMode && typeof spaceId === 'string'
      ? (spaces as Array<{ _id?: unknown; name: string }> | undefined)
          ?.find(s => String(s._id) === String(spaceId))?.name
      : undefined
    if (isFree) {
      // El flag confirmationSent ya nació en true en el create (dedup).
      sendReservationConfirmation(
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
          paymentAmountCents: 0,
          spaceName,
        },
        { name: tenant.name, slug: tenant.slug },
        location.name,
        tenant._id.toString(),
        location._id?.toString()
      ).catch(e => console.error('[reservas] notification error:', e))
    }

    // WhatsApp admin: destino y flags con override por sede (hereda el global).
    // Reserva gratis → se omite: la confirmación con info completa (incluye el
    // WhatsApp al admin) sale en el mismo request desde arriba.
    const waTarget = pickAdminWhatsApp(tenant, location.settings)
    if (!isFree && waTarget.phone && waTarget.notifyOnReservation) {
      const creationLines = [
        `📅 *Nueva reserva en ${tenant.name}*`,
        `👤 ${name.trim()} — 📱 ${phone.trim()}`,
        `📅 ${date} ${time} hs · 👥 ${partySize} pers`,
        `📍 ${location.name}`,
      ]
      if (spaceName) creationLines.push(`🪑 ${spaceName}`)
      creationLines.push(`🔢 Código #${reservationNumber}`)
      if (paymentAmount > 0) {
        creationLines.push(`⏳ Pendiente de seña de $${toPesos(paymentAmount).toLocaleString('es-AR')}`)
      }
      if (notes?.trim()) creationLines.push(`📝 ${notes.trim()}`)
      sendWhatsApp(
        waTarget.phone,
        creationLines.join('\n')
      ).catch(e => console.error('[whapi] reservation notification error:', e))
    }

    return NextResponse.json({ reservation }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
