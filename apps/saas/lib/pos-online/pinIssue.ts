import { randomInt } from 'node:crypto'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { posPinLookup, resolvePosPinPepper, validateNewPosPin } from '@takeasygo/business/pos-pin'
import User from '@/models/User'
import PosCredential from '@/models/PosCredential'

// ============================================================================
// Emisión de PIN de POS — una sola implementación (panel web y POS)
// ============================================================================
// El PIN lo GENERA el server (6 dígitos, no trivial, único en el tenant) y se
// devuelve UNA vez. Nadie lo elige: si se pudiera elegir, «ese PIN ya está en
// uso» sería un oráculo para descubrir el PIN de otra persona.
// Guardado: bcrypt en `pin` + HMAC en `posPinLookup` (business/pos-pin).
// ============================================================================

export const POS_PIN_LENGTH = 6
const MAX_GENERATION_ATTEMPTS = 8

export type PinIssueResult =
  | { ok: true; pin: string; updatedAt: Date }
  | { ok: false; reason: 'no_pepper' | 'collision' }

function generatePin(): string {
  for (;;) {
    const pin = String(randomInt(0, 10 ** POS_PIN_LENGTH)).padStart(POS_PIN_LENGTH, '0')
    if (validateNewPosPin(pin) === null) return pin
  }
}

function isDuplicateLookup(error: unknown): boolean {
  const e = error as { code?: number; keyPattern?: Record<string, unknown> }
  return e?.code === 11000 && Boolean(e.keyPattern && 'posPinLookup' in e.keyPattern)
}

export async function issuePosPin(tenantId: string, userId: unknown): Promise<PinIssueResult> {
  const pepper = resolvePosPinPepper(process.env)
  if (!pepper) {
    console.error('[pos-pin] sin POS_PIN_PEPPER ni secreto interno: no se pueden emitir PINs')
    return { ok: false, reason: 'no_pepper' }
  }
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const pin = generatePin()
    const lookup = posPinLookup(pepper, tenantId, pin)
    // Multi-marca (D6): tampoco puede coincidir con el PIN de un miembro del grupo en esta marca.
    if (await PosCredential.exists({ tenantId: new mongoose.Types.ObjectId(tenantId), posPinLookup: lookup })) continue
    try {
      const updatedAt = new Date()
      await User.updateOne(
        { _id: new mongoose.Types.ObjectId(String(userId)), tenantId: new mongoose.Types.ObjectId(tenantId) },
        { $set: { pin: await bcrypt.hash(pin, 10), posPinLookup: lookup, posPinUpdatedAt: updatedAt } }
      )
      return { ok: true, pin, updatedAt }
    } catch (error) {
      if (isDuplicateLookup(error)) continue // colisión con otro PIN del tenant: otro número
      throw error
    }
  }
  return { ok: false, reason: 'collision' }
}

/**
 * PIN del POS de un miembro de organización en una marca (multi-marca D6).
 * Mismas reglas que el de un empleado: lo genera el server, 6 dígitos, se
 * muestra UNA vez y no puede coincidir con ningún otro PIN de la marca (ni
 * de empleados ni de otros miembros). Reemplaza el anterior si existía.
 */
export async function issueMemberPosPin(tenantId: string, userId: string): Promise<PinIssueResult> {
  const pepper = resolvePosPinPepper(process.env)
  if (!pepper) {
    console.error('[pos-pin] sin POS_PIN_PEPPER ni secreto interno: no se pueden emitir PINs')
    return { ok: false, reason: 'no_pepper' }
  }
  const tid = new mongoose.Types.ObjectId(tenantId)
  const uid = new mongoose.Types.ObjectId(userId)
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const pin = generatePin()
    const lookup = posPinLookup(pepper, tenantId, pin)
    if (await User.exists({ tenantId: tid, posPinLookup: lookup })) continue
    try {
      const updatedAt = new Date()
      await PosCredential.updateOne(
        { tenantId: tid, userId: uid },
        { $set: { pin: await bcrypt.hash(pin, 10), posPinLookup: lookup } },
        { upsert: true }
      )
      return { ok: true, pin, updatedAt }
    } catch (error) {
      const e = error as { code?: number; keyPattern?: Record<string, unknown> }
      if (e?.code === 11000 && e.keyPattern && 'posPinLookup' in e.keyPattern) continue
      throw error
    }
  }
  return { ok: false, reason: 'collision' }
}
