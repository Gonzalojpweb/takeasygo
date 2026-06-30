import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import Consumer from '@/models/Consumer'
import { safeDecrypt, hashPhone, hashEmail, encrypt } from '@/lib/crypto'
import { canAccess } from '@/lib/plans'

interface OrderGroup {
  phoneHash: string
  emailHash: string
  name: string
  phone: string
  email: string
  totalOrders: number
  totalSpent: number
  firstOrderAt: Date
  lastOrderAt: Date
  isCorporate: boolean
  corporateAccountId: any
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, status: { $in: ['active', 'paused'] } })
    if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (!canAccess(tenant.plan, 'crm')) {
      return NextResponse.json({ error: 'CRM no disponible en tu plan actual.' }, { status: 403 })
    }

    const pageSize = 100
    let errors = 0
    let skip = 0
    let hasMore = true
    const groups = new Map<string, OrderGroup>()

    while (hasMore) {
      const orders = await Order.find({
        tenantId: tenant._id,
        $or: [
          { 'customer.phone': { $ne: '' } },
          { 'customer.email': { $ne: '' } },
          { 'customer.name': { $ne: '' } },
        ],
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean()

      if (orders.length === 0) {
        hasMore = false
        break
      }

      for (const order of orders) {
        try {
          const rawPhone = safeDecrypt(order.customer?.phone || '')
          const rawEmail = safeDecrypt(order.customer?.email || '')
          const rawName = safeDecrypt(order.customer?.name || '')

          if (!rawName && !rawPhone && !rawEmail) continue

          const pHash = hashPhone(rawPhone)
          const eHash = hashEmail(rawEmail)
          const key = pHash || eHash
          if (!key) continue

          const existing = groups.get(key)
          if (existing) {
            if (rawName && !existing.name) existing.name = rawName
            if (rawPhone && !existing.phone) existing.phone = rawPhone
            if (rawEmail && !existing.email) existing.email = rawEmail
            if (pHash && !existing.phoneHash) existing.phoneHash = pHash
            if (eHash && !existing.emailHash) existing.emailHash = eHash
            existing.totalOrders++
            existing.totalSpent += order.total ?? 0
            if (order.createdAt && order.createdAt < existing.firstOrderAt) existing.firstOrderAt = order.createdAt
            if (order.createdAt && order.createdAt > existing.lastOrderAt) existing.lastOrderAt = order.createdAt
            if ((order as any).corporateAccountId) {
              existing.isCorporate = true
              existing.corporateAccountId = (order as any).corporateAccountId
            }
          } else {
            groups.set(key, {
              phoneHash: pHash,
              emailHash: eHash,
              name: rawName,
              phone: rawPhone,
              email: rawEmail,
              totalOrders: 1,
              totalSpent: order.total ?? 0,
              firstOrderAt: order.createdAt ?? new Date(),
              lastOrderAt: order.createdAt ?? new Date(),
              isCorporate: !!(order as any).corporateAccountId,
              corporateAccountId: (order as any).corporateAccountId ?? null,
            })
          }
        } catch (e) {
          console.error('[backfill] error decrypting order', order.orderNumber, ':', e)
          errors++
        }
      }

      skip += pageSize
    }

    let processed = 0
    for (const [key, g] of groups) {
      try {
        const setFields: Record<string, any> = {
          name: encrypt(g.name),
          email: g.email ? encrypt(g.email) : '',
          phone: g.phone ? encrypt(g.phone) : '',
          isLoyaltyMember: false,
          isCorporate: g.isCorporate,
          totalOrders: g.totalOrders,
          totalSpent: g.totalSpent,
          firstOrderAt: g.firstOrderAt,
          lastOrderAt: g.lastOrderAt,
        }
        if (g.phoneHash) setFields.phoneHash = g.phoneHash
        if (g.emailHash) setFields.emailHash = g.emailHash
        if (g.corporateAccountId) setFields.corporateAccountId = g.corporateAccountId

        const update: Record<string, any> = {
          $set: setFields,
          $addToSet: { tenantIds: tenant._id },
        }

        const query = g.phoneHash ? { phoneHash: g.phoneHash } : { emailHash: g.emailHash }

        await Consumer.updateOne(query, update, { upsert: true })
        processed++
      } catch (e) {
        console.error('[backfill] error upserting consumer for key', key, ':', e)
        errors++
      }
    }

    return NextResponse.json({
      ok: true,
      processed,
      errors,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
