import mongoose from 'mongoose'
import LoyaltyMember from '@/models/LoyaltyMember'
import StoreRedemption from '@/models/StoreRedemption'
import StoreItem from '@/models/StoreItem'
import { hashPhone } from '@/lib/crypto'
import { expireStoreRedemption } from '@/lib/store-redemptions'
import { PosError } from './errors'
import type { PosContext } from './tenantContext'

// ============================================================================
// Clientes › Club en el POS (Fase 4, 29/10/2026)
// ============================================================================
// El socio se busca por celular (se compara el hash, nunca el número). El
// POS ve nombre, puntos, nivel y los canjes pendientes de esta sede, pero
// NUNCA el código del canje: lo trae el cliente y se valida al entregar.
// Entregar es condicional (pending → claimed): dos cajas a la vez no
// entregan el mismo premio dos veces.
// ============================================================================

interface MemberLean {
  _id: mongoose.Types.ObjectId
  name: string
  locationId?: mongoose.Types.ObjectId | null
  loyalty?: { points?: number; tier?: string }
  isActive?: boolean
}

function memberFilter(ctx: Pick<PosContext, 'tenantId' | 'locationId'>, phoneHash: string) {
  return {
    tenantId: new mongoose.Types.ObjectId(ctx.tenantId),
    phoneHash,
    $or: [{ locationId: new mongoose.Types.ObjectId(ctx.locationId) }, { locationId: null }, { locationId: { $exists: false } }],
  }
}

export async function clubLookup(ctx: Pick<PosContext, 'tenantId' | 'locationId'>, phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) throw PosError.validation('Ingresá el celular completo (con característica)')
  const member = await LoyaltyMember.findOne(memberFilter(ctx, hashPhone(digits)))
    .select('name locationId loyalty.points loyalty.tier')
    .lean<MemberLean>()
  if (!member) return { member: null, redemptions: [] }

  const now = new Date()
  const pending = await StoreRedemption.find({
    tenantId: new mongoose.Types.ObjectId(ctx.tenantId),
    memberId: member._id,
    status: 'pending',
    $and: [
      { $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }] },
      { $or: [{ locationId: new mongoose.Types.ObjectId(ctx.locationId) }, { locationId: null }, { locationId: { $exists: false } }] },
    ],
  })
    .sort({ createdAt: 1 })
    .limit(20)
    .select('storeItemId pointsUsed expiresAt createdAt source')
    .lean<{ _id: mongoose.Types.ObjectId; storeItemId: mongoose.Types.ObjectId; pointsUsed: number; expiresAt?: Date | null; createdAt: Date; source?: string }[]>()
  const items = await StoreItem.find({ _id: { $in: pending.map((r) => r.storeItemId) }, tenantId: ctx.tenantId })
    .select('name')
    .lean<{ _id: mongoose.Types.ObjectId; name: string }[]>()
  const itemName = new Map(items.map((i) => [String(i._id), i.name]))

  return {
    member: {
      id: String(member._id),
      name: member.name,
      points: member.loyalty?.points ?? 0,
      tier: member.loyalty?.tier ?? null,
    },
    redemptions: pending.map((r) => ({
      id: String(r._id),
      item: itemName.get(String(r.storeItemId)) ?? 'Premio',
      pointsUsed: r.pointsUsed,
      expiresAt: r.expiresAt ?? null,
      createdAt: r.createdAt,
    })),
  }
}

/** Entrega un canje validando el código que trae el cliente. */
export async function claimRedemption(ctx: Pick<PosContext, 'tenantId' | 'locationId'>, id: string, code: string) {
  if (!mongoose.isValidObjectId(id)) throw PosError.notFound('Canje no encontrado')
  const redemption = await StoreRedemption.findOne({ _id: id, tenantId: ctx.tenantId })
    .select('status redemptionCode expiresAt locationId pointsUsed')
    .lean<{ _id: mongoose.Types.ObjectId; status: string; redemptionCode: string; expiresAt?: Date | null; locationId?: mongoose.Types.ObjectId | null }>()
  if (!redemption) throw PosError.notFound('Canje no encontrado')
  if (redemption.locationId && String(redemption.locationId) !== ctx.locationId) throw PosError.notFound('Canje no encontrado')
  if (redemption.status !== 'pending') throw PosError.conflict('Este canje ya se entregó o no está vigente')
  if (redemption.redemptionCode.toUpperCase() !== code.trim().toUpperCase()) throw PosError.validation('El código no coincide')
  if (redemption.expiresAt && redemption.expiresAt <= new Date()) {
    try { await expireStoreRedemption(redemption) } catch (err) { console.error('[pos/club] no se pudo expirar el canje:', err) }
    throw PosError.conflict('El canje venció: los puntos vuelven al socio')
  }
  const res = await StoreRedemption.updateOne(
    { _id: redemption._id, tenantId: ctx.tenantId, status: 'pending' },
    { $set: { status: 'claimed', claimedAt: new Date(), locationId: new mongoose.Types.ObjectId(ctx.locationId) } }
  )
  if (res.modifiedCount !== 1) throw PosError.conflict('Este canje ya se entregó')
  return { id: String(redemption._id) }
}
