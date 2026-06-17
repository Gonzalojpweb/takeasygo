import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import { NextRequest, NextResponse } from 'next/server'

const CRON_SECRET = process.env.CRON_SECRET
const PURGE_AFTER_DAYS = 90

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    const cutoff = new Date(Date.now() - PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000)

    const result = await Order.deleteMany({
      deletedAt: { $lt: cutoff },
    })

    return NextResponse.json({
      success: true,
      purgedCount: result.deletedCount,
      cutoff: cutoff.toISOString(),
    })
  } catch (error) {
    console.error('[cron/purge-soft-deleted] Error:', error)
    return NextResponse.json({ error: 'Error al purgar órdenes eliminadas' }, { status: 500 })
  }
}
