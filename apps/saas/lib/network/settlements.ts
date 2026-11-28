// ============================================================================
// Liquidaciones semanales y control de deuda de la red (etapa 6)
// ============================================================================
// Informe 21/11/2026, §4.4, §4.5 y §10:
//   · generateSettlements: por cada comercio receptor, suma los movimientos
//     del libro aún no liquidados hasta el fin de la semana y emite la
//     liquidación (idempotente: un movimiento entra en una sola liquidación).
//   · recordSettlementPayment: el superadmin registra lo que transfirió el
//     comercio (conciliación en el historial de pagos).
//   · evaluateDebt: si la deuda vencida supera el umbral del acuerdo vigente,
//     se suspende SOLO la recepción de beneficios nuevos (nunca el POS, las
//     ventas ni el SaaS) y se avisa al comercio; al bajar del umbral, una
//     suspensión automática por deuda se levanta sola. Una suspensión puesta
//     a mano por el superadmin no se toca.
// Semanas de lunes a lunes, hora de Argentina (UTC−3).
// ============================================================================

import mongoose from 'mongoose'
import NetworkLedgerEntry from '@/models/NetworkLedgerEntry'
import NetworkSettlement from '@/models/NetworkSettlement'
import NetworkSettlementLine from '@/models/NetworkSettlementLine'
import NetworkMember from '@/models/NetworkMember'
import NetworkAgreement from '@/models/NetworkAgreement'
import { resolveAgreement, isOverDebtThreshold } from './rules'

export class SettlementError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
    this.name = 'SettlementError'
  }
}

/** Quién suspende automáticamente por deuda (para no pisar suspensiones manuales). */
export const AUTO_DEBT_ACTOR = 'Sistema (deuda)'
const AR_OFFSET_MS = 3 * 3_600_000

/** Semana (lunes 00:00 hora Argentina) que contiene la fecha. */
export function weekBounds(at: Date): { start: Date; end: Date } {
  const local = new Date(at.getTime() - AR_OFFSET_MS)
  const day = local.getUTCDay() // 0 = domingo
  const diff = (day + 6) % 7 // días desde el lunes
  const mondayLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - diff)
  const start = new Date(mondayLocal + AR_OFFSET_MS)
  return { start, end: new Date(start.getTime() + 7 * 86_400_000) }
}

/** Semana anterior a la actual (la que se liquida normalmente). */
export function previousWeek(now = new Date()): { start: Date; end: Date } {
  const current = weekBounds(now)
  return weekBounds(new Date(current.start.getTime() - 1))
}

export interface GenerateResult { settlements: number; entries: number; receivers: string[] }

/**
 * Emite las liquidaciones de una semana: incluye los movimientos todavía no
 * liquidados creados ANTES del fin de esa semana (lo atrasado entra también).
 */
export async function generateSettlements(input: { periodStart: Date; actorName: string; now?: Date }): Promise<GenerateResult> {
  const { start, end } = weekBounds(input.periodStart)
  const now = input.now ?? new Date()
  if (end.getTime() > now.getTime()) throw new SettlementError(400, 'week_not_closed', 'La semana todavía no terminó: se liquida a partir del lunes siguiente')

  const settledIds = await NetworkSettlementLine.distinct('ledgerEntryId')
  const pending = await NetworkLedgerEntry.find({ createdAt: { $lt: end }, _id: { $nin: settledIds } })
    .select('_id receiverTenantId commissionCents').lean<Array<{ _id: mongoose.Types.ObjectId; receiverTenantId: mongoose.Types.ObjectId; commissionCents: number }>>()
  const byReceiver = new Map<string, typeof pending>()
  for (const e of pending) {
    const k = String(e.receiverTenantId)
    byReceiver.set(k, [...(byReceiver.get(k) ?? []), e])
  }

  const out: GenerateResult = { settlements: 0, entries: 0, receivers: [] }
  for (const [receiverId, entries] of byReceiver) {
    let settlement = await NetworkSettlement.findOne({ receiverTenantId: receiverId, periodStart: start })
    if (settlement) continue // ya emitida: lo que llegó tarde entra en la próxima
    try {
      settlement = await NetworkSettlement.create({
        receiverTenantId: receiverId, periodStart: start, periodEnd: end, status: 'issued',
        entries: 0, commissionCents: 0, autoCollectedCents: 0, dueCents: 0, paidCents: 0,
        issuedAt: now, createdBy: input.actorName,
      })
    } catch (err) {
      if ((err as { code?: number })?.code === 11000) continue // otra generación en curso
      throw err
    }
    // Líneas: el índice único por movimiento descarta los ya liquidados.
    const inserted: typeof entries = []
    for (const e of entries) {
      try {
        await NetworkSettlementLine.create({ ledgerEntryId: e._id, settlementId: settlement._id, receiverTenantId: receiverId, commissionCents: e.commissionCents })
        inserted.push(e)
      } catch (err) {
        if ((err as { code?: number })?.code !== 11000) throw err
      }
    }
    if (inserted.length === 0) {
      await NetworkSettlement.deleteOne({ _id: settlement._id })
      continue
    }
    const commissionCents = inserted.reduce((s, e) => s + e.commissionCents, 0)
    const dueCents = Math.max(0, commissionCents)
    await NetworkSettlement.updateOne({ _id: settlement._id }, {
      $set: { entries: inserted.length, commissionCents, dueCents, status: dueCents === 0 ? 'paid' : 'issued', paidAt: dueCents === 0 ? now : null },
    })
    out.settlements++
    out.entries += inserted.length
    out.receivers.push(receiverId)
    await evaluateDebt(receiverId, now)
  }
  return out
}

