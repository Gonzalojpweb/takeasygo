/**
 * Migración: convertir tenant.transfer (objeto único) a tenant.transferAccounts[] (array)
 *
 * Ejecutar con: npx tsx apps/saas/scripts/migrate-transfer-accounts.ts
 *
 * Solo migra tenants que:
 *   1. Tengan transfer.alias no nulo/vacío (datos bancarios configurados)
 *   2. NO tengan transferAccounts ya configurados
 *
 * La migración es idempotente: si ya se ejecutó, no duplica datos.
 * El campo transfer legacy se mantiene como fallback.
 */

import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL
if (!MONGODB_URI) {
  console.error('MONGODB_URI or DATABASE_URL is required')
  process.exit(1)
}

interface TenantDoc {
  _id: mongoose.Types.ObjectId
  name: string
  slug: string
  transfer?: {
    enabled?: boolean
    alias?: string | null
    cbu?: string | null
    cvu?: string | null
    bankName?: string | null
    holderName?: string | null
  }
  transferAccounts?: any[]
}

async function migrate() {
  console.log('🔗 Connecting to MongoDB...')
  await mongoose.connect(MONGODB_URI!)
  console.log('✅ Connected\n')

  const db = mongoose.connection.db!
  const tenants = db.collection('tenants')

  // Find tenants with legacy transfer data but no transferAccounts
  const cursor = tenants.find({
    'transfer.alias': { $exists: true, $ne: null, $ne: '' },
    $or: [
      { transferAccounts: { $exists: false } },
      { transferAccounts: { $size: 0 } },
    ],
  })

  let migrated = 0
  let skipped = 0

  while (await cursor.hasNext()) {
    const tenant = await cursor.next() as unknown as TenantDoc
    if (!tenant?.transfer?.alias) {
      skipped++
      continue
    }

    const transferAccount = {
      label: 'Cuenta Principal',
      alias: tenant.transfer.alias,
      cbu: tenant.transfer.cbu || null,
      cvu: tenant.transfer.cvu || null,
      bankName: tenant.transfer.bankName || null,
      holderName: tenant.transfer.holderName || null,
      isActive: true,
      createdAt: new Date(),
    }

    await tenants.updateOne(
      { _id: tenant._id },
      {
        $set: {
          transferAccounts: [transferAccount],
        },
      }
    )

    migrated++
    console.log(`  ✅ ${tenant.slug} (${tenant.name}) — migrated alias="${tenant.transfer.alias}"`)
  }

  console.log(`\n📊 Migration complete: ${migrated} migrated, ${skipped} skipped`)
  await mongoose.disconnect()
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
