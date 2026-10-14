import { connectDB } from '@/lib/mongoose'
import Reservation from '@/models/Reservation'
import Location from '@/models/Location'
import { DEFAULT_TIMEZONE } from '@/lib/restaurant-time'
import { NextRequest, NextResponse } from 'next/server'

const CRON_SECRET = process.env.CRON_SECRET

const pad = (n: number) => String(n).padStart(2, '0')

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    // Buscar reservas confirmed que ya pasaron en cualquier timezone
    // Ventana: las últimas 24h en UTC cubre cualquier timezone
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

    const candidates = await Reservation.find({
      status: 'confirmed',
      date: { $in: [fmtDate(oneHourAgo), fmtDate(dayAgo), fmtDate(now)] },
    }).lean()

    let markedNoShow = 0

    // Cachear timezone por sede
    const tzCache = new Map<string, string>()

    for (const r of candidates) {
      const locKey = r.locationId ? String(r.locationId) : 'null'
      let tz = tzCache.get(locKey)
      if (tz === undefined) {
        const location = r.locationId ? await Location.findById(r.locationId).lean() : null
        tz = (location as { timezone?: string } | null)?.timezone || DEFAULT_TIMEZONE
        tzCache.set(locKey, tz)
      }

      // ¿Ya pasó en la timezone de la sede?
      const nowInTz = new Date(now.toLocaleString('en-US', { timeZone: tz }))
      const oneHourAgoInTz = new Date(oneHourAgo.toLocaleString('en-US', { timeZone: tz }))
      const todayStr = fmtDate(nowInTz)
      const oneHourAgoTimeStr = fmtTime(oneHourAgoInTz)

      // Reserva es de hoy (o ayer) y su hora + 1h ya pasó
      const isPast = r.date < todayStr ||
        (r.date === todayStr && r.time < oneHourAgoTimeStr)

      if (!isPast) continue

      await Reservation.updateOne(
        { _id: r._id },
        { $set: { status: 'no_show' } }
      )
      markedNoShow++
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      markedNoShow,
    })
  } catch (error) {
    console.error('[Cron:reservation-no-show] Error:', error)
    return NextResponse.json(
      { error: 'Error ejecutando cron job', details: String(error) },
      { status: 500 }
    )
  }
}