/** Registra un pago (transferencia o efectivo) de una liquidación. */
export async function recordSettlementPayment(input: { settlementId: string; amountCents: unknown; method: unknown; reference?: unknown; actorName: string; now?: Date }) {
  if (!mongoose.isValidObjectId(input.settlementId)) throw new SettlementError(400, 'invalid_id', 'Liquidación inválida')
  const amount = typeof input.amountCents === 'number' && Number.isInteger(input.amountCents) ? input.amountCents : NaN
  if (!(amount > 0)) throw new SettlementError(400, 'invalid_amount', 'Ingresá el importe recibido')
  const method = input.method === 'cash' || input.method === 'other' ? input.method : input.method === 'transfer' ? 'transfer' : null
  if (!method) throw new SettlementError(400, 'invalid_method', 'Elegí cómo se recibió el pago')
  const reference = typeof input.reference === 'string' ? input.reference.trim().slice(0, 120) : ''
  const now = input.now ?? new Date()

  const s = await NetworkSettlement.findById(input.settlementId)
  if (!s) throw new SettlementError(404, 'not_found', 'No encontramos la liquidación')
  if (s.status === 'paid' || s.status === 'void') throw new SettlementError(409, 'already_closed', 'La liquidación ya está cerrada')
  const remaining = s.dueCents - s.paidCents
  if (amount > remaining) throw new SettlementError(400, 'overpayment', `El importe supera lo adeudado ($${(remaining / 100).toLocaleString('es-AR')})`)

  s.payments.push({ at: now, amountCents: amount, method, reference, recordedBy: input.actorName })
  s.paidCents += amount
  s.status = s.paidCents >= s.dueCents ? 'paid' : 'partially_paid'
  if (s.status === 'paid') s.paidAt = now
  await s.save()
  await evaluateDebt(String(s.receiverTenantId), now)
  return s
}

/** Deuda vencida del comercio: lo emitido y todavía no pagado. */
export async function outstandingDebt(receiverTenantId: string): Promise<number> {
  const rows = await NetworkSettlement.aggregate([
    { $match: { receiverTenantId: new mongoose.Types.ObjectId(receiverTenantId), status: { $in: ['issued', 'partially_paid'] } } },
    { $group: { _id: null, due: { $sum: { $subtract: ['$dueCents', '$paidCents'] } } } },
  ])
  return rows[0]?.due ?? 0
}

/** Comisiones devengadas que todavía no entraron en una liquidación. */
export async function accruedUnsettled(receiverTenantId: string): Promise<number> {
  const settledIds = await NetworkSettlementLine.distinct('ledgerEntryId', { receiverTenantId })
  const rows = await NetworkLedgerEntry.aggregate([
    { $match: { receiverTenantId: new mongoose.Types.ObjectId(receiverTenantId), _id: { $nin: settledIds } } },
    { $group: { _id: null, c: { $sum: '$commissionCents' } } },
  ])
  return rows[0]?.c ?? 0
}

async function announce(tenantId: string, title: string, content: string) {
  try {
    const { default: SystemAnnouncement } = await import('@/models/SystemAnnouncement')
    await SystemAnnouncement.create({
      title, content, type: 'alert', status: 'published', publishedAt: new Date(),
      targetPlans: [], targetTenantIds: [tenantId], readBy: [], acceptances: [], requiresConsent: false,
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    })
  } catch (e) {
    console.warn('[network/settlements] aviso falló:', e instanceof Error ? e.message : e)
  }
}

/**
 * Control de deuda (§4.5). Devuelve qué hizo: 'suspended', 'resumed' o null.
 * El umbral sale del acuerdo vigente del comercio (sin acuerdo, no actúa).
 */
