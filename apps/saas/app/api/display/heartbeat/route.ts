/**
 * POST /api/display/heartbeat — latido de la pantalla (cada ~5 min).
 *
 * Estado técnico que manda el propio equipo: versión, manifiesto puesto,
 * resolución, caché y último error (saneado). Sin IP ni user agent.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { connectDB } from '@/lib/mongoose'
import { rateLimit } from '@/lib/rateLimit'
import DisplayDevice from '@/models/DisplayDevice'
import { deviceFromRequest } from '@/lib/display/auth'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  appVersion: z.string().max(40).optional(),
  manifestVersion: z.string().max(80).nullable().optional(),
  screen: z.object({ width: z.number().int().min(0).max(20000), height: z.number().int().min(0).max(20000) }).nullable().optional(),
  cache: z.object({
    items: z.number().int().min(0).max(100000),
    bytes: z.number().min(0),
    quotaBytes: z.number().min(0),
    persisted: z.boolean(),
  }).nullable().optional(),
  commandAck: z.string().regex(/^[a-f0-9]{16}$/).nullable().optional(),
  lastError: z.object({ code: z.string().regex(/^[A-Za-z0-9_.-]{1,40}$/), message: z.string().max(500), at: z.string().datetime().optional() }).nullable().optional(),
})

/** Mensaje de error sin URLs con parámetros ni tokens. */
function sanitize(msg: string): string {
  return msg.replace(/tgd_[a-f0-9]+/gi, 'tgd_…').replace(/https?:\/\/\S+/g, (u) => u.split('?')[0]).slice(0, 200)
}

export async function POST(request: NextRequest) {
  await connectDB()
  const device = await deviceFromRequest(request)
  if (!device) return NextResponse.json({ error: 'Pantalla no vinculada o revocada' }, { status: 401 })
  const rl = await rateLimit(`display-heartbeat:${String(device._id)}`, 30, 10 * 60_000)
  if (!rl.success) return NextResponse.json({ error: 'Demasiados pedidos' }, { status: 429 })
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Latido inválido' }, { status: 400 })
  const b = parsed.data
  const set: Record<string, unknown> = { lastSeenAt: new Date() }
  if (b.appVersion !== undefined) set.appVersion = b.appVersion
  if (b.manifestVersion !== undefined) set.manifestVersion = b.manifestVersion
  if (b.screen !== undefined) set.screen = b.screen
  if (b.cache !== undefined) set.cache = b.cache
  if (b.commandAck) set.commandAckId = b.commandAck
  if (b.lastError !== undefined) {
    set.lastError = b.lastError ? { code: b.lastError.code, message: sanitize(b.lastError.message), at: b.lastError.at ? new Date(b.lastError.at) : new Date() } : null
  }
  await DisplayDevice.updateOne({ _id: device._id, status: 'active' }, { $set: set })
  return NextResponse.json({ ok: true, serverTime: new Date().toISOString() })
}
