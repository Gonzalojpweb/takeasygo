/**
 * DRY-RUN migration: Reports what migrate-mp-accounts.ts would do, without writing.
 *
 * Run: npx tsx scripts/migrate-mp-accounts-dry-run.ts
 */

import mongoose from 'mongoose'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(__dirname, '../.env.staging') })

const MONGODB_URI = process.env.MONGODB_URI!
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set')
  process.exit(1)
}

const tenantSchema = new mongoose.Schema({
  slug: String,
  name: String,
  mercadopago: {
    isConfigured: Boolean,
    accessToken: String,
  },
  mpOAuth: {
    accessToken: String,
    isConnected: Boolean,
  },
  mpAccounts: [{
    label: String,
    accessToken: String,
    isActive: Boolean,
    createdAt: Date,
  }],
}, { strict: false })

const Tenant = mongoose.model('Tenant', tenantSchema, 'tenants')

async function dryRun() {
  await mongoose.connect(MONGODB_URI)
  console.log('Connected to STAGING MongoDB\n')

  // All tenants with any MP config
  const allTenants = await Tenant.find({
    $or: [
      { 'mercadopago.isConfigured': true },
      { 'mpOAuth.accessToken': { $exists: true, $ne: null } },
    ],
  })

  console.log(`Tenants with MP config: ${allTenants.length}\n`)

  let wouldMigrate = 0
  let alreadyMigrated = 0
  let skippedNoData = 0

  for (const tenant of allTenants) {
    const t = tenant as any
    const hasMpAccounts = t.mpAccounts?.length > 0
    const hasLegacyMP = t.mercadopago?.isConfigured && t.mercadopago?.accessToken
    const hasOAuth = t.mpOAuth?.accessToken

    if (hasMpAccounts) {
      alreadyMigrated++
      console.log(`  SKIP (already migrated): ${t.slug} — ${t.mpAccounts.length} account(s)`)
    } else if (!hasLegacyMP && !hasOAuth) {
      skippedNoData++
      console.log(`  SKIP (no data): ${t.slug}`)
    } else {
      wouldMigrate++
      const source = hasLegacyMP && hasOAuth ? 'legacy+oauth' : hasLegacyMP ? 'legacy' : 'oauth'
      console.log(`  WOULD MIGRATE: ${t.slug} (${t.name}) — source: ${source}`)
    }
  }

  console.log('\n' + '─'.repeat(50))
  console.log(`  Would migrate:  ${wouldMigrate}`)
  console.log(`  Already migrated: ${alreadyMigrated}`)
  console.log(`  Skipped (no data): ${skippedNoData}`)
  console.log('─'.repeat(50))

  // Also show total tenants count for context
  const totalTenants = await Tenant.countDocuments()
  console.log(`  Total tenants in DB: ${totalTenants}`)

  await mongoose.disconnect()
}

dryRun().catch(err => {
  console.error('Dry-run failed:', err)
  process.exit(1)
})