export async function evaluateDebt(receiverTenantId: string, now = new Date()): Promise<'suspended' | 'resumed' | null> {
  const member = await NetworkMember.findOne({ tenantId: receiverTenantId })
  if (!member) return null
  const agreements = await NetworkAgreement.find({ receiverTenantId, scope: 'receiver' }).lean<any[]>()
  const agreement = resolveAgreement(agreements, { at: now })
  if (!agreement) return null
  const debt = await outstandingDebt(receiverTenantId)
  const pesos = (c: number) => `$${(c / 100).toLocaleString('es-AR')}`

  if (isOverDebtThreshold(debt, agreement.debtThresholdCents)) {
    if (member.receiverSuspension) return null // ya suspendido (a mano o por deuda)
    const note = `Deuda de comisiones de ${pesos(debt)} supera el límite de ${pesos(agreement.debtThresholdCents)}`
    member.receiverSuspension = { at: now, by: AUTO_DEBT_ACTOR, reason: 'debt', note }
    member.history.push({ at: now, by: AUTO_DEBT_ACTOR, action: 'suspend_receiving', note })
    await member.save()
    await announce(receiverTenantId, 'Tu comercio dejó de recibir beneficios nuevos de la red',
      `${note}. Tu POS, tus ventas y tu panel siguen funcionando normalmente. Cuando regularices el pago, volvés a recibir clientes de la red.`)
    return 'suspended'
  }
  if (member.receiverSuspension?.reason === 'debt' && member.receiverSuspension.by === AUTO_DEBT_ACTOR) {
    member.receiverSuspension = null
    member.history.push({ at: now, by: AUTO_DEBT_ACTOR, action: 'resume_receiving', note: 'Deuda regularizada' })
    await member.save()
    await announce(receiverTenantId, 'Volviste a recibir beneficios de la red', 'Regularizaste las comisiones pendientes: tu comercio vuelve a recibir clientes de la red TakeasyGO.')
    return 'resumed'
  }
  return null
}

/** Liquidaciones del propio comercio + saldo (cuenta corriente). */
export async function receiverSettlements(receiverTenantId: string) {
  const [settlements, debt, accrued] = await Promise.all([
    NetworkSettlement.find({ receiverTenantId }).sort({ periodStart: -1 }).limit(60).lean<any[]>(),
    outstandingDebt(receiverTenantId),
    accruedUnsettled(receiverTenantId),
  ])
  return {
    debtCents: debt,
    accruedCents: accrued,
    settlements: settlements.map(s => ({
      id: String(s._id), periodStart: s.periodStart, periodEnd: s.periodEnd, status: s.status, entries: s.entries,
      commissionCents: s.commissionCents, autoCollectedCents: s.autoCollectedCents, dueCents: s.dueCents, paidCents: s.paidCents,
      payments: (s.payments ?? []).map((p: any) => ({ at: p.at, amountCents: p.amountCents, method: p.method, reference: p.reference })),
    })),
  }
}

/** Todas las liquidaciones + deuda por comercio (superadmin). */
export async function superadminSettlements() {
  const settlements = await NetworkSettlement.find().sort({ periodStart: -1, receiverTenantId: 1 }).limit(500).lean<any[]>()
  const receivers = [...new Set(settlements.map(s => String(s.receiverTenantId)))]
  const debts = Object.fromEntries(await Promise.all(receivers.map(async r => [r, await outstandingDebt(r)] as const)))
  return {
    debts,
    settlements: settlements.map(s => ({
      id: String(s._id), receiverTenantId: String(s.receiverTenantId), periodStart: s.periodStart, periodEnd: s.periodEnd,
      status: s.status, entries: s.entries, commissionCents: s.commissionCents, autoCollectedCents: s.autoCollectedCents,
      dueCents: s.dueCents, paidCents: s.paidCents, payments: s.payments ?? [],
    })),
  }
}

/** Estado de liquidación de cada movimiento: pendiente, liquidado o pagado. */
export async function settlementStatusOf(entryIds: unknown[]): Promise<Map<string, 'pending' | 'settled' | 'paid'>> {
  const lines = await NetworkSettlementLine.find({ ledgerEntryId: { $in: entryIds } }).select('ledgerEntryId settlementId').lean<any[]>()
  const settlements = await NetworkSettlement.find({ _id: { $in: lines.map(l => l.settlementId) } }).select('status').lean<any[]>()
  const statusOf = new Map(settlements.map(s => [String(s._id), s.status]))
  const out = new Map<string, 'pending' | 'settled' | 'paid'>()
  for (const l of lines) out.set(String(l.ledgerEntryId), statusOf.get(String(l.settlementId)) === 'paid' ? 'paid' : 'settled')
  return out
}

/** Cobrado (pagos registrados + cobro automático) para los totales del superadmin. */
export async function collectedTotal(): Promise<number> {
  const rows = await NetworkSettlement.aggregate([{ $group: { _id: null, paid: { $sum: '$paidCents' }, auto: { $sum: '$autoCollectedCents' } } }])
  return (rows[0]?.paid ?? 0) + (rows[0]?.auto ?? 0)
}
