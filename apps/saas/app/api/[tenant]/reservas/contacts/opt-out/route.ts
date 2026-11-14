import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import Reservation from '@/models/Reservation'
import { logAudit } from '@/lib/audit'
import { safeDecrypt } from '@/lib/crypto'
import { reservationsAdminContext } from '@/lib/reservations/admin-access'
import { customerKey } from '@/lib/reservations/report'

// ============================================================================
// POST /api/[tenant]/reservas/contacts/opt-out { key } — baja de promos
// ============================================================================
// El cliente pidió no recibir más novedades: se le quita el permiso en TODAS
// sus reservas del comercio (alcance de sede del usuario). Si vuelve a
// reservar y tilda la casilla, el permiso vuelve (es su decisión).
// Administrador y encargado. Queda en la auditoría.
// ============================================================================

const KEY_RE = /^(t:\d{6,10}|e:[^\s@]{1,64}@[^\s@]{1,190})$/

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  const ctx = await reservationsAdminContext(request, tenant, ['admin', 'manager'])
  if (ctx instanceof NextResponse) return ctx
  const body = (await request.json().catch(() => null)) as { key?: unknown } | null
  const key = typeof body?.key === 'string' ? body.key.trim() : ''
  if (!KEY_RE.test(key)) return NextResponse.json({ error: 'Cliente inválido' }, { status: 400 })

  const match: Record<string, unknown> = { tenantId: new mongoose.Types.ObjectId(ctx.tenantId), marketingOptIn: true }
  if (ctx.scopeLocationIds) match.locationId = { $in: ctx.scopeLocationIds.map((id) => new mongoose.Types.ObjectId(id)) }
  const docs = await Reservation.find(match).select('phone email').limit(50000).lean<{ _id: mongoose.Types.ObjectId; phone: string; email?: string }[]>()
  const ids = docs.filter((d) => customerKey(safeDecrypt(d.phone) ?? '', (d.email ?? '').trim()) === key).map((d) => d._id)
  if (ids.length > 0) await Reservation.updateMany({ _id: { $in: ids } }, { $set: { marketingOptIn: false } })

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'reservations.contacts.opt_out',
    entity: 'Reservation',
    entityId: ctx.tenantId,
    details: { reservations: ids.length },
    request,
    userId: ctx.userId,
    userRole: ctx.role,
  })
  return NextResponse.json({ updated: ids.length })
}
