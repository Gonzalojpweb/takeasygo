/**
 * Migration: LoyaltyMember per-location (Option D)
 *
 * Reconstructs per-location memberships from actual order history.
 * For each existing member, finds orders grouped by locationId and
 * creates separate LoyaltyMember records per location.
 *
 * Run: npx tsx lib/migrations/migrate-loyalty-per-location.ts
 *
 * Flags:
 *   --dry-run   Show what would happen without writing
 *   --report    Output JSON report to stdout
 */

import mongoose from 'mongoose'
import LoyaltyMember from '@/models/LoyaltyMember'
import LocationLoyaltyConfig from '@/models/LocationLoyaltyConfig'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'

const DRY_RUN = process.argv.includes('--dry-run')
const REPORT_JSON = process.argv.includes('--report')

interface MigrationReport {
  totalMembersProcessed: number
  migratedFromOrders: number
  migratedFallbackLastLocation: number
  migratedFallbackNull: number
  skipped: number
  errors: { memberId: string; error: string }[]
  byTenant: Record<string, {
    original: number
    migratedFromOrders: number
    fallbackLastLocation: number
    fallbackNull: number
  }>
  perLocationMembersCreated: number
  sampleMigrations: Array<{
    memberId: string
    name: string
    originalPoints: number
    locations: Array<{
      locationId: string
      locationName: string
      orderCount: number
      recalculatedPoints: number
    }>
  }>
}

async function calculatePointsFromOrders(
  orders: any[],
  pointsConfig: any
): Promise<number> {
  if (!pointsConfig?.enabled) return 0

  let totalPoints = 0
  for (const order of orders) {
    const amount = order.payment?.baseTotal || order.total || 0
    if (amount < (pointsConfig.minOrderForPoints || 0)) continue

    const mode = pointsConfig.mode || 'fixed_per_currency'
    let p = 0
    if (mode === 'fixed_per_currency') {
      p = Math.floor(amount * (pointsConfig.pointsPerCurrency || 0.1))
    } else if (mode === 'percentage') {
      p = Math.floor(amount * (pointsConfig.pointsPercentage || 10) / 100)
    } else if (mode === 'hybrid') {
      p = Math.floor(amount * (pointsConfig.pointsPerCurrency || 0.1))
      p += Math.floor(amount * (pointsConfig.pointsPercentage || 10) / 100)
    }
    p += pointsConfig.pointsPerOrder || 0
    totalPoints += Math.max(0, p)
  }

  return totalPoints
}

