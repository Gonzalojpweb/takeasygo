/**
 * POST /api/placements/track — métricas de stories y promociones (público).
 *
 * Lote anónimo de hasta 20 eventos: { sid, events: [...] }. Valida cada
 * evento contra la base (pieza, comercio, sede) y suma contadores diarios en
 * PlacementDailyStat. La IP se usa SOLO como clave del límite de pedidos; no
 * se guarda. La sesión solo alimenta el hash de deduplicación (PlacementSeen).
 * Ver lib/placements/ingest.ts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { rateLimit } from '@/lib/rateLimit'
import { placementBatchSchema, ingestPlacementEvents } from '@/lib/placements/ingest'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const { success } = await rateLimit(`placements:${ip}`, 120, 60_000)
    if (!success) return NextResponse.json({ error: 'Demasiados pedidos' }, { status: 429 })

    const raw = await request.json().catch(() => null)
    const parsed = placementBatchSchema.safeParse(raw)
    if (!parsed.success) return NextResponse.json({ error: 'Lote inválido' }, { status: 400 })

    await connectDB()
    const result = await ingestPlacementEvents(parsed.data.sid, parsed.data.events)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error('[placements/track]', (error as Error)?.message)
    return NextResponse.json({ error: 'No se pudo registrar' }, { status: 500 })
  }
}
