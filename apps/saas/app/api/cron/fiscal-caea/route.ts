/**
 * Cron Job: contingencia CAEA de ARCA
 *
 * Para cada comercio con facturación y contingencia activas:
 *   1. pide/guarda el CAEA de la quincena (y de la próxima desde 5 días antes)
 *      y sincroniza los contadores de los puntos de venta de contingencia;
 *   2. informa a ARCA los comprobantes emitidos con CAEA;
 *   3. informa «sin movimiento» los puntos de contingencia que no se usaron
 *      en una quincena terminada.
 * Fase 6 de caja — ADMIN/FASE6_ONLINE_POINT_CAEA_LIBRO_DIGITAL.md
 *
 * URL: /api/cron/fiscal-caea
 * Método: GET (header Authorization: Bearer CRON_SECRET)
 */

import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { requireCronSecret } from '@/lib/apiAuth'
import FiscalProfile from '@/models/FiscalProfile'
import FiscalDocument from '@/models/FiscalDocument'
import { ensureCaea, informCaea } from '@/lib/fiscal/caea'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authError = await requireCronSecret(request)
  if (authError) return authError
  try {
    await connectDB()
    const withContingency = await FiscalProfile.find({ enabled: true, 'contingency.enabled': true }).select('tenantId').lean()
    // También comercios que apagaron la contingencia pero tienen CAEA sin informar.
    const pendingTenants = await FiscalDocument.distinct('tenantId', { authMode: 'caea', status: 'authorized', caeaInformedAt: null })
    const tenantIds = new Set([...withContingency.map((p) => String(p.tenantId)), ...pendingTenants.map(String)])

    const summary = { tenants: tenantIds.size, caea: 0, informed: 0, rejected: 0, noMovement: 0, errors: 0 }
    for (const tenantId of tenantIds) {
      try {
        const got = await ensureCaea(tenantId)
        summary.caea += got.periods.length
        const informed = await informCaea(tenantId)
        summary.informed += informed.informed
        summary.rejected += informed.rejected
        summary.noMovement += informed.noMovement
      } catch (err) {
        summary.errors++
        console.error(`[cron/fiscal-caea] ${tenantId}:`, err instanceof Error ? err.message : err)
      }
    }
    console.log('[cron/fiscal-caea]', JSON.stringify(summary))
    return NextResponse.json({ ok: true, ...summary })
  } catch (error) {
    console.error('[cron/fiscal-caea]', error)
    return NextResponse.json({ error: 'Error en la contingencia CAEA' }, { status: 500 })
  }
}