async function migrate() {
  console.log(`\n=== LoyaltyMember Per-Location Migration ===`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`)
  console.log(`Timestamp: ${new Date().toISOString()}\n`)

  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://pgonzalojose_db_user:6oXEemLauaEuPoaq@takeasygo.ssjlhfw.mongodb.net/?appName=takeasygo'
  await mongoose.connect(MONGODB_URI, { dbName: 'test' })
  const db = mongoose.connection.db!

  const report: MigrationReport = {
    totalMembersProcessed: 0,
    migratedFromOrders: 0,
    migratedFallbackLastLocation: 0,
    migratedFallbackNull: 0,
    skipped: 0,
    errors: [],
    byTenant: {},
    perLocationMembersCreated: 0,
    sampleMigrations: [],
  }

  // Step 1: Find all tenants with perLocation enabled
  const perLocationTenants = await Tenant.find({ 'loyalty.perLocation': true })
    .select('_id slug')
    .lean()

  console.log(`Tenants with perLocation enabled: ${perLocationTenants.length}`)

  if (perLocationTenants.length === 0) {
    console.log('No tenants with perLocation enabled. Nothing to migrate.')
    return report
  }

  // Step 2: For each tenant, process members
  for (const tenant of perLocationTenants) {
    const tenantId = tenant._id
    console.log(`\n--- Processing tenant: ${tenant.slug || tenantId} ---`)

    const tenantReport = {
      original: 0,
      migratedFromOrders: 0,
      fallbackLastLocation: 0,
      fallbackNull: 0,
    }

    // Get existing members (before migration)
    const members = await LoyaltyMember.find({ tenantId })
      .select('_id name phone phoneHash email status source loyalty.points cache joinedAt')
      .lean()

    tenantReport.original = members.length
    report.totalMembersProcessed += members.length

    // Get tenant's default pointsConfig (from any LocationLoyaltyConfig)
    const locationConfig = await LocationLoyaltyConfig.findOne({ locationId: { $exists: true } })
      .where('locationId').in(
        (await mongoose.model('Location').find({ tenantId }).select('_id').lean() as any[]).map((l: any) => l._id)
      )
      .lean()
    const pointsConfig = (locationConfig as any)?.pointsConfig || {
      enabled: false,
      mode: 'fixed_per_currency',
      pointsPerCurrency: 0.1,
      pointsPercentage: 10,
      pointsPerOrder: 0,
      minOrderForPoints: 0,
    }

    // Get all locations for this tenant
    const locations = await mongoose.model('Location').find({ tenantId }).select('_id name').lean() as any[]
    const locationMap = new Map(locations.map((l: any) => [l._id.toString(), l.name || 'Sede']))

    for (const member of members) {
      try {
        // Find all orders for this member at this tenant
        const memberPhoneHash = member.phoneHash
        if (!memberPhoneHash) {
          // No phoneHash → can't match to orders → fallback to null
          if (!DRY_RUN) {
            await LoyaltyMember.updateOne(
              { _id: member._id },
              { $set: { locationId: null } }
            )
          }
          tenantReport.fallbackNull++
          report.migratedFallbackNull++
          continue
        }

        const orders = await Order.find({
          tenantId,
          'customer.phoneHash': memberPhoneHash,
          status: { $nin: ['cancelled'] },
          loyaltyPointsCredited: true,
        })
          .select('locationId payment.baseTotal total status')
          .lean()

        if (orders.length === 0) {
          // No orders → fallback: assign to most recent order's location, or null
          const lastOrder = await Order.findOne({
            tenantId,
            'customer.phoneHash': memberPhoneHash,
          })
            .sort({ createdAt: -1 })
            .select('locationId')
            .lean()

          const fallbackLocationId = lastOrder?.locationId || null

          if (!DRY_RUN) {
            await LoyaltyMember.updateOne(
              { _id: member._id },
              { $set: { locationId: fallbackLocationId } }
            )
          }

          if (fallbackLocationId) {
            tenantReport.fallbackLastLocation++
            report.migratedFallbackLastLocation++
          } else {
            tenantReport.fallbackNull++
            report.migratedFallbackNull++
          }
          continue
        }

        // Group orders by locationId
        const ordersByLocation = new Map<string, any[]>()
        for (const order of orders) {
          const locId = order.locationId?.toString() || 'unknown'
          if (!ordersByLocation.has(locId)) ordersByLocation.set(locId, [])
          ordersByLocation.get(locId)!.push(order)
        }

        const sampleLocations: Array<{
          locationId: string
          locationName: string
          orderCount: number
          recalculatedPoints: number
        }> = []

        let isFirst = true
        for (const [locId, locOrders] of ordersByLocation) {
          const recalculatedPoints = await calculatePointsFromOrders(locOrders, pointsConfig)

          if (isFirst) {
            // First location: update the existing member (not create new)
            if (!DRY_RUN) {
              await LoyaltyMember.updateOne(
                { _id: member._id },
                {
                  $set: {
                    locationId: locId === 'unknown' ? null : new mongoose.Types.ObjectId(locId),
                    'loyalty.points': recalculatedPoints,
                  }
                }
              )
            }
            isFirst = false
          } else {
            // Additional locations: create new member
            if (!DRY_RUN) {
              await LoyaltyMember.create({
                tenantId,
                locationId: locId === 'unknown' ? null : new mongoose.Types.ObjectId(locId),
                name: member.name,
                phone: member.phone,
                phoneHash: member.phoneHash,
                email: member.email,
                status: member.status,
                source: member.source,
                joinedAt: member.joinedAt,
                loyalty: {
                  points: recalculatedPoints,
                  tier: 'none',
                },
                cache: {
                  totalOrders: locOrders.length,
                  totalSpent: locOrders.reduce((sum: number, o: any) => sum + (o.payment?.baseTotal || o.total || 0), 0),
                  lastOrderAt: locOrders.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]?.createdAt || null,
                  updatedAt: new Date(),
                },
              })
            }
            report.perLocationMembersCreated++
          }

          sampleLocations.push({
            locationId: locId,
            locationName: locationMap.get(locId) || 'Unknown',
            orderCount: locOrders.length,
            recalculatedPoints,
          })
        }

        tenantReport.migratedFromOrders++
        report.migratedFromOrders++

        if (report.sampleMigrations.length < 10) {
          report.sampleMigrations.push({
            memberId: member._id.toString(),
            name: member.name,
            originalPoints: member.loyalty?.points || 0,
            locations: sampleLocations,
          })
        }
      } catch (err: any) {
        report.errors.push({ memberId: member._id.toString(), error: err.message })
        console.error(`  Error processing member ${member._id}: ${err.message}`)
      }
    }

    report.byTenant[tenant.slug || tenantId.toString()] = tenantReport
  }

  return report
}

// ── Main ─────────────────────────────────────────────────────────────────
;(async () => {
  const report = await migrate()

  console.log('\n=== MIGRATION REPORT ===')
  console.log(`Total members processed: ${report.totalMembersProcessed}`)
  console.log(`Migrated from order history (Option D): ${report.migratedFromOrders}`)
  console.log(`Fallback to last order location: ${report.migratedFallbackLastLocation}`)
  console.log(`Fallback to null (no orders found): ${report.migratedFallbackNull}`)
  console.log(`New per-location members created: ${report.perLocationMembersCreated}`)
  console.log(`Errors: ${report.errors.length}`)

  if (Object.keys(report.byTenant).length > 0) {
    console.log('\n--- By Tenant ---')
    for (const [slug, stats] of Object.entries(report.byTenant)) {
      console.log(`  ${slug}: ${stats.original} original → ${stats.migratedFromOrders} from orders, ${stats.fallbackLastLocation} fallback location, ${stats.fallbackNull} fallback null`)
    }
  }

  if (report.sampleMigrations.length > 0) {
    console.log('\n--- Sample Migrations (up to 10) ---')
    for (const s of report.sampleMigrations) {
      console.log(`  ${s.name} (${s.memberId}): ${s.originalPoints} pts → ${s.locations.length} location(s)`)
      for (const loc of s.locations) {
        console.log(`    ${loc.locationName} (${loc.locationId}): ${loc.orderCount} orders, ${loc.recalculatedPoints} pts`)
      }
    }
  }

  if (report.errors.length > 0) {
    console.log('\n--- Errors ---')
    for (const e of report.errors) {
      console.log(`  ${e.memberId}: ${e.error}`)
    }
  }

  if (REPORT_JSON) {
    console.log('\n--- JSON Report ---')
    console.log(JSON.stringify(report, null, 2))
  }

  process.exit(0)
})().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
