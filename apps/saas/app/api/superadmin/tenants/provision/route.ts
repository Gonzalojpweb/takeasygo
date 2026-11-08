import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { rateLimit } from '@/lib/rateLimit'
import { provisionTenant } from '@/lib/provisioning/provision'
import { appBaseUrl, provisionContext, provisionErrorResponse } from '@/lib/provisioning/http'

export const maxDuration = 60

// POST /api/superadmin/tenants/provision — alta rápida de un comercio.
// Crea comercio (aprobado), sedes, menú, identidad, dueño invitado y, si se pide,
// la organización. Todo o nada (secuencia con deshacer). Solo Superadmin.
export async function POST(request: NextRequest) {
  const c = await provisionContext(request)
  if (!c.ok) return c.response
  try {
    const limit = await rateLimit(`provision:${c.actor.userId ?? 'superadmin'}`, 30, 60 * 60_000)
    if (!limit.success) return NextResponse.json({ error: 'Demasiadas altas seguidas. Esperá unos minutos.' }, { status: 429 })
    const body = await request.json().catch(() => null)
    await connectDB()
    const result = await provisionTenant(body, c.actor, { appUrl: appBaseUrl(request) })
    return NextResponse.json(result, { status: result.reused ? 200 : 201 })
  } catch (err) {
    return provisionErrorResponse(err, 'provision')
  }
}
