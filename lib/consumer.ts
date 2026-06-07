import crypto from 'crypto'
import { encrypt } from '@/lib/crypto'
import Consumer, { type IConsumer } from '@/models/Consumer'
import type { Types } from 'mongoose'

function hashEmail(email: string): string {
  if (!email) return ''
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex')
}

interface OrderConsumerData {
  name: string
  email: string
  phone: string
  phoneHash: string
  tenantId: Types.ObjectId | string
  total: number
  createdAt: Date
}

export async function upsertConsumerFromOrder(data: OrderConsumerData): Promise<void> {
  const { name, email, phone, phoneHash, tenantId, total, createdAt } = data
  const emailH = hashEmail(email)
  const dedupKey: Record<string, any> = {}
  if (phoneHash) {
    dedupKey.phoneHash = phoneHash
  } else if (emailH) {
    dedupKey.emailHash = emailH
  } else {
    return
  }

  const setFields: Record<string, any> = {
    name: encrypt(name),
    email: email ? encrypt(email) : '',
    phone: phone ? encrypt(phone) : '',
    phoneHash,
    isLoyaltyMember: false,
  }
  if (emailH) setFields.emailHash = emailH

  const update: Record<string, any> = {
    $set: setFields,
    $addToSet: { tenantIds: tenantId },
    $inc: { totalOrders: 1, totalSpent: total },
    $min: { firstOrderAt: createdAt },
    $max: { lastOrderAt: createdAt },
  }

  await Consumer.updateOne(dedupKey, update, { upsert: true }).catch((err) => {
    if (err?.code === 11000) {
      const fallbackKey: Record<string, any> = {}
      if (emailH) fallbackKey.emailHash = emailH
      if (Object.keys(fallbackKey).length) {
        return Consumer.updateOne(fallbackKey, update, { upsert: true })
      }
    }
    throw err
  })
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
  const dedupKey: Record<string, any> = {}
  if (phoneHash) {
    dedupKey.phoneHash = phoneHash
  } else if (emailH) {
    dedupKey.emailHash = emailH
  } else {
    return
  }

  const setFields: Record<string, any> = {
    name: encrypt(name),
    email: email ? encrypt(email) : '',
    phone: phone ? encrypt(phone) : '',
    phoneHash,
    isLoyaltyMember: true,
  }
  if (emailH) setFields.emailHash = emailH

  const update: Record<string, any> = {
    $set: setFields,
    $addToSet: { tenantIds: tenantId },
  }

  await Consumer.updateOne(dedupKey, update, { upsert: true }).catch((err) => {
    if (err?.code === 11000) {
      const fallbackKey: Record<string, any> = {}
      if (emailH) fallbackKey.emailHash = emailH
      if (Object.keys(fallbackKey).length) {
        return Consumer.updateOne(fallbackKey, update, { upsert: true })
      }
    }
    throw err
  })
}
