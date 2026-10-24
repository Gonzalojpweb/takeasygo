import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import CashRegister from '@/models/CashRegister'
import { generateZReport, sumDenominations } from '@takeasygo/business'
import type { CashClosingCount, CashDenominationCount, CashRegister as PosCashRegister } from '@takeasygo/types'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody, requireFields } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import {
  assertCents,
  recomputeExpectedAmount,
  toPosMovement,
  toPosRegister,
  type PosRegisterDoc,
} from '@/lib/pos-online/cashMapper'
import { findPosRegister, loadMovementsForRegister } from '@/lib/pos-online/cashRepo'
import { operatorName } from '@/lib/pos-online/operator'
import { fiscalSummaryForShift } from '@/lib/fiscal/shift-summary'
import { enqueueZPrint, type ZPrintRegister } from '@/lib/cash/z-print'

// ============================================================================
// POST /api/[tenant]/pos/cash/registers/[id]/close — cierra y genera el Z
// ============================================================================
// Consenso v1 §3: el ZReport se genera UNA VEZ y es un snapshot inmutable.
// PDF, impresión y vista web leen exclusivamente de `register.zReport`.
//
// Consenso v1 §1: el arqueo esperado se RECALCULA desde los movimientos
// reales antes de cerrar. `expectedAmount` denormalizado sirve para la vista
// en vivo; el número que entra al Z es el de la fuente de verdad.
//
// Cierre ciego (Fase 1, 2026-10): el cajero declara el conteo por billete
// (`closingCount: { bills: [{ value, count }], coins }`, centavos) sin ver el
// esperado. El total lo calcula el server; si además viene `finalAmount`
// tiene que coincidir. Sin `closingCount` se acepta `finalAmount` solo
// (compatibilidad con POS anteriores).
// ============================================================================

/** Valida el conteo por billete y devuelve el conteo con su total. */
function parseClosingCount(raw: unknown): CashClosingCount | null {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'object' || Array.isArray(raw)) throw PosError.validation('closingCount inválido')
  const { bills, coins } = raw as { bills?: unknown; coins?: unknown }
  if (!Array.isArray(bills) || bills.length > 20) throw PosError.validation('closingCount.bills inválido')
  const rows: CashDenominationCount[] = bills.map((b) => {
    const row = (b ?? {}) as { value?: unknown; count?: unknown }
    return { value: Number(row.value), count: Number(row.count) }
  })
  const coinsCents = coins === undefined || coins === null ? 0 : assertCents(coins, 'closingCount.coins')
  let total: number
  try {
    total = sumDenominations(rows, coinsCents)
  } catch (err) {
    throw PosError.validation(err instanceof Error ? err.message : 'Conteo inválido')
  }
  return { bills: rows.filter((r) => r.count > 0), coins: coinsCents, total }
}

export const POST = posRoute<{ tenant: string; id: string }>('cash.write', async (ctx, params) => {
  const body = await readPosBody(ctx.request)
  const raw = requireFields(body, [])
  const closingCount = parseClosingCount(raw.closingCount)
  if (!closingCount && (raw.finalAmount === undefined || raw.finalAmount === null)) {
    throw PosError.validation('Campo requerido: finalAmount')
  }
  const finalAmount = closingCount
    ? closingCount.total
    : assertCents(raw.finalAmount, 'finalAmount')
  if (closingCount && raw.finalAmount !== undefined && raw.finalAmount !== null && raw.finalAmount !== closingCount.total) {
    throw PosError.validation('El total no coincide con el conteo por billete')
  }

  const register = await findPosRegister(ctx, params.id)
  if (register.status !== 'open') {
    throw PosError.conflict('La caja ya está cerrada')
  }

  // Fase 2: quién cerró sale del usuario del token (el body es respaldo).
  const closedBy = await operatorName(ctx, typeof raw.closedBy === 'string' ? raw.closedBy : null)

  const movementDocs = await loadMovementsForRegister(register._id)
  const movements = movementDocs.map(toPosMovement)

  const base = toPosRegister(register, movements)
  const expectedAmount = recomputeExpectedAmount(base.initialAmount, movements)
  const difference = finalAmount - expectedAmount
  const closedAt = new Date()

  const closedRegister: PosCashRegister = {
    ...base,
    status: 'closed',
    finalAmount,
    expectedAmount,
    difference,
    closedBy,
    closedAt,
    closingCount,
  }

  const zReport = generateZReport({ register: closedRegister, movements, closedBy })
  // Fase 5: comprobantes electrónicos emitidos durante el turno, en la sede.
  zReport.fiscal = await fiscalSummaryForShift({
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
    from: register.openedAt,
    to: closedAt,
  })
  const shareToken = randomUUID()

  // Guard con `status: 'open'` en el filtro: dos cierres simultáneos no
  // pueden generar dos Z distintos para la misma caja.
  const result = await CashRegister.updateOne(
    { _id: register._id as mongoose.Types.ObjectId, status: 'open' },
    {
      $set: {
        status: 'closed',
        finalAmount,
        expectedAmount,
        difference,
        closedBy,
        closedByUserId: ctx.user.id,
        closedAt,
        zReport: zReport as unknown as Record<string, unknown>,
        shareToken,
        closingCount,
      },
    }
  )

  if (result.matchedCount === 0) {
    throw PosError.conflict('La caja ya está cerrada')
  }

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.cash.register.close',
    entity: 'CashRegister',
    entityId: String(register._id),
    details: {
      posId: register.posId,
      finalAmount,
      expectedAmount,
      difference,
      movements: movements.length,
      blindCount: Boolean(closingCount),
    },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })

  const updated = await CashRegister.findOne({
    _id: register._id as mongoose.Types.ObjectId,
  })
    .lean()
    .exec()
  if (!updated) throw PosError.notFound('Caja no encontrada')

  // Fase 2: el Z sale impreso en la impresora de caja de la sede (si hay).
  // Nunca corta el cierre: sin impresora o con error, el POS ofrece reimprimir.
  let print: { ok: boolean; printerName?: string; reason?: string }
  try {
    const result = await enqueueZPrint(updated as unknown as ZPrintRegister)
    print = result.ok ? { ok: true, printerName: result.printerName } : { ok: false, reason: result.reason }
  } catch (err) {
    console.error('[pos/cash/close] no se pudo encolar la impresión del Z:', err)
    print = { ok: false, reason: 'error' }
  }

  return NextResponse.json({
    register: toPosRegister(updated as unknown as PosRegisterDoc, movements),
    print,
    serverTime: new Date().toISOString(),
  })
})
