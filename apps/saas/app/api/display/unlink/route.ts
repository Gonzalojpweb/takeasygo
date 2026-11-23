/**
 * POST /api/display/unlink — la propia pantalla se desvincula (Bearer tgd_…).
 *
 * Desde el panel discreto del reproductor, con confirmación en pantalla.
 * Mismo efecto que «Desvincular» en el panel del comercio: el token deja de
 * servir y el equipo vuelve a mostrar un código. Queda en la auditoría.
 */
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { rateLimit } from '@/lib/rateLimit'
import { logAudit } from '@/lib/audit'
import DisplayDevice from '@/models/DisplayDevice'
import { deviceFromRequest } from '@/lib/display/auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  await connectDB()
  const device = await deviceFromRequest(request)
  // Ya revocada o token inválido: para la pantalla es lo mismo (vuelve a vincularse).
  if (!device) return NextResponse.json({ ok: true, alreadyUnlinked: true })
  const rl = await rateLimit(`display-unlink:${String(device._id)}`, 5, 10 * 60_000)
  if (!rl.success) return NextResponse.json({ error: 'Demasiados pedidos' }, { status: 429 })
  await DisplayDevice.updateOne(
    { _id: device._id, status: 'active' },
    { $set: { status: 'revoked', tokenHash: null, revokedAt: new Date(), revokedBy: null } },
  )
  logAudit({ tenantId: String(device.tenantId), action: 'display.revoked', entity: 'displayDevice', details: { deviceId: String(device._id), name: device.name, from: 'device' }, userId: null, userName: `Pantalla «${device.name}»`, userRole: 'display' })
  // Sin `request`: la auditoría guardaría la IP del equipo en claro.
  return NextResponse.json({ ok: true })
}
