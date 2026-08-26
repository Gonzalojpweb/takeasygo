/**
 * Backfill WeeklyCommissionStatement from existing transfer orders.
 * Run: npx tsx scripts/backfill-weekly-statements.ts
 *
 * One-shot script that creates WeeklyCommissionStatement documents
 * for all past weeks that have transfer orders but no statement.
 */
import mongoose from 'mongoose'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadEnv() {
  try {
    const content = readFileSync(resolve(__dirname, '../.env.local'), 'utf-8')
    for (const line of content.split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+)$/)
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
      }
    }
  } catch {}
}
loadEnv()

function getMonday(d: Date): Date {
  const r = new Date(d)
  const day = r.getUTCDay()
  const diff = day === 0 ? 6 : day - 1
  r.setUTCDate(r.getUTCDate() - diff)
  r.setUTCHours(0, 0, 0, 0)
  return r
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d)
  r.setUTCDate(r.getUTCDate() + days)
  return r
}

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI not set')

  await mongoose.connect(uri)
  console.log('Connected to MongoDB')

  const db = mongoose.connection.db!
  const tenantsCol = db.collection('tenants')
  const ordersCol = db.collection('orders')
  const statementsCol = db.collection('weeklycommissionstatements')

  const tenants = await tenantsCol.find({ isActive: true }).toArray()
  console.log(`Found ${tenants.length} active tenants`)

  let totalCreated = 0
  let totalSkipped = 0
  let totalEmpty = 0

  for (const tenant of tenants) {
    // Find earliest transfer order for this tenant
    const earliest = await ordersCol.findOne(
      {
        tenantId: tenant._id,
        'payment.method': 'transfer',
        'payment.status': { $ne: 'cancelled' },
      },
      { sort: { 'statusTimestamps.confirmedAt': 1 } }
    )

    if (!earliest) {
      console.log(`  ${tenant.name}: no transfer orders, skipping`)
      totalSkipped++
      continue
    }

    const earliestDate = earliest.statusTimestamps?.confirmedAt || earliest.createdAt
    const startDate = getMonday(new Date(earliestDate))
    const endDate = getMonday(new Date())

    let currentMonday = new Date(startDate)
    let tenantCreated = 0
    let tenantSkipped = 0
    let tenantEmpty = 0

    while (currentMonday < endDate) {
      const weekStart = new Date(currentMonday)
      const weekEnd = addDays(weekStart, 7)
      weekEnd.setUTCHours(23, 59, 59, 999)

      // Check if statement already exists
      const existing = await statementsCol.findOne({
        tenantId: tenant._id,
        weekStart,
      })

      if (existing) {
        tenantSkipped++
        currentMonday = addDays(currentMonday, 7)
        continue
      }

      // Aggregate transfer orders for this week
      const result = await ordersCol.aggregate([
        {
          $match: {
            tenantId: tenant._id,
            'payment.method': 'transfer',
            'payment.status': { $ne: 'cancelled' },
            'statusTimestamps.confirmedAt': { $gte: weekStart, $lte: weekEnd },
          },
        },
        {
          $group: {
            _id: null,
            totalCommission: { $sum: '$payment.platformFeeAmount' },
            orderCount: { $sum: 1 },
          },
        },
      ]).toArray()

      const totalCommission = result[0]?.totalCommission || 0
      const orderCount = result[0]?.orderCount || 0

      if (totalCommission <= 0) {
        tenantEmpty++
        currentMonday = addDays(currentMonday, 7)
        continue
      }

      // Create statement
      await statementsCol.insertOne({
        tenantId: tenant._id,
        weekStart,
        weekEnd,
        amount: totalCommission,
        status: 'pendiente',
        closedAt: new Date(),
        orderCount,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      tenantCreated++
      currentMonday = addDays(currentMonday, 7)
    }

    totalCreated += tenantCreated
    totalSkipped += tenantSkipped
    totalEmpty += tenantEmpty

    console.log(`  ${tenant.name}: created=${tenantCreated}, skipped=${tenantSkipped}, empty=${tenantEmpty}`)
  }

  console.log(`\nDone! Created: ${totalCreated}, Skipped: ${totalSkipped}, Empty weeks: ${totalEmpty}`)
  await mongoose.disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
