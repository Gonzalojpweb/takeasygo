/**
 * GET /api/display/manifest — contenido de la pantalla (Bearer tgd_…).
 *
 * Solo piezas de pantalla del comercio del equipo (ver lib/display/manifest.ts).
 * ETag + If-None-Match → 304. Incluye serverTime para corregir la hora del
 * equipo y pollAfterS para el próximo pedido.
 */
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { rateLimit } from '@/lib/rateLimit'
import { deviceFromRequest } from '@/lib/display/auth'
import { buildManifest } from '@/lib/display/manifest'
import { MANIFEST_POLL_S } from '@/lib/display/constants'
import Location from '@/models/Location'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  await connectDB()
  const device = await deviceFromRequest(request)
  if (!device) return NextResponse.json({ error: 'Pantalla no vinculada o revocada' }, { status: 401 })
  const rl = await rateLimit(`display-manifest:${String(device._id)}`, 120, 10 * 60_000)
  if (!rl.success) return NextResponse.json({ error: 'Demasiados pedidos' }, { status: 429 })

  const { items, etag } = await buildManifest(device)
  // Zona horaria de la sede: la franja horaria se evalúa ahí (no en la del equipo).
  const loc = device.locationId ? await Location.findById(device.locationId).select('timezone').lean<{ timezone?: string }>() : null
  const headers = { ETag: etag, 'Cache-Control': 'private, no-cache' }
  if (request.headers.get('if-none-match') === etag) return new NextResponse(null, { status: 304, headers })
  return NextResponse.json({
    version: etag,
    serverTime: new Date().toISOString(),
    pollAfterS: MANIFEST_POLL_S,
    timezone: loc?.timezone || 'America/Argentina/Buenos_Aires',
    device: { name: device.name, orientation: device.orientation },
    items,
  }, { headers })
}
