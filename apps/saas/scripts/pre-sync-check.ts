/**
 * Pre-sync check: dimensiona el dataset de Consumers para la sync a Google Contacts.
 * READ-ONLY — no modifica ningún dato.
 *
 * Ejecutar: npx tsx scripts/pre-sync-check.ts
 * Producción: npx tsx scripts/pre-sync-check.ts --confirm-prod
 */
import mongoose from 'mongoose'

async function run() {
  // ── Fix 4: Validate MONGODB_URI + production guard ─────────────────────
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('ERROR: MONGODB_URI no está configurada en el entorno.')
    process.exit(1)
  }

  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--confirm-prod')) {
    console.error('ERROR: No se puede correr este script contra producción sin --confirm-prod.')
    process.exit(1)
  }

  await mongoose.connect(uri)
  console.log(`Conectado a: ${mongoose.connection.db?.databaseName}\n`)

  // ── Fix 1: Solo el pipeline correcto con $unwind ───────────────────────
  const perTenant = await mongoose.connection.db!
    .collection('consumers')
    .aggregate([
      { $unwind: '$tenantIds' },
      {
        $group: {
          _id: '$tenantIds',
          count: { $sum: 1 },
          withPhone: {
            $sum: { $cond: [{ $ne: ['$phoneHash', null] }, 1, 0] },
          },
          withEmail: {
            $sum: { $cond: [{ $ne: ['$emailHash', null] }, 1, 0] },
          },
          withBoth: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ['$phoneHash', null] }, { $ne: ['$emailHash', null] }] },
                1, 0,
              ],
            },
          },
          loyaltyMembers: {
            $sum: { $cond: ['$isLoyaltyMember', 1, 0] },
          },
        },
      },
      { $sort: { count: -1 } },
    ])
    .toArray()

  // ── Agregados ──────────────────────────────────────────────────────────
  const counts = perTenant.map((t: any) => t.count).sort((a: number, b: number) => a - b)
  const totalTenants = counts.length
  const totalCount = counts.reduce((s: number, c: number) => s + c, 0)
  const minCount = counts[0] || 0
  const maxCount = counts[counts.length - 1] || 0
  const avgCount = totalTenants > 0 ? Math.round(totalCount / totalTenants) : 0
  const p95Index = Math.floor(totalTenants * 0.95)
  const p95 = counts[p95Index] || 0

  const totalWithPhone = perTenant.reduce((s: number, t: any) => s + t.withPhone, 0)
  const totalWithEmail = perTenant.reduce((s: number, t: any) => s + t.withEmail, 0)
  const totalWithBoth = perTenant.reduce((s: number, t: any) => s + t.withBoth, 0)
  const totalLoyalty = perTenant.reduce((s: number, t: any) => s + t.loyaltyMembers, 0)

  // ── Fix 5: source definido vs no definido ──────────────────────────────
  const sourceStats = await mongoose.connection.db!
    .collection('consumers')
    .aggregate([
      {
        $group: {
          _id: {
            $cond: [{ $eq: ['$source', null] }, 'undefined', 'defined'],
          },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray()

  const sourceDefined = sourceStats.find((s: any) => s._id === 'defined')?.count || 0
  const sourceUndefined = sourceStats.find((s: any) => s._id === 'undefined')?.count || 0

  // ── Reporte ────────────────────────────────────────────────────────────
  console.log('=== Pre-Sync Check Report ===')
  console.log(`Total Consumers: ${totalCount}`)
  console.log(`Tenants with consumers: ${totalTenants}`)
  console.log(`Min per tenant: ${minCount}`)
  console.log(`Max per tenant: ${maxCount}`)
  console.log(`Avg per tenant: ${avgCount}`)
  console.log(`P95 per tenant: ${p95}`)
  console.log(`\nSyncable (phone not null): ${totalWithPhone}`)
  console.log(`With email: ${totalWithEmail}`)
  console.log(`With both phone+email: ${totalWithBoth}`)
  console.log(`Loyalty members: ${totalLoyalty}`)
  console.log(`\nSource defined: ${sourceDefined}`)
  console.log(`Source undefined (need migration): ${sourceUndefined}`)

  // ── Top 10 tenants ─────────────────────────────────────────────────────
  console.log('\nTop 10 tenants by consumer count:')
  perTenant.slice(0, 10).forEach((t: any) => {
    console.log(`  ${t._id}: ${t.count} consumers`)
  })

  await mongoose.disconnect()
}

run().catch((err) => {
  console.error('Script failed:', err)
  process.exit(1)
})
