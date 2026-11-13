import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import PosOpReceipt from '@/models/PosOpReceipt'
import { PosError } from './errors'

// ============================================================================
// Operaciones del POS offline: una operación se aplica UNA sola vez
// ============================================================================
// POS offline V2 (12/11/2026). El equipo sin internet reenvía cada operación
// al volver la red con estos headers:
//
//   X-Pos-Op-Id        UUID de la operación (obligatorio para deduplicar)
//   X-Pos-Occurred-At  ISO del momento real en que pasó (en el local)
//   X-Pos-Device-Id    equipo que la hizo
//   X-Pos-Printed      ids de impresoras donde el equipo ya imprimió por la
//                      red local (etapa 4): el server no vuelve a mandarles
//                      esa comanda
//   X-Pos-Offline-Approver  encargado que aprobó con su PIN sin internet
//                      (etapa 7, ver approval.ts)
//
// posRoute envuelve el handler con `withOpReceipt`: el primer envío reserva el
// recibo (pending), corre el handler y guarda la respuesta 2xx (done). Un
// reenvío del mismo opId devuelve la respuesta guardada sin volver a aplicar.
// Un 4xx/5xx o una excepción borran el recibo: nada se aplicó y se puede
// reintentar (por ejemplo, un 409 «caja cerrada» que se resuelve abriendo la
// caja).
// ============================================================================

export const OP_ID_RE = /^[A-Za-z0-9_-]{8,64}$/

/** Un reenvío «en curso» más viejo que esto se considera abandonado. */
const STALE_PENDING_MS = 2 * 60 * 1000

/** Una operación offline puede llegar hasta 7 días después (equipo apagado). */
const MAX_OCCURRED_AGE_MS = 7 * 24 * 60 * 60 * 1000

export interface OfflineOpContext {
  opId: string
  deviceId: string | null
  /** Momento real (validado: no futuro, no más viejo que 7 días). */
  occurredAt: Date | null
  /** Impresoras donde el equipo ya imprimió sin internet (X-Pos-Printed). */
  printedPrinterIds: string[]
}

/** Lee y valida los headers de una operación offline. null = petición online normal. */
export function readOfflineOp(request: Request): OfflineOpContext | null {
  const opId = request.headers.get('x-pos-op-id')?.trim()
  if (!opId) return null
  if (!OP_ID_RE.test(opId)) throw PosError.validation('X-Pos-Op-Id inválido')

  const deviceRaw = request.headers.get('x-pos-device-id')?.trim() || null
  const deviceId = deviceRaw && OP_ID_RE.test(deviceRaw) ? deviceRaw : null

  let occurredAt: Date | null = null
  const occurredRaw = request.headers.get('x-pos-occurred-at')?.trim()
  if (occurredRaw) {
    const d = new Date(occurredRaw)
    const now = Date.now()
    // Reloj del equipo adelantado (hasta 5 min) se tolera; más, se ignora.
    if (!Number.isNaN(d.getTime()) && d.getTime() <= now + 5 * 60 * 1000 && now - d.getTime() <= MAX_OCCURRED_AGE_MS) {
      occurredAt = new Date(Math.min(d.getTime(), now))
    }
  }
  const printedPrinterIds = (request.headers.get('x-pos-printed') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => mongoose.Types.ObjectId.isValid(s) && /^[a-f0-9]{24}$/i.test(s))
    .slice(0, 20)
  return { opId, deviceId, occurredAt, printedPrinterIds }
}

function replay(status: number, body: unknown): NextResponse {
  const headers = { 'X-Pos-Op-Replayed': '1' }
  if (status === 204 || body === null || body === undefined) return new NextResponse(null, { status, headers })
  return NextResponse.json(body, { status, headers })
}

/**
 * Corre `run` una sola vez por (tenant, opId). Ver cabecera del módulo.
 */
export async function withOpReceipt(
  tenantId: string,
  request: Request,
  op: OfflineOpContext,
  run: () => Promise<NextResponse>
): Promise<NextResponse> {
  const tenantOid = new mongoose.Types.ObjectId(tenantId)
  const path = (() => {
    try { return new URL(request.url).pathname.slice(0, 300) } catch { return '' }
  })()

  // 1) Reservar el recibo.
  let reserved = false
  try {
    await PosOpReceipt.create({
      tenantId: tenantOid,
      opId: op.opId,
      deviceId: op.deviceId,
      method: request.method,
      path,
      status: 'pending',
      occurredAt: op.occurredAt,
    })
    reserved = true
  } catch (err) {
    if ((err as { code?: number })?.code !== 11000) throw err
  }

  if (!reserved) {
    const existing = await PosOpReceipt.findOne({ tenantId: tenantOid, opId: op.opId }).lean()
    if (existing?.status === 'done') return replay(existing.responseStatus ?? 200, existing.responseBody)
    // Pendiente: otro envío la está aplicando… salvo que esté abandonado.
    const takeover = await PosOpReceipt.findOneAndUpdate(
      { tenantId: tenantOid, opId: op.opId, status: 'pending', updatedAt: { $lt: new Date(Date.now() - STALE_PENDING_MS) } },
      { $set: { updatedAt: new Date() } },
      { new: true }
    )
    if (!takeover) {
      if (!existing) {
        // Se borró entre medio (el otro envío falló): que el equipo reintente.
        throw PosError.conflict('La operación se está reintentando; volvé a enviarla en unos segundos')
      }
      throw PosError.conflict('La operación se está aplicando; reintentá en unos segundos')
    }
  }

  // 2) Aplicar.
  let response: NextResponse
  try {
    response = await run()
  } catch (err) {
    await PosOpReceipt.deleteOne({ tenantId: tenantOid, opId: op.opId, status: 'pending' }).catch(() => {})
    throw err
  }

  // 3) Guardar solo el éxito; cualquier otra cosa libera el recibo.
  if (response.status >= 200 && response.status < 300) {
    let body: unknown = null
    try {
      body = response.status === 204 ? null : await response.clone().json()
    } catch {
      body = null
    }
    await PosOpReceipt.updateOne(
      { tenantId: tenantOid, opId: op.opId },
      { $set: { status: 'done', responseStatus: response.status, responseBody: body } }
    ).catch((e) => console.error('[opReceipt] no se pudo guardar el recibo:', e))
  } else {
    await PosOpReceipt.deleteOne({ tenantId: tenantOid, opId: op.opId, status: 'pending' }).catch(() => {})
  }
  return response
}
