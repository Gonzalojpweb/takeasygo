/**
 * Cron Job: sincronizar el programa de referidos (respaldo)
 *
 * Cada pedido entregado o cancelado ya sincroniza al invitado en el momento
 * (rutas de estado). Este cron barre una vez por día los referidos de los
 * últimos 120 días por si algún aviso se perdió (pedido entregado por otro
 * camino, error transitorio). Idempotente: no paga dos veces nada.
 *
 * URL: /api/cron/referrals-sync
 * Método: GET (header Authorization: Bearer CRON_SECRET)
 */

import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { requireCronSecret } from '@/lib/apiAuth'
import { syncRecentReferrals } from '@/lib/referrals'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authError = await requireCronSecret(request)
  if (authError) return authError
  try {
    await connectDB()
    const result = await syncRecentReferrals({ sinceDays: 120, limit: 500 })
    console.log('[cron/referrals-sync]', result)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error('[cron/referrals-sync]', error)
    return NextResponse.json({ error: 'Error al sincronizar referidos' }, { status: 500 })
  }
}
