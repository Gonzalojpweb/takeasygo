import { encrypt, hashEmail } from '@/lib/crypto'
import Consumer, { type IConsumer } from '@/models/Consumer'
import type { Types } from 'mongoose'

interface OrderConsumerData {
  name: string
  email: string
  phone: string
  phoneHash: string
  tenantId: Types.ObjectId | string
  total: number
  createdAt: Date
  isCorporate?: boolean
  corporateAccountId?: Types.ObjectId | string | null
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

  try {
    await Consumer.updateOne({ $or: orConditions }, update, { upsert: true })
    return true
  } catch (err: any) {
    if (err?.code === 11000) {
      for (const cond of orConditions) {
        try {
          await Consumer.updateOne(cond, update, { upsert: true })
          return true
        } catch (innerErr) {
          console.warn('[consumer] upsert fallback failed:', cond, innerErr)
        }
      }
    }
    console.error('[consumer] upsert error:', err)
    return false
  }
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
