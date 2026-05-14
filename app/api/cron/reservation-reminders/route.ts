import { connectDB } from '@/lib/mongoose'
import Reservation from '@/models/Reservation'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { safeDecrypt } from '@/lib/crypto'
import { sendReservationReminder } from '@/lib/reservationNotifications'
import { NextRequest, NextResponse } from 'next/server'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    const now = new Date()
    const inTwoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000)

    const dateStr = `${inTwoHours.getFullYear()}-${String(inTwoHours.getMonth() + 1).padStart(2, '0')}-${String(inTwoHours.getDate()).padStart(2, '0')}`
    const timeStr = `${String(inTwoHours.getHours()).padStart(2, '0')}:${String(inTwoHours.getMinutes()).padStart(2, '0')}`

    const reservations = await Reservation.find({
      status: 'confirmed',
      date: dateStr,
      time: { $lte: timeStr },
      $or: [
        { 'notifications.reminderSent': { $ne: true } },
        { 'notifications.reminderSent': { $exists: false } },
      ],
    }).lean()

    let sentCount = 0

    for (const r of reservations) {
      const tenant = await Tenant.findById(r.tenantId).lean()
      if (!tenant) continue

      const decrypted = { name: safeDecrypt(r.name), phone: safeDecrypt(r.phone) }
      const location = r.locationId ? await Location.findById(r.locationId).lean() : null

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
