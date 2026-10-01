/**
 * lib/compliance-alerts.ts
 *
 * Resolución de alertas de compliance (SLA por sede).
 *
 * Una alerta dejó de ser vigente cuando la orden alcanzó (o superó) el estado
 * objetivo `toStatus`, cuando el flujo terminó (`delivered` / `cancelled`) o
 * cuando la orden ya no existe. Antes de este módulo nada escribía `resolvedAt`,
 * por lo que las alertas vivían para siempre en `compliance_alerts` y el banner
 * del admin volvía aunque el pedido se hubiera atendido completo.
 *
 * Los helpers de `findStaleAlerts` para abajo son puros (sin mongoose) para que
 * sean testeables sin base de datos; las funciones `resolve*` importan el modelo
 * de forma diferida.
 */

import type { Types } from 'mongoose'

/** Estados en orden del flujo de un pedido, del más temprano al más tardío. */
export const STATUS_CHAIN = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'en_ruta',
  'arrived',
  'delivered',
] as const

/** Estados que cierran el flujo: no queda nada por monitorear. */
export const TERMINAL_STATUSES = ['delivered', 'cancelled'] as const

const CHAIN_INDEX = new Map<string, number>(STATUS_CHAIN.map((s, i) => [s, i]))

/** Posición en la cadena de estados, o `-1` si no pertenece (ej. `awaiting_payment`). */
export function statusIndex(status: string | null | undefined): number {
  if (!status) return -1
  return CHAIN_INDEX.get(status) ?? -1
}

export function isTerminalStatus(status: string | null | undefined): boolean {
  if (!status) return false
  return (TERMINAL_STATUSES as readonly string[]).includes(status)
}

/**
 * ¿La orden ya llegó (o pasó de) `targetStatus`?
 * Un estado fuera de la cadena nunca da por cumplido el objetivo; `cancelled`
 * sí cierra cualquier alerta porque el pedido ya no se va a mover más.
 */
export function orderReachedTarget(
  currentStatus: string | null | undefined,
  targetStatus: string
): boolean {
  if (!currentStatus) return false
  if (currentStatus === 'cancelled') return true

  const current = statusIndex(currentStatus)
  const target = statusIndex(targetStatus)
  if (current < 0 || target < 0) return false
  return current >= target
}

/**
 * Decisión de resolver una alerta con la orden observada.
 * `null` / `undefined` = la orden no existe (purga o id inválido) → se resuelve,
 * no tiene sentido seguir monitoreando algo que no está.
 */
export function isAlertStale(
  orderStatus: string | null | undefined,
  targetStatus: string
): boolean {
  if (orderStatus === null || orderStatus === undefined || orderStatus === '') return true
  return orderReachedTarget(orderStatus, targetStatus)
}

export interface AlertLike {
  _id: unknown
  orderId: unknown
  toStatus: string
}

/**
 * Filtra las alertas que ya no corresponde mantener abiertas.
 * `statusById` mapea `orderId.toString()` → `status` de la orden; si la clave no
 * está, la orden se consideró borrada y la alerta queda resuelta.
 */
export function findStaleAlerts<T extends AlertLike>(
  alerts: T[],
  statusById: Map<string, string>
): T[] {
  return alerts.filter((alert) =>
    isAlertStale(statusById.get(String(alert.orderId)), alert.toStatus)
  )
}

export type AlertResolver = 'admin' | 'client' | 'system'
export type AlertResolution = 'status_change' | 'justified' | 'postponed'

/**
 * Marca alertas como resueltas. Sólo toca documentos aún abiertos
 * (`resolvedAt: null`) para que sea idempotente ante llamadas concurrentes.
 */
export async function resolveAlerts(
  ids: unknown[],
  meta: { resolvedBy: AlertResolver; resolution: AlertResolution }
): Promise<number> {
  if (!ids.length) return 0
  const { ComplianceAlertModel } = await import('@takeasygo/db/models/compliance-alert')
  const result = await ComplianceAlertModel.updateMany(
    { _id: { $in: ids as Types.ObjectId[] }, resolvedAt: null },
    {
      $set: {
        resolvedAt: new Date(),
        resolvedBy: meta.resolvedBy,
        resolution: meta.resolution,
      },
    }
  )
  return result.modifiedCount ?? 0
}

/**
 * Resuelve las alertas abiertas de una orden que ya cumplieron su objetivo.
 * Se llama al cambiar el estado desde el panel para no acumular filas viejas
 * (el reconcile al leer `/compliance/status` cubre el resto de los caminos:
 * POS, SyncLayer, pagos, cancelaciones).
 */
export async function resolveOrderAlerts(
  orderId: unknown,
  currentStatus: string
): Promise<number> {
  const { ComplianceAlertModel } = await import('@takeasygo/db/models/compliance-alert')
  const open = await ComplianceAlertModel.find({ orderId: orderId as Types.ObjectId, resolvedAt: null })
    .select('_id orderId toStatus')
    .lean()

  const stale = findStaleAlerts(
    open as unknown as Array<AlertLike & { _id: unknown }>,
    new Map([[String(orderId), currentStatus]])
  )
  if (!stale.length) return 0

  return resolveAlerts(
    stale.map((a) => a._id),
    { resolvedBy: 'system', resolution: 'status_change' }
  )
}
