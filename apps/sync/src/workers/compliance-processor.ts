import mongoose from "mongoose"
import {
  ComplianceConfigModel,
  ComplianceAlertModel,
  DEFAULT_SLA_RULES,
} from "@takeasygo/db"

/** Estados terminales — si la orden llega aquí, no se crea alerta */
const TERMINAL_STATUSES = new Set(["delivered", "cancelled"])

export interface ComplianceJobData {
  tenantId: string
  locationId: string
  orderId: string
  orderNumber: string
  fromStatus: string
  toStatus: string
  orderMode: string
  level: 1 | 2 | 3
}

export interface ComplianceJobResult {
  status: string
  [key: string]: unknown
}

export type ComplianceEmitter = (event: {
  type: "compliance:alert" | "compliance:escalated"
  orderId: string
  orderNumber: string
  level: number
  fromStatus?: string
  toStatus?: string
  elapsedMinutes?: number
  fromLevel?: number
}) => void | Promise<void>

/**
 * Procesa un job de compliance re-verificando SIEMPRE el estado real en DB:
 *
 *  1. Re-check de estado: la orden sigue en fromStatus? (no avanzó ni es terminal)
 *  2. Re-check de config: SLA habilitado? (pilotMode bloquea L3)
 *  3. Re-check de nivel real: elapsed >= umbral del nivel del job?
 *  4. Dedup: ya existe alerta activa con nivel >= al del job?
 *
 * Usado por el worker BullMQ y testeable de forma aislada.
 */
export async function processComplianceJob(
  data: ComplianceJobData,
  emit: ComplianceEmitter
): Promise<ComplianceJobResult> {
  const { tenantId, locationId, orderId, orderNumber, fromStatus, toStatus, orderMode, level } = data

  const db = mongoose.connection.db!
  const orders = db.collection("orders")

  // tenantId llega como string desde BullMQ; en orders es ObjectId
  const tenantIdFilter = mongoose.Types.ObjectId.isValid(tenantId)
    ? new mongoose.Types.ObjectId(tenantId)
    : tenantId

  // ── Salvaguarda 1a: la orden existe? ──────────────────────────────────
  const order = await orders.findOne(
    { _id: new mongoose.Types.ObjectId(orderId), tenantId: tenantIdFilter },
    { projection: { status: 1, statusTimestamps: 1, orderMode: 1, locationId: 1 } }
  )

  if (!order) {
    return { status: "skipped_not_found" }
  }

  // ── Salvaguarda 1b: estado terminal ───────────────────────────────────
  if (TERMINAL_STATUSES.has(order.status)) {
    return { status: "skipped_terminal", currentStatus: order.status }
  }

  // ── Salvaguarda 1c: la orden avanzó desde fromStatus → el SLA de esa
  // transición ya no aplica (el job es un safety net si el cancel falló) ──
  if (order.status !== fromStatus) {
    return {
      status: "skipped_status_advanced",
      currentStatus: order.status,
      expectedStatus: fromStatus,
    }
  }

  // ── Salvaguarda 2: config SLA ─────────────────────────────────────────
  const config = await ComplianceConfigModel.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    $or: [
      { locationId: new mongoose.Types.ObjectId(locationId) },
      { locationId: null },
    ],
  }).sort({ locationId: -1 })

  if (!config || !config.enabled) {
    return { status: "skipped_disabled" }
  }

  if (config.pilotMode && level === 3) {
    return { status: "skipped_pilot_no_l3" }
  }

  // ── Evaluar SLA real ──────────────────────────────────────────────────
  const rule = findMatchingRule(
    config.slaRules,
    order.orderMode || orderMode,
    fromStatus,
    toStatus
  )
  if (!rule) {
    return { status: "skipped_no_rule" }
  }

  const elapsedMinutes = getElapsedMinutes(order.statusTimestamps, fromStatus)
  if (elapsedMinutes === null) {
    return { status: "skipped_no_timestamp" }
  }

  const actualLevel = calculateLevel(elapsedMinutes, rule)
  if (actualLevel < level) {
    return { status: "skipped_level_not_reached", actualLevel, expectedLevel: level }
  }

  // ── Salvaguarda 3: dedup contra alerta existente ──────────────────────
  const activeAlert = await ComplianceAlertModel.findOne({
    orderId: new mongoose.Types.ObjectId(orderId),
    resolvedAt: null,
  })

  if (activeAlert && activeAlert.level >= level) {
    return { status: "skipped_duplicate", existingLevel: activeAlert.level }
  }

  // ── Crear o escalar alerta ────────────────────────────────────────────
  const now = new Date()

  if (activeAlert) {
    if (level > activeAlert.level) {
      const fromLevel = activeAlert.level
      activeAlert.level = level as 1 | 2 | 3
      await activeAlert.save()

      await emit({
        type: "compliance:escalated",
        orderId,
        orderNumber,
        level,
        fromLevel,
      })

      return { status: "escalated", level, elapsedMinutes }
    }
    return { status: "no_change" }
  }

  await ComplianceAlertModel.create({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    locationId: new mongoose.Types.ObjectId(locationId),
    orderId: new mongoose.Types.ObjectId(orderId),
    orderNumber,
    fromStatus,
    toStatus,
    level,
    lastNotifiedLevel: null,
    triggeredAt: now,
    clientConfirmed: false,
  })

  await emit({
    type: "compliance:alert",
    orderId,
    orderNumber,
    level,
    fromStatus,
    toStatus,
    elapsedMinutes,
  })

  return { status: "alert_created", level, elapsedMinutes }
}

