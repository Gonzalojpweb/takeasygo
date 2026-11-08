import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Location from '@/models/Location'
import { logAudit } from '@/lib/audit'
import { parseMenuJson } from '@/lib/provisioning/menu-json'
import { applyMenuJson } from '@/lib/provisioning/menu-apply'
import { provisionContext } from '@/lib/provisioning/http'

// POST /api/superadmin/tenants/[tenantId]/menu-import
// Body: { json: string | object, mode: 'append' | 'replace', locationId?: string, preview?: boolean }
// Superadmin carga la carta pegando el JSON (formato v1). Con preview: true solo valida.
// Sin locationId se aplica a todas las sedes del comercio.
export async function POST(request: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const c = await provisionContext(request)
  if (!c.ok) return c.response
  const { tenantId } = await params
  if (!mongoose.Types.ObjectId.isValid(tenantId)) return NextResponse.json({ error: 'Comercio no encontrado' }, { status: 404 })
  const body = (await request.json().catch(() => ({}))) as { json?: unknown; mode?: unknown; locationId?: unknown; preview?: unknown }
  const parsed = parseMenuJson(body.json)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  if (body.preview === true) return NextResponse.json({ preview: true, stats: parsed.stats, menu: parsed.menu })
  const mode = body.mode === 'replace' ? 'replace' : 'append'
  await connectDB()
  const locationIds = typeof body.locationId === 'string' && mongoose.Types.ObjectId.isValid(body.locationId)
    ? [body.locationId]
    : (await Location.find({ tenantId }).select('_id').lean<{ _id: unknown }[]>()).map(l => String(l._id))
  if (locationIds.length === 0) return NextResponse.json({ error: 'El comercio no tiene sedes' }, { status: 400 })
  try {
    for (const id of locationIds) await applyMenuJson(tenantId, id, parsed.menu, mode)
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500
    if (status === 500) console.error('[menu-import] superadmin', err)
    return NextResponse.json({ error: status === 404 ? 'Sede no encontrada' : 'No se pudo importar la carta' }, { status })
  }
  await logAudit({ tenantId, action: 'menu.imported', entity: 'menu', userId: c.actor.userId, userName: c.actor.name, userRole: 'superadmin', details: { mode, locations: locationIds.length, ...parsed.stats, source: 'superadmin_json' } })
  return NextResponse.json({ ok: true, mode, locations: locationIds.length, stats: parsed.stats })
}
