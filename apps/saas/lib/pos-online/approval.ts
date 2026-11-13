import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import User from '@/models/User'
import { logAudit } from '@/lib/audit'
import { rateLimit } from '@/lib/rateLimit'
import { isApproverRole } from '@takeasygo/business'
import { posPinLookup, resolvePosPinPepper } from '@takeasygo/business/pos-pin'
import { PosError } from './errors'
import { resolvePosRole } from './permissions'
import type { PosContext } from './tenantContext'
import { trustedOfflineAt } from './offlineReplay'

// ============================================================================
// Aprobación del encargado (PIN) — Fase 1 de caja (2026-10)
// ============================================================================
// Operaciones que un cajero no puede hacer solo: anular una venta cobrada,
// cancelar un pedido que ya está en cocina, quitar productos ya comandados,
// retirar efectivo. Documentación: ADMIN/VALIDACION_CAJA_IVA_ARCA_2026-10-23.md.
//
// Contrato con el POS (sin pantallas nuevas):
//   1. El POS llama la operación normalmente.
//   2. Si el usuario no es encargado/admin y no mandó PIN → 403
//      `approval_required`. El POS muestra el teclado de PIN y reintenta la
//      MISMA petición con el header `X-Manager-Pin`.
//   3. El PIN se busca por HMAC (posPinLookup, mismo esquema que el login) y
//      se confirma con bcrypt. Tiene que ser de un admin/encargado activo del
//      tenant con acceso a la sede.
//
// Seguridad:
//   · Rate limit por usuario que pide la aprobación (5 intentos / 5 min).
//   · El PIN nunca se loguea; el audit guarda quién aprobó y qué.
//   · Un encargado no se aprueba "a sí mismo" con PIN: si el que opera ya es
//     encargado, la aprobación es implícita y queda su usuario.
//
// Sin internet (POS offline V2, etapa 7, 12/11/2026): el equipo habilitado
// verificó el PIN del encargado en el local (contra el verificador que guardó
// cuando ese encargado entró con internet en ese equipo) y, al reenviar la
// operación, manda `X-Pos-Offline-Approver: <userId>`. Vale SOLO si la
// operación viene de un equipo habilitado (trustedOfflineAt) y ese usuario
// sigue siendo encargado/admin activo con acceso a la sede. Queda en la
// auditoría como aprobación sin internet.
// ============================================================================

export const MANAGER_PIN_HEADER = 'x-manager-pin'
export const OFFLINE_APPROVER_HEADER = 'x-pos-offline-approver'
const ATTEMPTS = 5
const WINDOW_MS = 5 * 60 * 1000

export interface Approval {
  /** id del usuario que aprobó (el mismo operador si ya es encargado). */
  approvedBy: string
  approverName: string | null
  /** true si hizo falta el PIN de otra persona. */
  viaPin: boolean
}

interface ApproverDoc {
  _id: mongoose.Types.ObjectId
  name?: string
  role: string
  pin?: string | null
  assignedLocations?: mongoose.Types.ObjectId[]
}

/**
 * Exige aprobación de encargado para `action`. Devuelve quién aprobó o lanza
 * `approval_required` / `approval_invalid` / `rate_limited`.
 *
 * @param message Texto que ve el cajero arriba del teclado de PIN.
 */
export async function requireManagerApproval(
  ctx: PosContext,
  action: string,
  message: string
): Promise<Approval> {
  if (isApproverRole(resolvePosRole(ctx.user.role))) {
    return { approvedBy: ctx.user.id, approverName: null, viaPin: false }
  }

  const pin = ctx.request.headers.get(MANAGER_PIN_HEADER)?.trim() ?? ''
  const offlineApprover = ctx.request.headers.get(OFFLINE_APPROVER_HEADER)?.trim() ?? ''
  if (!pin && offlineApprover && ctx.offline) return offlineApproval(ctx, action, offlineApprover)
  if (!pin) throw PosError.approvalRequired(message)
  if (!/^\d{4,8}$/.test(pin)) throw PosError.approvalInvalid()

  const limit = await rateLimit(`pos-approval:${ctx.tenantId}:${ctx.user.id}`, ATTEMPTS, WINDOW_MS)
  if (!limit.success) throw PosError.rateLimited()

  const pepper = resolvePosPinPepper(process.env)
  if (!pepper) throw PosError.internal('PIN de POS no configurado en el servidor')

  const approver = (await User.findOne({
    tenantId: new mongoose.Types.ObjectId(ctx.tenantId),
    posPinLookup: posPinLookup(pepper, ctx.tenantId, pin),
    isActive: true,
  })
    .select('+pin name role assignedLocations')
    .lean()) as ApproverDoc | null

  const pinMatches = approver?.pin ? await bcrypt.compare(pin, approver.pin) : false
  const locations = (approver?.assignedLocations ?? []).map(String)
  const atLocation = locations.length === 0 || locations.includes(ctx.locationId)

  if (
    !approver ||
    !pinMatches ||
    !isApproverRole(resolvePosRole(approver.role)) ||
    !atLocation ||
    String(approver._id) === ctx.user.id
  ) {
    await logAudit({
      tenantId: ctx.tenantId,
      action: 'pos.approval.denied',
      entity: 'User',
      entityId: ctx.user.id,
      details: { action },
      request: ctx.request,
      userId: ctx.user.id,
      userRole: ctx.user.role,
    })
    throw PosError.approvalInvalid()
  }

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.approval.granted',
    entity: 'User',
    entityId: String(approver._id),
    details: { action, requestedBy: ctx.user.id },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })

  return { approvedBy: String(approver._id), approverName: approver.name ?? null, viaPin: true }
}

/**
 * Aprobación que el equipo verificó sin internet (ver cabecera). Lanza
 * `approval_invalid` si el equipo no está habilitado o el usuario ya no es
 * encargado de la sede: la operación queda «con conflicto» para revisar.
 */
async function offlineApproval(ctx: PosContext, action: string, approverId: string): Promise<Approval> {
  const trusted = await trustedOfflineAt(ctx)
  const approver = trusted && mongoose.Types.ObjectId.isValid(approverId)
    ? ((await User.findOne({ _id: new mongoose.Types.ObjectId(approverId), tenantId: new mongoose.Types.ObjectId(ctx.tenantId), isActive: true })
        .select('name role assignedLocations')
        .lean()) as ApproverDoc | null)
    : null
  const locations = (approver?.assignedLocations ?? []).map(String)
  const atLocation = locations.length === 0 || locations.includes(ctx.locationId)
  if (!approver || !isApproverRole(resolvePosRole(approver.role)) || !atLocation) {
    await logAudit({
      tenantId: ctx.tenantId,
      action: 'pos.approval.denied',
      entity: 'User',
      entityId: ctx.user.id,
      details: { action, offline: true, deviceId: ctx.offline?.deviceId ?? null, approverId },
      request: ctx.request,
      userId: ctx.user.id,
      userRole: ctx.user.role,
    })
    throw PosError.approvalInvalid()
  }
  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.approval.granted',
    entity: 'User',
    entityId: String(approver._id),
    details: { action, requestedBy: ctx.user.id, offline: true, deviceId: ctx.offline?.deviceId ?? null, occurredAt: ctx.offline?.occurredAt ?? null },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })
  return { approvedBy: String(approver._id), approverName: approver.name ?? null, viaPin: true }
}
