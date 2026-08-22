/**
 * Cron Job: Expirar hidden reward claims
 *
 * 1. Reserva (15min) → expired: device fingerprint reservation expired
 * 2. Pendiente (claimExpiryDays) → expired: claim expired before payment
 *
 * URL: /api/cron/expire-hidden-reservations
 * Método: GET (con header Authorization: Bearer CRON_SECRET)
 * Frecuencia recomendada: cada 5 minutos
 */

import { connectDB } from '@/lib/mongoose'
import HiddenRewardClaim from '@/models/HiddenRewardClaim'
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
    const results = { expiredReservations: 0, expiredPending: 0 }

    // 1. Expirar reservas vencidas (reserva → expired)
    // Reservas con reservationExpiresAt < now y status = reserva
    const expiredReservations = await HiddenRewardClaim.updateMany(
      {
        status: 'reserva',
        reservationExpiresAt: { $lt: now },
      },
      {
        $set: { status: 'expired' },
      }
    )
    results.expiredReservations = expiredReservations.modifiedCount

    // 2. Expirar claims pendientes vencidos (pendiente → expired)
    // Claims con expiresAt < now y status = pendiente
    const expiredPending = await HiddenRewardClaim.updateMany(
      {
        status: 'pendiente',
        expiresAt: { $lt: now },
      },
      {
        $set: { status: 'expired' },
      }
    )
    results.expiredPending = expiredPending.modifiedCount

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      ...results,
    })
  } catch (error) {
    console.error('[Cron:expire-hidden-reservations] Error:', error)
    return NextResponse.json(
      { error: 'Error ejecutando cron job', details: String(error) },
      { status: 500 },
    )
  }
}
