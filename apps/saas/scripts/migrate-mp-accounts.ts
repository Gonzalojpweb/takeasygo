/**
 * One-off migration: Move legacy MercadoPago credentials into mpAccounts[]
 *
 * Run once: npx tsx scripts/migrate-mp-accounts.ts
 *
 * For each tenant with mercadopago.isConfigured = true AND empty mpAccounts:
 *   - Creates one mpAccount entry with label "Cuenta principal"
 *   - Copies accessToken, publicKey, webhookSecret from legacy fields
 *   - Sets isActive = true
 *
 * For each tenant with mpOAuth.accessToken AND empty mpAccounts:
 *   - Creates one mpAccount entry with label "Cuenta principal"
 *   - Copies oauthAccessToken, oauthRefreshToken, oauthExpiresAt, oauthIsConnected
 *   - Sets isActive = true
 *
 * Idempotent: skips tenants that already have mpAccounts.
 */

import mongoose from 'mongoose'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(__dirname, '../.env') })

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
    publicKey: String,
    webhookSecret: String,
    sellerId: String,
  },
  mpOAuth: {
    accessToken: String,
    refreshToken: String,
    expiresAt: Date,
    isConnected: Boolean,
    authorizedAt: Date,
  },
  mpAccounts: [{
    label: String,
    accessToken: String,
    publicKey: String,
    webhookSecret: String,
    isActive: Boolean,
    oauthAccessToken: String,
    oauthRefreshToken: String,
    oauthExpiresAt: Date,
    oauthIsConnected: Boolean,
    oauthAuthorizedAt: Date,
    createdAt: Date,
  }],
}, { strict: false })

const Tenant = mongoose.model('Tenant', tenantSchema, 'tenants')

async function migrate() {
  await mongoose.connect(MONGODB_URI)
  console.log('Connected to MongoDB')

  const tenants = await Tenant.find({
    $or: [
      { 'mercadopago.isConfigured': true },
      { 'mpOAuth.accessToken': { $exists: true, $ne: null } },
    ],
    $or: [
      { mpAccounts: { $exists: false } },
      { mpAccounts: { $size: 0 } },
    ],
  })

  console.log(`Found ${tenants.length} tenant(s) to migrate`)

  let migrated = 0
  let skipped = 0

  for (const tenant of tenants) {
    const t = tenant as any

    // Already has accounts? Skip
    if (t.mpAccounts?.length) {
      skipped++
      continue
    }

    const hasLegacyMP = t.mercadopago?.isConfigured && t.mercadopago?.accessToken
    const hasOAuth = t.mpOAuth?.accessToken

    if (!hasLegacyMP && !hasOAuth) {
      skipped++
      continue
    }

    const account: any = {
      label: 'Cuenta principal',
      isActive: true,
      createdAt: new Date(),
    }

    if (hasLegacyMP) {
      account.accessToken = t.mercadopago.accessToken
      account.publicKey = t.mercadopago.publicKey || undefined
      account.webhookSecret = t.mercadopago.webhookSecret || undefined
    }

    if (hasOAuth) {
      account.oauthAccessToken = t.mpOAuth.accessToken
      account.oauthRefreshToken = t.mpOAuth.refreshToken || undefined
      account.oauthExpiresAt = t.mpOAuth.expiresAt || undefined
      account.oauthIsConnected = t.mpOAuth.isConnected || false
      account.oauthAuthorizedAt = t.mpOAuth.authorizedAt || undefined
    }

    await Tenant.updateOne(
      { _id: t._id },
      { $push: { mpAccounts: account } }
    )

    console.log(`  ✓ ${t.slug} (${t.name}) → migrated`)
    migrated++
  }

  console.log(`\nMigration complete: ${migrated} migrated, ${skipped} skipped`)
  await mongoose.disconnect()
}

migrate().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
