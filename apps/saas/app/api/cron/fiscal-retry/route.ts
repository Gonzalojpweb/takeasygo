/**
 * Cron Job: reintentar comprobantes electrónicos pendientes
 *
 * Facturas o notas de crédito que no recibieron CAE porque ARCA no respondió
 * (timeout, caída). Para cada una se consulta primero si el número reservado
 * quedó autorizado (sin duplicar) y si no, se pide de nuevo. Los rechazados
 * no se reintentan: necesitan revisión en el panel.
 * Fase 5 de caja — ADMIN/FASE5_COMPROBANTES_NC_LIBRO_IVA.md
 *
 * URL: /api/cron/fiscal-retry
 * Método: GET (header Authorization: Bearer CRON_SECRET)
 */

import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { requireCronSecret } from '@/lib/apiAuth'
import { retryPendingDocuments } from '@/lib/fiscal/issue'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authError = await requireCronSecret(request)
  if (authError) return authError
  try {
    await connectDB()
    const result = await retryPendingDocuments({ limit: 25, olderThanMs: 5 * 60_000 })
    console.log(`[cron/fiscal-retry] intentados=${result.tried} autorizados=${result.authorized}`)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error('[cron/fiscal-retry]', error)
    return NextResponse.json({ error: 'Error al reintentar comprobantes' }, { status: 500 })
  }
}
