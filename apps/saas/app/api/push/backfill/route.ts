import { connectDB } from '@/lib/mongoose'
import PushSubscription from '@/models/PushSubscription'
import LoyaltyMember from '@/models/LoyaltyMember'
import Order from '@/models/Order'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'superadmin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    await connectDB()

    const subs = await PushSubscription.find({
      $or: [
        { phoneHash: { $exists: false } },
        { phoneHash: null },
        { phoneHash: '' },
      ],
    }).lean()

    let updatedViaMember = 0
    let updatedViaOrder = 0
    let skipped = 0

    for (const sub of subs) {
      // Strategy 1: via memberId
      if (sub.memberId) {
        const member = await LoyaltyMember.findById(sub.memberId).select('phoneHash').lean()
        if (member?.phoneHash) {
          await PushSubscription.updateOne(
            { _id: sub._id },
            { $set: { phoneHash: member.phoneHash } }
          )
          updatedViaMember++
          continue
        }
      }

      // Strategy 2: via clientToken in Orders
      if (sub.clientToken) {
        const order = await Order.findOne(
          { clientToken: sub.clientToken },
          { 'customer.phoneHash': 1 }
        ).sort({ createdAt: -1 }).lean()

        if (order?.customer?.phoneHash) {
          await PushSubscription.updateOne(
            { _id: sub._id },
            { $set: { phoneHash: order.customer.phoneHash } }
          )
          updatedViaOrder++
          continue
        }
      }

      skipped++
    }

    return NextResponse.json({
      ok: true,
      total: subs.length,
      updatedViaMember,
      updatedViaOrder,
      skipped,
    })
  } catch (error) {
    console.error('[push/backfill]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
