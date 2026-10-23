/**
 * Cron Job: control diario del split de MercadoPago
 *
 * Prueba cada conexión del split vigente contra MercadoPago (/users/me con
 * el token del split). Si MercadoPago responde que el permiso ya no existe
 * (el dueño lo quitó desde su cuenta), marca la cuenta, avisa al comercio y
 * al superadmin y — con candado — MercadoPago queda pausado en ese comercio
 * hasta reconectar (lib/mp-split-guard). Nunca se cobra sin comisión.
 *
 * URL: /api/cron/mp-split-health
 * Método: GET (header Authorization: Bearer CRON_SECRET)
 */

import { NextRequest, NextResponse } from 'next/server'
import type { Types } from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { requireCronSecret } from '@/lib/apiAuth'
import { checkSplitHealth, type TenantMpLike } from '@/lib/mp-split-guard'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authError = await requireCronSecret(request)
  if (authError) return authError
  try {
    await connectDB()
    const tenants = await Tenant.find({ $or: [{ 'mpOAuth.isConnected': true }, { 'mpAccounts.oauthIsConnected': true }] })
      .select('_id slug name mpOAuth mpAccounts mpSplitGuard')
      .lean<Array<TenantMpLike & { _id: Types.ObjectId; slug: string }>>()
    let revoked = 0
    let unknown = 0
    for (const t of tenants) {
      const results = await checkSplitHealth(t)
      revoked += results.filter((r) => r.result === 'revoked').length
      unknown += results.filter((r) => r.result === 'unknown').length
    }
    console.log(`[cron/mp-split-health] comercios=${tenants.length} revocados=${revoked} sin_respuesta=${unknown}`)
    return NextResponse.json({ ok: true, tenants: tenants.length, revoked, unknown })
  } catch (error) {
    console.error('[cron/mp-split-health]', error)
    return NextResponse.json({ error: 'Error al controlar el split' }, { status: 500 })
  }
}
