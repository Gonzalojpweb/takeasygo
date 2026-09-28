import mongoose from 'mongoose'
import type { Table as PosTable, TableStatus } from '@takeasygo/types'
import { PosError } from './errors'

// ============================================================================
// Mapper POS (wire contract) ⇄ SaaS (Table document)
// ============================================================================

export interface PosTableWriteContext {
  tenantId: string
  locationId: string
}

export interface PosTableInput {
  /** posId — UUID generado por el POS. Obligatorio. */
  id: string
  number: number
  capacity: number
  section?: string | null
}

export interface SaasTableDraft {
  posId: string
  tenantId: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  number: number
  capacity: number
  status: TableStatus
  section: string | null
  currentOrderId: string | null
  serverId: string | null
  needsBill: boolean
}

export const TABLE_STATUSES: readonly TableStatus[] = [
  'free',
  'occupied',
  'reserved',
  'closed',
  'needs_attention',
]

function positiveInteger(value: unknown, field: string, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max) {
    throw PosError.validation(`${field} debe ser un entero entre 1 y ${max}`)
  }
  return value
}

/**
 * Mesa nueva creada por el POS (`openTable` en services/table.ts).
 * El server no decide nada más: nace siempre `free`.
 */
export function toSaasTable(input: PosTableInput, ctx: PosTableWriteContext): SaasTableDraft {
  if (!input?.id || typeof input.id !== 'string' || input.id.length > 100) {
    throw PosError.validation('Falta id (posId) de la mesa')
  }
  if (!mongoose.isValidObjectId(ctx.tenantId) || !mongoose.isValidObjectId(ctx.locationId)) {
    throw PosError.validation('tenantId/locationId inválidos')
  }

  const section = input.section ?? null
  if (section !== null && (typeof section !== 'string' || section.length > 100)) {
    throw PosError.validation('section inválida')
  }

  return {
    posId: input.id,
    tenantId: new mongoose.Types.ObjectId(ctx.tenantId),
    locationId: new mongoose.Types.ObjectId(ctx.locationId),
    number: positiveInteger(input.number, 'number', 999),
    capacity: positiveInteger(input.capacity, 'capacity', 999),
    status: 'free',
    section,
    currentOrderId: null,
    serverId: null,
    needsBill: false,
  }
}

/**
 * Documento SaaS → contrato POS.
 * `id = posId`: el POS reconoce sus mesas por el UUID que él mismo generó.
 * `locationId` no viaja: la consulta ya viene acotada a la sede del token.
 */
export function toPosTable(doc: {
  posId?: string | null
  tenantId: mongoose.Types.ObjectId | string
  number: number
  capacity: number
  status: TableStatus
  section?: string | null
  currentOrderId?: string | null
  serverId?: string | null
  needsBill?: boolean
  createdAt: Date
  updatedAt: Date
}): PosTable {
  if (!doc.posId) {
    throw PosError.internal('Mesa sin posId en el read model', 'posId ausente')
  }

  return {
    id: doc.posId,
    tenantId: doc.tenantId.toString(),
    number: doc.number,
    capacity: doc.capacity,
    status: doc.status,
    ...(doc.currentOrderId ? { currentOrderId: doc.currentOrderId } : {}),
    ...(doc.serverId ? { serverId: doc.serverId } : {}),
    ...(doc.section ? { section: doc.section } : {}),
    needsBill: doc.needsBill ?? false,
  }
}
