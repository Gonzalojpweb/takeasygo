import { encrypt, hashEmail } from '@/lib/crypto'
import Consumer, { type IConsumer } from '@/models/Consumer'
import { normalizeForSearch } from '@takeasygo/business'
import type { Types } from 'mongoose'

interface OrderConsumerData {
  name: string
  email: string
  phone: string
  phoneHash: string | null
  tenantId: Types.ObjectId | string
  total: number
  createdAt: Date
  isCorporate?: boolean
  corporateAccountId?: Types.ObjectId | string | null
}

const MAX_RETRIES = 3
const BASE_DELAY_MS = 200

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function upsertConsumerFromOrder(data: OrderConsumerData): Promise<boolean> {
  const { name, email, phone, phoneHash, tenantId, total, createdAt, isCorporate, corporateAccountId } = data
  const emailH = hashEmail(email)

  const orConditions: Record<string, any>[] = []
  if (phoneHash) orConditions.push({ phoneHash })
  if (emailH) orConditions.push({ emailHash: emailH })
  if (orConditions.length === 0) {
    console.warn('[consumer] upsert skipped: no phoneHash or emailHash for order', { name, tenantId: String(tenantId) })
    return false
  }

  const setFields: Record<string, any> = {
    name: encrypt(name),
    email: email ? encrypt(email) : '',
    phone: phone ? encrypt(phone) : '',
    nameSearchToken: normalizeForSearch(name),
  }
  if (phoneHash) setFields.phoneHash = phoneHash
  if (emailH) setFields.emailHash = emailH
  if (isCorporate) {
    setFields.isCorporate = true
    if (corporateAccountId) setFields.corporateAccountId = corporateAccountId
  }

  const update: Record<string, any> = {
    $set: setFields,
    $addToSet: { tenantIds: tenantId },
    $inc: { totalOrders: 1, totalSpent: total },
    $min: { firstOrderAt: createdAt },
    $max: { lastOrderAt: createdAt },
  }

  let lastError: any = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await Consumer.updateOne({ $or: orConditions }, update, { upsert: true })
      return true
    } catch (err: any) {
      lastError = err

      if (err?.code === 11000) {
        // Duplicate key — try individual conditions
        for (const cond of orConditions) {
          try {
            await Consumer.updateOne(cond, update, { upsert: true })
            return true
          } catch (innerErr) {
            lastError = innerErr
          }
        }
      }

      // Exponential backoff before retry (except on last attempt)
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt)
        await sleep(delay)
      }
    }
  }

  console.error('[consumer] upsert failed after retries:', lastError)
  return false
}

export async function upsertConsumerFromLoyaltyMember(data: {
  name: string
  email: string
  phone: string
  phoneHash: string
  tenantId: Types.ObjectId | string
}): Promise<void> {
  const { name, email, phone, phoneHash, tenantId } = data
  const emailH = hashEmail(email)

  const orConditions: Record<string, any>[] = []
  if (phoneHash) orConditions.push({ phoneHash })
  if (emailH) orConditions.push({ emailHash: emailH })
  if (orConditions.length === 0) return

  const setFields: Record<string, any> = {
    name: encrypt(name),
    email: email ? encrypt(email) : '',
    phone: phone ? encrypt(phone) : '',
    isLoyaltyMember: true,
    nameSearchToken: normalizeForSearch(name),
  }
  if (phoneHash) setFields.phoneHash = phoneHash
  if (emailH) setFields.emailHash = emailH

  const update: Record<string, any> = {
    $set: setFields,
    $addToSet: { tenantIds: tenantId },
  }

  try {
    await Consumer.updateOne({ $or: orConditions }, update, { upsert: true })
  } catch (err: any) {
    if (err?.code === 11000) {
      for (const cond of orConditions) {
        try {
          await Consumer.updateOne(cond, update, { upsert: true })
          return
        } catch {}
      }
    }
    console.error('[consumer] upsert error:', err)
  }
}
