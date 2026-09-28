import type {
  CashChannel,
  CashMovement,
  CashMovementType,
  CashRegister,
  PaymentMethod,
  ZReport,
} from '@takeasygo/types'
import {
  POSITIVE_CASH_TYPES,
  NEGATIVE_CASH_TYPES,
  cashExpectedDelta,
} from '@takeasygo/business'
import { PosError } from './errors'

// ============================================================================
// cashMapper — contrato de caja (centavos enteros, sin conversión)
// ============================================================================
// Reglas de dominio que este archivo NO reimplementa:
//   §1    arqueo: cashExpectedDelta() de @takeasygo/business
//   §2.1  idempotencia de movimientos (registerId, relatedOrderId, type)
//   §3    zReport = snapshot inmutable generado una sola vez al cerrar
//   §2.3  defaultForChannel (routing multi-caja)
//
// El wire del POS expone `CashRegister.movements` embebido; acá es solo una
// vista armada al leer. La persistencia vive en la colección CashMovement.
// ============================================================================

/** Todos los tipos de movimiento válidos (positivos ∪ negativos). */
export const ALL_CASH_MOVEMENT_TYPES: readonly CashMovementType[] = [
  ...POSITIVE_CASH_TYPES,
  ...NEGATIVE_CASH_TYPES,
]

export const CASH_CHANNELS: readonly CashChannel[] = ['counter', 'takeasygo']

export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'cash',
  'mercadopago',
  'posnet_debit',
  'posnet_credit',
  'kripton',
  'transfer',
]

/**
 * Documento mínimo que el read model de caja necesita.
 *
 * Interfaces explícitas (no `Parameters<typeof f>[0]`): el mapper y el tipo
 * se referencian mutuamente y TypeScript detecta circularidad.
 */
export interface PosRegisterDoc {
  _id: unknown
  posId: string
  tenantId: unknown
  locationId: unknown
  openedBy: string
  openedAt: Date
  closedBy?: string | null
  closedAt?: Date | null
  initialAmount: number
  finalAmount?: number | null
  expectedAmount: number
  difference?: number | null
  status: 'open' | 'closed'
  defaultForChannel: CashChannel | null
  zReport?: Record<string, unknown> | null
  shareToken?: string | null
}

export interface PosMovementDoc {
  posId: string
  type: CashMovementType
  amount: number
  reason: string
  userId: string
  timestamp: Date
  relatedOrderId?: string | null
  channel: CashChannel
  paymentMethod: PaymentMethod
}

/**
 * Firma de la APERTURA: lo que define el hecho "abrí esta caja".
 *
 * `openedBy` queda fuera a propósito: es metadata derivada (rol del token si
 * el POS no manda nombre) y variarla en un reintento no cambia el hecho.
 */
export function registerSignature(register: {
  initialAmount?: number
  defaultForChannel?: CashChannel | null
}): string {
  return JSON.stringify([
    register.initialAmount ?? null,
    register.defaultForChannel ?? null,
  ])
}

/** Monto en centavos: entero seguro, ≥ `min`. */
export function assertCents(value: unknown, field: string, min = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) {
    throw PosError.validation(
      `${field} debe ser un entero en centavos${min > 0 ? ` ≥ ${min}` : ''}`
    )
  }
  return value
}

export function assertEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw PosError.validation(`${field} inválido`)
  }
  return value as T
}

// ---------------------------------------------------------------------------
// Wire → server
// ---------------------------------------------------------------------------

export interface PosRegisterInput {
  id: string
  initialAmount: number
  openedBy?: string
  defaultForChannel?: CashChannel | null
}

export interface SaasRegisterDraft {
  posId: string
  tenantId: string
  locationId: string
  openedBy: string
  openedAt: Date
  initialAmount: number
  expectedAmount: number
  status: 'open'
  defaultForChannel: CashChannel | null
}

export function toSaasRegister(
  input: PosRegisterInput,
  scope: { tenantId: string; locationId: string; user: { id: string; role: string } }
): SaasRegisterDraft {
  const initialAmount = assertCents(input.initialAmount, 'initialAmount')

  const defaultForChannel =
    input.defaultForChannel === undefined || input.defaultForChannel === null
      ? null
      : assertEnum(input.defaultForChannel, CASH_CHANNELS, 'defaultForChannel')

  // Quién abrió: nombre/rol visible del operador, no un id opaco.
  const openedBy =
    typeof input.openedBy === 'string' && input.openedBy.trim()
      ? input.openedBy.trim().slice(0, 120)
      : `${scope.user.role} (${scope.user.id})`

  return {
    posId: input.id,
    tenantId: scope.tenantId,
    locationId: scope.locationId,
    openedBy,
    openedAt: new Date(),
    initialAmount,
    // §1 — el arqueo de apertura es el efectivo inicial.
    expectedAmount: initialAmount,
    status: 'open',
    defaultForChannel,
  }
}

// ---------------------------------------------------------------------------
// Server → wire
// ---------------------------------------------------------------------------

export function toPosMovement(doc: PosMovementDoc): CashMovement {
  const movement: CashMovement = {
    id: doc.posId,
    type: doc.type,
    amount: doc.amount,
    reason: doc.reason,
    userId: doc.userId,
    timestamp: doc.timestamp,
    channel: doc.channel,
    paymentMethod: doc.paymentMethod,
  }
  if (doc.relatedOrderId) movement.relatedOrderId = doc.relatedOrderId
  return movement
}

export function toPosRegister(
  doc: PosRegisterDoc,
  movements: CashMovement[]
): CashRegister {
  const register: CashRegister = {
    id: doc.posId,
    tenantId: String(doc.tenantId),
    openedBy: doc.openedBy,
    openedAt: doc.openedAt,
    initialAmount: doc.initialAmount,
    movements,
    status: doc.status,
    defaultForChannel: doc.defaultForChannel,
  }
  if (doc.closedBy) register.closedBy = doc.closedBy
  if (doc.closedAt) register.closedAt = doc.closedAt
  if (doc.finalAmount !== null && doc.finalAmount !== undefined) {
    register.finalAmount = doc.finalAmount
  }
  register.expectedAmount = doc.expectedAmount
  if (doc.difference !== null && doc.difference !== undefined) {
    register.difference = doc.difference
  }
  if (doc.zReport) register.zReport = doc.zReport as unknown as ZReport
  if (doc.shareToken) register.shareToken = doc.shareToken
  return register
}

/**
 * Arqueo esperado recalculado desde los movimientos reales.
 *
 * El valor denormalizado `expectedAmount` se mantiene con `$inc` en cada
 * escritura, pero al CERRAR se recalcula desde la fuente de verdad: si alguna
 * escritura se cayó a mitad de camino, el Z nunca hereda la deriva.
 */
export function recomputeExpectedAmount(
  initialAmount: number,
  movements: readonly Pick<CashMovement, 'type' | 'paymentMethod' | 'amount'>[]
): number {
  return movements.reduce(
    (total, m) => total + cashExpectedDelta(m.type, m.paymentMethod, m.amount),
    initialAmount
  )
}
