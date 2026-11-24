/**
 * GET /api/display/manifest — contenido de la pantalla (Bearer tgd_…).
 *
 * Solo piezas de pantalla del comercio del equipo (ver lib/display/manifest.ts).
 * ETag + If-None-Match → 304 (o, con ?no304=1, un 200 «sin cambios»: Vercel
 * le saca el encabezado CORS a los 304 y el navegador del equipo los rechaza).
 * Incluye serverTime para corregir la hora del
 * equipo y pollAfterS para el próximo pedido.
 * Sin plan Élite: { paused: 'plan', items: [] } (pausa sin borrar).
 */
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { rateLimit } from '@/lib/rateLimit'
import { deviceFromRequest } from '@/lib/display/auth'
import { buildManifest, pendingCommand } from '@/lib/display/manifest'
import { MANIFEST_POLL_S } from '@/lib/display/constants'
import Location from '@/models/Location'
import { tenantScreensAllowed } from '@/lib/display/plan'
import Tenant from '@/models/Tenant'
import { orderUrlFor } from '@/lib/display/attribution'

export const dynamic = 'force-dynamic'

/**
 * Sin cambios: 304 para equipos viejos; 200 chico con notModified para los
 * nuevos (?no304=1). Un 304 llega sin Access-Control-Allow-Origin (Vercel lo
 * quita) y el equipo lo toma como «sin internet».
 */
function notModified(request: NextRequest, etag: string, headers: Record<string, string>) {
  if (request.nextUrl.searchParams.get('no304') !== '1') return new NextResponse(null, { status: 304, headers })
  return NextResponse.json({ notModified: true, version: etag, serverTime: new Date().toISOString(), pollAfterS: MANIFEST_POLL_S }, { headers })
}

export async function GET(request: NextRequest) {
  await connectDB()
  const device = await deviceFromRequest(request)
  if (!device) return NextResponse.json({ error: 'Pantalla no vinculada o revocada' }, { status: 401 })
  const rl = await rateLimit(`display-manifest:${String(device._id)}`, 120, 10 * 60_000)
  if (!rl.success) return NextResponse.json({ error: 'Demasiados pedidos' }, { status: 429 })

  // Sin plan Élite: pausa (sin contenido, sin borrar nada). La pantalla sigue
  // vinculada y muestra «en pausa»; al volver a Élite sigue sola.
  if (!(await tenantScreensAllowed(device.tenantId))) {
    const pausedEtag = 'W/"paused-plan"'
    const headers = { ETag: pausedEtag, 'Cache-Control': 'private, no-cache' }
    if (request.headers.get('if-none-match') === pausedEtag) return notModified(request, pausedEtag, headers)
    return NextResponse.json({
      version: pausedEtag,
      serverTime: new Date().toISOString(),
      pollAfterS: MANIFEST_POLL_S,
      timezone: 'America/Argentina/Buenos_Aires',
      device: { name: device.name, orientation: device.orientation },
      paused: 'plan',
      items: [],
    }, { headers })
  }

  const { items, etag } = await buildManifest(device)
  // Zona horaria de la sede: la franja horaria se evalúa ahí (no en la del equipo).
  const [loc, tenantDoc] = await Promise.all([
    device.locationId ? Location.findById(device.locationId).select('timezone slug').lean<{ _id: unknown; timezone?: string; slug?: string }>() : null,
    Tenant.findById(String(device.tenantId)).select('slug').lean<{ slug?: string }>(),
  ])
  // QR «Pedí desde tu celular»: menú de la sede con origen propio de ESTA pantalla.
  const orderUrl = tenantDoc?.slug && loc ? orderUrlFor(tenantDoc.slug, loc, String(device._id)) : null
  const headers = { ETag: etag, 'Cache-Control': 'private, no-cache' }
  if (request.headers.get('if-none-match') === etag) return notModified(request, etag, headers)
  return NextResponse.json({
    version: etag,
    serverTime: new Date().toISOString(),
    pollAfterS: MANIFEST_POLL_S,
    timezone: loc?.timezone || 'America/Argentina/Buenos_Aires',
    device: { name: device.name, orientation: device.orientation },
    orderUrl,
    command: pendingCommand(device),
    items,
  }, { headers })
}
