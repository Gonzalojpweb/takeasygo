import { connectDB } from '@/lib/mongoose'
import { NextResponse } from 'next/server'
import Order from '@/models/Order'
import Consumer from '@/models/Consumer'
import { encrypt, hashPhone, safeDecrypt } from '@/lib/crypto'
import { requireSuperAdmin } from '@/lib/apiAuth'
import crypto from 'crypto'

function hashEmail(email: string): string {
  if (!email) return ''
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex')
}

export async function POST() {
  const authError = await requireSuperAdmin()
  if (authError) return authError

  try {
    await connectDB()

    // Clean up docs with empty emailHash that may exist from previous failed runs
    await Consumer.updateMany(
      { emailHash: '' },
      { $unset: { emailHash: '' } }
    ).catch(() => {})

    const orders = await Order.find({
      $or: [
        { 'customer.phoneHash': { $ne: '' } },
        { 'customer.email': { $ne: '' } },
      ],
    })
      .select('customer tenantId total createdAt')
      .sort({ createdAt: 1 })
      .lean()

    const grouped: Record<
      string,
      {
        name: string
        email: string
        phone: string
        phoneHash: string
        emailHash: string
        tenantIds: Set<string>
        totalOrders: number
        totalSpent: number
        firstOrderAt: Date | null
        lastOrderAt: Date | null
        isCorporate: boolean
        corporateAccountId: any
      }
    > = {}

    for (const order of orders) {
      const cust = order.customer as any
      if (!cust) continue

      const phoneHash = cust.phoneHash || ''
      const email = cust.email ? safeDecrypt(cust.email) : ''
      const emailHash = hashEmail(email)
      const key = phoneHash || emailHash
      if (!key) continue

      if (!grouped[key]) {
        grouped[key] = {
          name: cust.name ? safeDecrypt(cust.name) : '',
          email,
          phone: cust.phone ? safeDecrypt(cust.phone) : '',
          phoneHash,
          emailHash,
          tenantIds: new Set(),
          totalOrders: 0,
          totalSpent: 0,
          firstOrderAt: null,
          lastOrderAt: null,
          isCorporate: false,
          corporateAccountId: null,
        }
      }

      const g = grouped[key]
      g.totalOrders++
      g.totalSpent += order.total || 0
      const tid = order.tenantId?.toString()
      if (tid) g.tenantIds.add(tid)
      const createdAt = order.createdAt
      if (!g.firstOrderAt || createdAt < g.firstOrderAt) g.firstOrderAt = createdAt
      if (!g.lastOrderAt || createdAt > g.lastOrderAt) g.lastOrderAt = createdAt
      if ((order as any).corporateAccountId) {
        g.isCorporate = true
        g.corporateAccountId = (order as any).corporateAccountId
      }
    }

    let created = 0
    let updated = 0

    for (const [, g] of Object.entries(grouped)) {
      const dedupKey: Record<string, any> = {}
      if (g.phoneHash) {
        dedupKey.phoneHash = g.phoneHash
      } else {
        dedupKey.emailHash = g.emailHash
      }

      const setFields: Record<string, any> = {
        name: encrypt(g.name),
        email: g.email ? encrypt(g.email) : '',
        phone: g.phone ? encrypt(g.phone) : '',
        phoneHash: g.phoneHash,
        isCorporate: g.isCorporate,
      }
      if (g.emailHash) setFields.emailHash = g.emailHash
      if (g.corporateAccountId) setFields.corporateAccountId = g.corporateAccountId

      const result = await Consumer.updateOne(
        dedupKey,
        {
          $set: setFields,
          $addToSet: {
            tenantIds: { $each: [...g.tenantIds].map((id) => id) },
          },
          $min: { firstOrderAt: g.firstOrderAt },
          $max: { lastOrderAt: g.lastOrderAt },
          $inc: { totalOrders: g.totalOrders, totalSpent: g.totalSpent },
        },
        { upsert: true }
      )

      if (result.upsertedCount) created++
      else updated++
    }

    return NextResponse.json({
      message: `Backfill completado. Creados: ${created}, Actualizados: ${updated}`,
      created,
      updated,
      totalGroups: Object.keys(grouped).length,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
