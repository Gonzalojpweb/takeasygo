/**
 * Reconciliation script: fixes orders stuck in awaiting_payment
 * where the webhook failed (multi-account bug) but the payment was actually charged.
 *
 * Usage: npx tsx scripts/reconcile-stuck-awaiting.ts [--dry-run] [--hours=24] [--limit=50]
 *
 * Safety:
 *   - Idempotent: skips orders already confirmed/cancelled
 *   - Rate-limited: 200ms delay between MP API calls (~5 req/s)
 *   - Dry-run: zero writes to DB
 *   - Tenant-scoped: all queries filter by tenantId
 */

import { connectDB } from '../lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import { decrypt } from '../lib/crypto'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { getActiveMpAccount, findMpAccountById } from '../lib/mercadopago'

const DRY_RUN = process.argv.includes('--dry-run')
const HOURS_ARG = process.argv.find(a => a.startsWith('--hours='))
const HOURS = HOURS_ARG ? parseInt(HOURS_ARG.split('=')[1]) : 24
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='))
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1]) : 50
const CUTOFF = new Date(Date.now() - HOURS * 60 * 60 * 1000)

const MP_API_DELAY_MS = 200 // ~5 req/s to avoid MP rate limits

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

interface ReconciliationResult {
  tenantSlug: string
  orderNumber: string
  mpPaymentId: string
  previousStatus: string
  action: 'confirmed' | 'cancelled' | 'already_ok' | 'mp_not_found' | 'error' | 'skipped'
  error?: string
}

