/**
 * POST /api/display/stats — reproducciones y tiempo en pantalla (lote cada ~15 min).
 *
 * Valida valores físicamente imposibles y descarta el lote entero si los hay
 * (422). Lotes repetidos se ignoran. Ver lib/display/stats.ts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { rateLimit } from '@/lib/rateLimit'
import { deviceFromRequest } from '@/lib/display/auth'
import { statsBatchSchema, ingestScreenStats } from '@/lib/display/stats'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  await connectDB()
  const device = await deviceFromRequest(request)
  if (!device) return NextResponse.json({ error: 'Pantalla no vinculada o revocada' }, { status: 401 })
  const rl = await rateLimit(`display-stats:${String(device._id)}`, 30, 10 * 60_000)
  if (!rl.success) return NextResponse.json({ error: 'Demasiados pedidos' }, { status: 429 })
  const parsed = statsBatchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Lote inválido' }, { status: 400 })
  try {
    const r = await ingestScreenStats(device, parsed.data)
    if (!r.ok) return NextResponse.json({ error: `Lote descartado: ${r.reason}` }, { status: 422 })
    return NextResponse.json(r)
  } catch (e) {
    console.error('[display/stats]', (e as Error)?.message)
    return NextResponse.json({ error: 'No se pudo registrar' }, { status: 500 })
  }
}
