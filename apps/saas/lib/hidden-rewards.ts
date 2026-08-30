import crypto from 'crypto'
import { cookies } from 'next/headers'
import mongoose from 'mongoose'
import HiddenRewardClaim from '@/models/HiddenRewardClaim'
import Menu from '@/models/Menu'

const HR_SID_COOKIE = 'hr_sid'
const HR_SID_MAX_AGE = 365 * 24 * 60 * 60 // 1 año

/**
 * Obtiene el device ID (fingerprint) del request actual.
 * Si no existe cookie hr_sid, la genera y la adjunta a la respuesta.
 * Retorna el hash SHA-256 del sid (nunca el valor raw).
 */
export async function getOrCreateDeviceId(): Promise<{ deviceId: string; setCookie?: string }> {
  const cookieStore = await cookies()
  const existing = cookieStore.get(HR_SID_COOKIE)?.value

  if (existing) {
    return { deviceId: hashSid(existing) }
  }

  // Generar nuevo sid
  const sid = crypto.randomUUID()
  const deviceId = hashSid(sid)

  const cookie = [
    `${HR_SID_COOKIE}=${sid}`,
    'Path=/',
    `Max-Age=${HR_SID_MAX_AGE}`,
    'SameSite=Lax',
    process.env.NODE_ENV === 'production' ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ')

  return { deviceId, setCookie: cookie }
}

/**
 * Extrae el device ID de una cookie existente sin generar una nueva.
 * Retorna null si la cookie no existe.
 */
export async function getDeviceIdIfExists(): Promise<string | null> {
  const cookieStore = await cookies()
  const sid = cookieStore.get(HR_SID_COOKIE)?.value
  return sid ? hashSid(sid) : null
}

/**
 * Genera un sessionId para la regla "mismo carrito no puede consumir".
 * Se usa como referencia de sesión, no como identidad.
 */
export function generateSessionId(): string {
  return crypto.randomUUID()
}

/**
 * Finaliza (consume) los hidden reward claims de un pedido pagado.
 * Idempotente: seguro de llamar múltiples veces para el mismo pedido.
 *
 * Estados: reservado → consumido
 * Side effects: decrementa remainingClaims en Menu, vincula teléfono si falta.
 *
 * Llamar desde TODOS los puntos que confirman un pedido:
 * - MP webhook, Kripton webhook
 * - verify-payment, verify-payment-by-number
 * - track, payments/reconcile
 * - confirm-transfer-admin, confirm-transfer-client
 * - cron/reconcile-payments, cron/cancel-pending
 * - PATCH status (el que ya existía)
 */
export async function finalizeHiddenRewardClaims(
  orderId: mongoose.Types.ObjectId | mongoose.Types.ObjectId,
  customerPhoneHash?: string | null
): Promise<void> {
  // Buscar claims que estén 'reservado' para este pedido
  const claims = await HiddenRewardClaim.find({
    reservedOrderId: orderId,
    status: 'reservado',
  }).lean()

  if (claims.length === 0) return

  const now = new Date()

  for (const claim of claims) {
    // 1. Marcar como consumido (reservado → consumido)
    const updated = await HiddenRewardClaim.findOneAndUpdate(
      {
        _id: claim._id,
        status: 'reservado',
      },
      {
        $set: {
          status: 'consumido',
          consumedAt: now,
          ...(customerPhoneHash && !claim.customerPhoneHash
            ? { customerPhoneHash, phoneLinkedAt: now }
            : {}),
        },
      },
      { new: true }
    )

    if (!updated) continue // ya fue consumido por otra llamada (idempotente)

    // 2. Decrementar remainingClaims atómicamente en el Menu de la sede del claim
    // Resolve menuId from menuItemId (HiddenRewardClaim has no menuId field).
    // Multi-sede (B): si el claim tiene locationId, resolver el menú DE ESA SEDE
    // (mismo menuItemId puede existir en menús de distintas sedes — cada uno con su stock).
    const itemId = claim.menuItemId
    const locationScope = claim.locationId ? { locationId: claim.locationId } : {}
    let menuDoc = await Menu.findOne({ ...locationScope, 'categories.items._id': itemId }).select('_id').lean<{ _id: mongoose.Types.ObjectId }>()
    if (!menuDoc) {
      menuDoc = await Menu.findOne({ ...locationScope, 'categories.subcategories.items._id': itemId }).select('_id').lean<{ _id: mongoose.Types.ObjectId }>()
    }
    const menuId = menuDoc?._id

    if (!menuId) continue

    await Menu.updateOne(
      { _id: menuId, 'categories.items._id': itemId },
      { $inc: { 'categories.$[c].items.$[i].hiddenReward.remainingClaims': -1 } },
      { arrayFilters: [
        { 'c.items._id': itemId },
        { 'i._id': itemId, 'i.hiddenReward.maxClaims': { $gt: 0 }, 'i.hiddenReward.remainingClaims': { $gt: 0 } },
      ] }
    ).catch(() => {})

    await Menu.updateOne(
      { _id: menuId, 'categories.subcategories.items._id': itemId },
      { $inc: { 'categories.$[c].subcategories.$[s].items.$[i].hiddenReward.remainingClaims': -1 } },
      { arrayFilters: [
        { 'c.subcategories.items._id': itemId },
        { 's.items._id': itemId },
        { 'i._id': itemId, 'i.hiddenReward.maxClaims': { $gt: 0 }, 'i.hiddenReward.remainingClaims': { $gt: 0 } },
      ] }
    ).catch(() => {})
  }
}

function hashSid(sid: string): string {
  return crypto.createHash('sha256').update(sid).digest('hex')
}