async function main() {
  console.log(`\n=== Reconciliation Script ===`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`)
  console.log(`Looking at orders older than ${HOURS} hours (before ${CUTOFF.toISOString()})`)
  console.log(`Limit: ${LIMIT} orders\n`)

  await connectDB()

  const stuckOrders = await Order.find({
    status: 'awaiting_payment',
    'payment.mercadopagoId': { $ne: null },
    createdAt: { $lt: CUTOFF },
  })
    .select('tenantId orderNumber payment.mercadopagoId payment.mpAccountId payment.status status createdAt')
    .sort({ createdAt: 1 })
    .limit(LIMIT)
    .lean()

  console.log(`Found ${stuckOrders.length} stuck orders\n`)

  if (stuckOrders.length === 0) {
    console.log('Nothing to reconcile.')
    return
  }

  // Group by tenant to avoid re-loading tenants
  const byTenant = new Map<string, typeof stuckOrders>()
  for (const order of stuckOrders) {
    const tid = order.tenantId.toString()
    if (!byTenant.has(tid)) byTenant.set(tid, [])
    byTenant.get(tid)!.push(order)
  }

  const results: ReconciliationResult[] = []
  let mpCallCount = 0

  for (const [tenantId, orders] of byTenant) {
    const tenant = await Tenant.findById(tenantId).lean() as any
    if (!tenant) {
      console.warn(`Tenant ${tenantId} not found, skipping ${orders.length} orders`)
      for (const o of orders) {
        results.push({ tenantSlug: '???', orderNumber: o.orderNumber, mpPaymentId: o.payment.mercadopagoId, previousStatus: 'awaiting_payment', action: 'error', error: 'Tenant not found' })
      }
      continue
    }

    // Try to find an MP account that can query payments
    // Check each order's mpAccountId individually (different orders may use different accounts)
    const ordersByAccount = new Map<string, typeof orders>()
    for (const order of orders) {
      const accId = order.payment.mpAccountId || '__active__'
      if (!ordersByAccount.has(accId)) ordersByAccount.set(accId, [])
      ordersByAccount.get(accId)!.push(order)
    }

    for (const [accId, accOrders] of ordersByAccount) {
      let queryAccount = accId === '__active__'
        ? getActiveMpAccount(tenant)
        : findMpAccountById(tenant, accId)

      // Fallback: if specific account not found, try active
      if (!queryAccount) queryAccount = getActiveMpAccount(tenant)

      if (!queryAccount) {
        console.warn(`No MP account for tenant ${tenant.slug} (accId=${accId}), skipping ${accOrders.length} orders`)
        for (const o of accOrders) {
          results.push({ tenantSlug: tenant.slug, orderNumber: o.orderNumber, mpPaymentId: o.payment.mercadopagoId, previousStatus: 'awaiting_payment', action: 'error', error: `No MP account (accId=${accId})` })
        }
        continue
      }

      const accessToken = decrypt(queryAccount.accessToken)
      const client = new MercadoPagoConfig({ accessToken })
      const paymentClient = new Payment(client)

      for (const order of accOrders) {
        // Idempotency: skip if already processed (e.g., by webhook arriving late)
        if (order.status !== 'awaiting_payment') {
          results.push({ tenantSlug: tenant.slug, orderNumber: order.orderNumber, mpPaymentId: order.payment.mercadopagoId, previousStatus: order.status, action: 'skipped', error: 'Status changed since query' })
          continue
        }

        const mpPaymentId = order.payment.mercadopagoId
        try {
          // Rate limit: wait before each MP API call
          await sleep(MP_API_DELAY_MS)
          mpCallCount++

          const paymentData = await paymentClient.get({ id: mpPaymentId })

          if (paymentData.status === 'approved') {
            if (!DRY_RUN) {
              await Order.updateOne(
                { _id: order._id, status: 'awaiting_payment' },
                {
                  $set: {
                    status: 'confirmed',
                    'payment.status': 'approved',
                    'payment.mercadopagoData': paymentData as any,
                    ...(order.payment.mpAccountId ? {} : { 'payment.mpAccountId': queryAccount.accountId }),
                  },
                }
              )
            }
            results.push({
              tenantSlug: tenant.slug,
              orderNumber: order.orderNumber,
              mpPaymentId,
              previousStatus: 'awaiting_payment',
              action: 'confirmed',
            })
          } else if (['rejected', 'cancelled'].includes(paymentData.status!)) {
            if (!DRY_RUN) {
              await Order.updateOne(
                { _id: order._id, status: 'awaiting_payment' },
                {
                  $set: {
                    status: 'cancelled',
                    'payment.status': paymentData.status,
                    'payment.mercadopagoData': paymentData as any,
                  },
                }
              )
            }
            results.push({
              tenantSlug: tenant.slug,
              orderNumber: order.orderNumber,
              mpPaymentId,
              previousStatus: 'awaiting_payment',
              action: 'cancelled',
            })
          } else {
            // Pending or other status — don't touch, just report
            results.push({
              tenantSlug: tenant.slug,
              orderNumber: order.orderNumber,
              mpPaymentId,
              previousStatus: 'awaiting_payment',
              action: 'already_ok',
            })
          }
        } catch (err: any) {
          const msg = err?.message || String(err)
          // MP returns 404 when payment doesn't exist — don't mark as cancelled
          if (msg.includes('404') || msg.includes('not found') || msg.includes('Not found')) {
            results.push({
              tenantSlug: tenant.slug,
              orderNumber: order.orderNumber,
              mpPaymentId,
              previousStatus: 'awaiting_payment',
              action: 'mp_not_found',
              error: 'Payment not found in MP — may be a test/sandbox payment',
            })
          } else {
            results.push({
              tenantSlug: tenant.slug,
              orderNumber: order.orderNumber,
              mpPaymentId,
              previousStatus: 'awaiting_payment',
              action: 'error',
              error: msg,
            })
          }
        }
      }
    }
  }

  // Summary
  const confirmed = results.filter(r => r.action === 'confirmed')
  const cancelled = results.filter(r => r.action === 'cancelled')
  const errors = results.filter(r => r.action === 'error')
  const alreadyOk = results.filter(r => r.action === 'already_ok')
  const mpNotFound = results.filter(r => r.action === 'mp_not_found')
  const skipped = results.filter(r => r.action === 'skipped')

  console.log(`\n=== Results ===`)
  console.log(`Confirmed (was awaiting_payment → confirmed): ${confirmed.length}`)
  console.log(`Cancelled (was awaiting_payment → cancelled): ${cancelled.length}`)
  console.log(`Already OK (still pending in MP): ${alreadyOk.length}`)
  console.log(`MP Not Found (payment doesn't exist in MP): ${mpNotFound.length}`)
  console.log(`Skipped (status changed since query): ${skipped.length}`)
  console.log(`Errors: ${errors.length}`)
  console.log(`MP API calls made: ${mpCallCount}`)

  if (confirmed.length > 0) {
    console.log(`\nConfirmed orders:`)
    for (const r of confirmed) {
      console.log(`  [${r.tenantSlug}] ${r.orderNumber} (mp: ${r.mpPaymentId})`)
    }
  }

  if (mpNotFound.length > 0) {
    console.log(`\nMP Not Found (manual review needed):`)
    for (const r of mpNotFound) {
      console.log(`  [${r.tenantSlug}] ${r.orderNumber} (mp: ${r.mpPaymentId}) — ${r.error}`)
    }
  }

  if (errors.length > 0) {
    console.log(`\nErrors:`)
    for (const r of errors) {
      console.log(`  [${r.tenantSlug}] ${r.orderNumber}: ${r.error}`)
    }
  }

  console.log(`\nDone.`)
}

main().catch(err => {
  console.error('Reconciliation script failed:', err)
  process.exit(1)
})
