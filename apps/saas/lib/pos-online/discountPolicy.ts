import mongoose from 'mongoose'
import {
  DEFAULT_DISCOUNT_POLICY,
  normalizeDiscountPolicy,
  policyInForceAt,
  type DiscountPolicy,
} from '@takeasygo/business'
import PosDiscountPolicy, { HISTORY_LIMIT } from '@/models/PosDiscountPolicy'

// ============================================================================
// Lectura y guardado de la política de descuentos del comercio
// ============================================================================
// Las reglas: @takeasygo/business/discount-policy. Esto solo persiste.
//   · Sin documento ⇒ versión 0 = DEFAULT_DISCOUNT_POLICY (Fase D).
//   · Lo leído siempre pasa por normalizeDiscountPolicy (nunca se confía en
//     lo guardado tal cual).
//   · Guardar es optimista por `version`: dos admins guardando a la vez no se
//     pisan en silencio (el segundo recibe conflicto y recarga).
// ============================================================================

export interface LoadedDiscountPolicy {
  version: number
  policy: DiscountPolicy
  updatedAt: Date | null
  updatedBy: string | null
}

interface PolicyDoc {
  version: number
  policy: unknown
  updatedAt?: Date
  updatedBy?: string | null
  history?: { version: number; policy: unknown; validFrom: Date }[]
}

function oid(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(id)
}

export async function loadDiscountPolicy(tenantId: string): Promise<LoadedDiscountPolicy> {
  const doc = await PosDiscountPolicy.findOne({ tenantId: oid(tenantId) })
    .select('version policy updatedAt updatedBy')
    .lean<PolicyDoc>()
  if (!doc) return { version: 0, policy: normalizeDiscountPolicy(DEFAULT_DISCOUNT_POLICY), updatedAt: null, updatedBy: null }
  return { version: doc.version, policy: normalizeDiscountPolicy(doc.policy), updatedAt: doc.updatedAt ?? null, updatedBy: doc.updatedBy ?? null }
}

/**
 * Política que regía en `at` (operación hecha sin internet). null si no hay
 * historial que cubra ese momento (se usa solo la vigente).
 */
export async function loadDiscountPolicyAt(tenantId: string, at: Date): Promise<{ version: number; policy: DiscountPolicy } | null> {
  const doc = await PosDiscountPolicy.findOne({ tenantId: oid(tenantId) })
    .select('version policy createdAt history')
    .lean<PolicyDoc & { createdAt?: Date }>()
  if (!doc) return { version: 0, policy: normalizeDiscountPolicy(DEFAULT_DISCOUNT_POLICY) }
  const versions = (doc.history ?? []).map((h) => ({ version: h.version, policy: normalizeDiscountPolicy(h.policy), validFrom: h.validFrom }))
  // Antes de la primera versión guardada regía la de fábrica.
  if (doc.createdAt) versions.push({ version: 0, policy: normalizeDiscountPolicy(DEFAULT_DISCOUNT_POLICY), validFrom: new Date(0) })
  const found = policyInForceAt(versions, at)
  return found ? { version: found.version, policy: found.policy } : null
}

export class PolicyVersionConflict extends Error {}

/**
 * Guarda una política ya validada (validateDiscountPolicyInput). `expectedVersion`
 * es la versión que el admin estaba viendo.
 */
export async function saveDiscountPolicy(
  tenantId: string,
  policy: DiscountPolicy,
  expectedVersion: number,
  userId: string
): Promise<LoadedDiscountPolicy> {
  const now = new Date()
  const entry = { version: expectedVersion + 1, policy, validFrom: now, updatedBy: userId }
  if (expectedVersion === 0) {
    try {
      await PosDiscountPolicy.create({ tenantId: oid(tenantId), version: 1, policy, updatedBy: userId, history: [entry] })
    } catch (err) {
      if ((err as { code?: number }).code === 11000) throw new PolicyVersionConflict('La política cambió mientras la editabas')
      throw err
    }
  } else {
    const res = await PosDiscountPolicy.updateOne(
      { tenantId: oid(tenantId), version: expectedVersion },
      {
        $set: { policy, version: expectedVersion + 1, updatedBy: userId },
        $push: { history: { $each: [entry], $slice: -HISTORY_LIMIT } },
      }
    )
    if (res.matchedCount === 0) throw new PolicyVersionConflict('La política cambió mientras la editabas')
  }
  return { version: expectedVersion + 1, policy, updatedAt: now, updatedBy: userId }
}