// ── Helpers (exportados para unit tests) ─────────────────────────────────────

export function findMatchingRule(
  rules: Array<{
    fromStatus: string
    toStatus: string
    orderMode: string
    level1Minutes: number
    level2Minutes: number
    level3Minutes: number
  }>,
  orderMode: string,
  fromStatus: string,
  toStatus: string
) {
  const matches = (r: { fromStatus: string; toStatus: string }) =>
    r.fromStatus === fromStatus && r.toStatus === toStatus

  return (
    // 1) regla específica del modo en la config del tenant
    rules.find((r) => matches(r) && r.orderMode === orderMode) ??
    // 2) regla "all" en la config del tenant
    rules.find((r) => matches(r) && r.orderMode === "all") ??
    // 3) fallback: defaults globales, específico del modo
    DEFAULT_SLA_RULES.find((r) => matches(r) && r.orderMode === orderMode) ??
    // 4) fallback: defaults globales "all"
    DEFAULT_SLA_RULES.find((r) => matches(r) && r.orderMode === "all")
  )
}

export function getElapsedMinutes(
  statusTimestamps: Record<string, any> | undefined,
  fromStatus: string
): number | null {
  if (!statusTimestamps) return null

  const tsField = TIMESTAMP_FIELDS[fromStatus]
  if (!tsField) return null

  const timestamp = statusTimestamps[tsField]
  if (!timestamp) return null

  const elapsed = Date.now() - new Date(timestamp).getTime()
  return Math.max(0, elapsed / 60_000)
}

export const TIMESTAMP_FIELDS: Record<string, string> = {
  pending: "createdAt",
  confirmed: "confirmedAt",
  preparing: "preparingAt",
  ready: "readyAt",
  en_ruta: "enRutaAt",
  arrived: "arrivedAt",
}

export function calculateLevel(
  elapsedMinutes: number,
  rule: { level1Minutes: number; level2Minutes: number; level3Minutes: number }
): 0 | 1 | 2 | 3 {
  if (elapsedMinutes >= rule.level3Minutes) return 3
  if (elapsedMinutes >= rule.level2Minutes) return 2
  if (elapsedMinutes >= rule.level1Minutes) return 1
  return 0
}
