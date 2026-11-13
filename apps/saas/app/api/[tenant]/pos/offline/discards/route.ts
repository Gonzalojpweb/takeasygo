import { NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { requireManagerApproval } from '@/lib/pos-online/approval'

// ============================================================================
// POST /api/[tenant]/pos/offline/discards — descartar operaciones sin internet
// ============================================================================
// POS offline V2 — etapa 6 (12/11/2026). Una operación hecha sin internet que
// el server rechazó («con conflicto») y las que dependen de ella se pueden
// descartar desde el POS. Es una decisión de un encargado: pide su PIN
// (requireManagerApproval) y queda en la auditoría qué se descartó, desde qué
// equipo, el motivo y el error que había dado el server.
//
// El server no tiene nada que deshacer: esas operaciones nunca se aplicaron
// (un rechazo borra el recibo, ver opReceipt.ts). El POS borra su copia local
// y vuelve a leer del server.
//
// Body: { reason?: string, ops: [{ opId, kind, label, method, path, occurredAt, error? }] }
// ============================================================================

const MAX_OPS = 100

interface DiscardedOp {
  opId: string
  kind: string
  label: string
  method: string
  path: string
  occurredAt: string
  error: string | null
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')

function readOps(raw: unknown): DiscardedOp[] {
  if (!Array.isArray(raw) || raw.length === 0) throw PosError.validation('Faltan las operaciones a descartar')
  if (raw.length > MAX_OPS) throw PosError.validation(`Se pueden descartar hasta ${MAX_OPS} operaciones por vez`)
  return raw.map((r) => {
    const o = (r ?? {}) as Record<string, unknown>
    const opId = str(o.opId, 64)
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(opId)) throw PosError.validation('opId inválido')
    return {
      opId,
      kind: str(o.kind, 40),
      label: str(o.label, 160),
      method: str(o.method, 10),
      path: str(o.path, 200),
      occurredAt: str(o.occurredAt, 40),
      error: str(o.error, 300) || null,
    }
  })
}

export const POST = posRoute('tables.service', async (ctx) => {
  const body = await readPosBody<{ reason?: unknown; ops?: unknown }>(ctx.request)
  const ops = readOps(body.ops)
  const reason = str(body.reason, 200).trim()
  const approval = await requireManagerApproval(
    ctx,
    'pos.offline.discard',
    `Descartar ${ops.length === 1 ? 'una operación hecha' : `${ops.length} operaciones hechas`} sin internet necesita la aprobación de un encargado`
  )
  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.offline.ops_discarded',
    entity: 'location',
    entityId: ctx.locationId,
    details: {
      deviceId: ctx.request.headers.get('x-pos-device-id')?.slice(0, 64) ?? null,
      reason: reason || null,
      approvedBy: approval.approvedBy,
      viaPin: approval.viaPin,
      ops,
    },
    userId: ctx.user.id,
    userRole: ctx.user.role,
    request: ctx.request,
  })
  return NextResponse.json({ discarded: ops.length, approvedBy: approval.approvedBy, approverName: approval.approverName })
})
