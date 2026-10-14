import { connectDB } from '@/lib/mongoose'
import Reservation from '@/models/Reservation'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { safeDecrypt } from '@/lib/crypto'
import { sendReservationReminder } from '@/lib/reservationNotifications'
import { getTodayStrInTimezone, DEFAULT_TIMEZONE } from '@/lib/restaurant-time'
import { NextRequest, NextResponse } from 'next/server'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    // Ventana amplia: UTC-12 a UTC+14. Después filtramos por timezone real de cada sede.
    const now = new Date()
    const inTwoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000)
    const windowStart = new Date(now.getTime() - 14 * 60 * 60 * 1000)
    const windowEnd = new Date(inTwoHours.getTime() + 12 * 60 * 60 * 1000)
    const pad = (n: number) => String(n).padStart(2, '0')
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

    // Buscar reservas en ventana UTC amplia, luego filtrar por timezone real
    const dateCandidates = [fmt(windowStart), fmt(now), fmt(inTwoHours), fmt(windowEnd)]
    const reservations = await Reservation.find({
      status: 'confirmed',
      date: { $in: dateCandidates },
      $or: [
        { 'notifications.reminderSent': { $ne: true } },
        { 'notifications.reminderSent': { $exists: false } },
      ],
    }).lean()

    let sentCount = 0

    // Cachear sedes para no re-queryar
    const locCache = new Map<string, { name: string; timezone: string } | null>()

    for (const r of reservations) {
      const tenant = await Tenant.findById(r.tenantId).lean()
      if (!tenant) continue

      const locKey = r.locationId ? String(r.locationId) : 'null'
      if (!locCache.has(locKey)) {
        locCache.set(locKey, null)
      }

      const location = r.locationId ? await Location.findById(r.locationId).lean() : null
      const tz = (location as { timezone?: string } | null)?.timezone || DEFAULT_TIMEZONE

      // Verificar si en la timezone de la sede la reserva es dentro de las próximas 2h
      const todayStr = getTodayStrInTimezone(tz)
      const nowInTz = new Date(now.toLocaleString('en-US', { timeZone: tz }))
      const inTwoHoursInTz = new Date(inTwoHours.toLocaleString('en-US', { timeZone: tz }))
      const nowTimeStr = `${pad(nowInTz.getHours())}:${pad(nowInTz.getMinutes())}`
      const endTimeStr = `${pad(inTwoHoursInTz.getHours())}:${pad(inTwoHoursInTz.getMinutes())}`

      // La reserva debe ser hoy en la timezone de la sede, y su hora entre ahora y +2h
      if (r.date !== todayStr) continue
      if (r.time < nowTimeStr || r.time > endTimeStr) continue

      const decrypted = { name: safeDecrypt(r.name), phone: safeDecrypt(r.phone) }

      await sendReservationReminder(
        {
          reservationNumber: r.reservationNumber,
          name: decrypted.name,
          phone: decrypted.phone,
          email: r.email || undefined,
          clientToken: r.clientToken || undefined,
          date: r.date,
          time: r.time,
          partySize: r.partySize,
          notes: r.notes || '',
          status: r.status,
        },
        { name: tenant.name, slug: tenant.slug },
        location?.name || undefined
      )

      await Reservation.updateOne(
        { _id: r._id },
        { $set: { 'notifications.reminderSent': true } }
      )

      sentCount++
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      sent: sentCount,
      total: reservations.length,
    })
  } catch (error) {
    console.error('[Cron:reservation-reminders] Error:', error)
    return NextResponse.json(
      { error: 'Error ejecutando cron job', details: String(error) },
      { status: 500 }
    )
  }
}
