/**
 * Cron Job: Expirar canjes standalone vencidos
 *
 * Los canjes standalone (creados desde la tienda) vencen a las
 * redemptionExpiryHours del tenant. Este cron los pasa a 'expired' y le
 * devuelve los puntos al miembro (restaurando stock y contadores,
 * idempotente vía flip condicional). Los canjes de checkout (expiresAt
 * null) NUNCA vencen acá: sus puntos viven y mueren con la orden.
 *
 * URL: /api/cron/expire-store-redemptions
 * Método: GET (con header Authorization: Bearer CRON_SECRET)
 * Frecuencia: cada hora
 */

import { connectDB } from '@/lib/mongoose'
import StoreRedemption from '@/models/StoreRedemption'
import { expireStoreRedemption } from '@/lib/store-redemptions'
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
    // standalone explícito + legacy sin source (docs anteriores al campo,
    // jamás con orderId → se tratan como standalone) + expiresAt vencido:
    // los checkout tienen expiresAt null y no deben expirar jamás. Acotado
    // por lote; lo que no entre en este run lo barre la próxima ejecución.
    const due = await StoreRedemption.find({
      status: 'pending',
      $and: [
        { $or: [{ source: 'standalone' }, { source: null, orderId: null }] },
        { expiresAt: { $lte: now } },
      ],
    })
      .select('tenantId memberId storeItemId pointsUsed source')
      .limit(500)
      .lean()

    let expired = 0
    let pointsReturned = 0
    let failures = 0

    for (const redemption of due) {
      try {
        const won = await expireStoreRedemption(redemption)
        if (won) {
          expired++
          pointsReturned += redemption.pointsUsed || 0
        }
      } catch (err) {
        failures++
        console.error('[Cron:expire-store-redemptions] Error expirando canje:', redemption._id, err)
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      scanned: due.length,
      expired,
      pointsReturned,
      failures,
    })
  } catch (error) {
    console.error('[Cron:expire-store-redemptions] Error:', error)
    return NextResponse.json(
      { error: 'Error ejecutando cron job', details: String(error) },
      { status: 500 },
    )
  }
}
