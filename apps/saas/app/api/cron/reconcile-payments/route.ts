import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import PaymentNotification from '@/models/PaymentNotification'
import { decrypt } from '@/lib/crypto'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { addPointsFromOrder, processRewardDeduction } from '@/lib/loyalty'
import PushSubscription from '@/models/PushSubscription'
import webpush from 'web-push'

webpush.setVapidDetails(
  'mailto:clickandthink1@gmail.com',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

const CRON_SECRET = process.env.CRON_SECRET
const RECONCILE_WINDOW_MINUTES = 120
const MIN_AGE_MINUTES = 2

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    const tenants = await Tenant.find({
      isActive: true,
      'mercadopago.isConfigured': true,
      'mercadopago.accessToken': { $exists: true, $ne: null },
    }).lean() as any[]

    const results = {
      tenantsScanned: tenants.length,
      ordersScanned: 0,
      healed: 0,
      errors: 0,
      details: [] as string[],
    }

    const now = new Date()
    const windowStart = new Date(now.getTime() - RECONCILE_WINDOW_MINUTES * 60 * 1000)
    const minAge = new Date(now.getTime() - MIN_AGE_MINUTES * 60 * 1000)

    for (const tenant of tenants) {
      try {
        const accessToken = decrypt(tenant.mercadopago.accessToken)
        const client = new MercadoPagoConfig({ accessToken })
        const paymentClient = new Payment(client)

        const pendingOrders = await Order.find({
          tenantId: tenant._id,
          deletedAt: null,
          status: 'awaiting_payment',
          'payment.mercadopagoId': { $exists: true, $ne: null },
          createdAt: { $gte: windowStart, $lte: minAge },
        }).lean() as any[]

        results.ordersScanned += pendingOrders.length

        for (const order of pendingOrders) {
          try {
            const mpSearch = await paymentClient.search({
              options: {
                external_reference: order.orderNumber,
                sort: 'date_created',
                criteria: 'desc',
                limit: 5,
              },
            })

            const approvedPayment = mpSearch.results?.find((r: any) => r.status === 'approved')
            if (!approvedPayment) continue

            const session = await mongoose.startSession()
            await session.withTransaction(async () => {
              await Order.updateOne(
                { _id: order._id, status: 'awaiting_payment' },
                {
                  $set: {
                    status: 'confirmed',
                    'payment.status': 'approved',
                    'payment.mercadopagoId': String(approvedPayment.id),
                    'payment.mercadopagoData': approvedPayment as any,
                    'statusTimestamps.confirmedAt': new Date(),
                  },
                },
                { session }
              )

              const freshOrder = await Order.findById(order._id).session(session)
              if (freshOrder) {
                if (freshOrder.customer?.phoneHash) {
                  if (freshOrder.rewardItems?.length > 0) {
                    await processRewardDeduction(freshOrder, tenant, session)
                  }
                  await addPointsFromOrder(freshOrder, tenant, session)
                }
              }

              await PaymentNotification.findOneAndUpdate(
                { mpId: String(approvedPayment.id), tenantId: tenant._id },
                {
                  topic: 'payment',
                  payload: approvedPayment,
                  processed: true,
                  processedAt: new Date(),
                  orderId: order._id as any,
                  note: 'Healed by auto-reconcile cron',
                },
                { upsert: true, session }
              )
            })
            await session.endSession()

            results.healed++
            results.details.push(`Order ${order.orderNumber} healed (MP payment ${approvedPayment.id})`)

            // ── Push notification al consumidor (fire-and-forget) ────────────
            if (order.clientToken) {
              const clientToken = order.clientToken
              const orderNumber = order.orderNumber
              const tenantSlug = (tenant as any).slug
              setImmediate(async () => {
                try {
                  const sub = await PushSubscription.findOne({ clientToken }).lean() as any
                  if (sub) {
                    await webpush.sendNotification(
                      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                      JSON.stringify({
                        title: `✅ Pedido confirmado #${orderNumber}`,
                        body: 'Tocá para ver el seguimiento de tu pedido',
                        icon: '/tgoicon-192.png',
                        badge: '/tgoicon-192.png',
                        url: `/${tenantSlug}/tracking/${orderNumber}`,
                      })
                    )
                  }
                } catch (err) {
                  if ((err as any)?.statusCode === 410) {
                    await PushSubscription.deleteOne({ clientToken }).catch(() => {})
                  }
                  console.error('[cron:reconcile] Consumer push error:', (err as Error)?.message)
                }
              })
            }
          } catch (err) {
            console.error(`[Cron:reconcile] Error healing order ${order.orderNumber}:`, err)
            results.errors++
          }
        }
      } catch (err) {
        console.error(`[Cron:reconcile] Error processing tenant ${tenant.slug}:`, err)
        results.errors++
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      results,
    })
  } catch (error) {
    console.error('[Cron:reconcile-payments] Error:', error)
    return NextResponse.json(
      { error: 'Error reconciliando pagos', details: String(error) },
      { status: 500 }
    )
  }
}
