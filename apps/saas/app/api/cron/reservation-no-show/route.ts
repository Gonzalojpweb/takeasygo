import { connectDB } from '@/lib/mongoose'
import Reservation from '@/models/Reservation'
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
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

    const dateStr = `${oneHourAgo.getFullYear()}-${String(oneHourAgo.getMonth() + 1).padStart(2, '0')}-${String(oneHourAgo.getDate()).padStart(2, '0')}`
    const timeStr = `${String(oneHourAgo.getHours()).padStart(2, '0')}:${String(oneHourAgo.getMinutes()).padStart(2, '0')}`

    const result = await Reservation.updateMany(
      {
        status: 'confirmed',
        date: { $lte: dateStr },
        time: { $lte: timeStr },
      },
      { $set: { status: 'no_show' } }
    )

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      markedNoShow: result.modifiedCount,
    })
  } catch (error) {
    console.error('[Cron:reservation-no-show] Error:', error)
    return NextResponse.json(
      { error: 'Error ejecutando cron job', details: String(error) },
      { status: 500 }
    )
  }
}
