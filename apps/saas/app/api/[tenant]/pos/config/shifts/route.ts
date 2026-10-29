import { NextResponse } from 'next/server'
import { validateShifts } from '@takeasygo/business'
import Location from '@/models/Location'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody, requireFields } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { loadShifts } from '@/lib/pos-online/cashShifts'

// ============================================================================
// /api/[tenant]/pos/config/shifts — Configuración › Turnos (Fase 2)
// ============================================================================
// GET (admin y encargado): turnos de la sede.
// PUT { shifts: [{ id?, name, start, end, active }] } (solo admin): reemplaza
//   la lista. Sin superposiciones entre turnos activos; hasta 8 por sede.
// Las cajas ya abiertas o cerradas conservan el nombre de su turno.
// ============================================================================

export const GET = posRoute('config.manage', async (ctx) => {
  const { shifts, timezone } = await loadShifts(ctx)
  return NextResponse.json({ shifts, timezone })
})

export const PUT = posRoute('config.admin', async (ctx) => {
  const body = await readPosBody(ctx.request)
  requireFields(body, ['shifts'])
  const v = validateShifts(body.shifts)
  if (!v.ok) throw PosError.validation(v.error)
  const res = await Location.updateOne({ _id: ctx.locationId, tenantId: ctx.tenantId }, { $set: { cashShifts: v.shifts } }, { runValidators: true })
  if (res.matchedCount === 0) throw PosError.notFound('Sede no encontrada')
  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.config.shifts.update',
    entity: 'Location',
    entityId: ctx.locationId,
    details: { shifts: v.shifts.map((s) => `${s.name} ${s.start}-${s.end}${s.active ? '' : ' (inactivo)'}`) },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })
  const { shifts, timezone } = await loadShifts(ctx)
  return NextResponse.json({ shifts, timezone })
})
