import mongoose from 'mongoose'

/**
 * Script de reconciliación histórica: corrige commissionBalance.transfer
 * inflado por cancelaciones pasadas sin reversión.
 *
 * Uso: npx tsx scripts/fix-commission-inflation.ts [--dry-run]
 *   --dry-run  muestra los cambios sin ejecutarlos
 */

async function run() {
  const isDryRun = process.argv.includes('--dry-run')
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/takeasygo'
  await mongoose.connect(uri)

  console.log(`\n=== RECONCILIACIÓN HISTÓRICA DE COMISIONES ===`)
  console.log(`Modo: ${isDryRun ? 'DRY RUN (sin cambios)' : 'EJECUCIÓN REAL'}\n`)

  // 1. Encontrar pedidos cancelados con platformFeeAmount > 0
  const cancelledOrders = await mongoose.connection.db!.collection('orders').find({
    status: 'cancelled',
    'payment.platformFeeAmount': { $gt: 0 },
    deletedAt: null,
  }).toArray()

  console.log(`Pedidos cancelados con comisión: ${cancelledOrders.length}`)

  // 2. Agrupar por tenant
  const byTenant = new Map<string, number>()
  for (const order of cancelledOrders) {
    const tid = order.tenantId.toString()
    byTenant.set(tid, (byTenant.get(tid) || 0) + (order.payment?.platformFeeAmount || 0))
  }

  // 3. Obtener tenants
  const tenantIds = [...byTenant.keys()].map(id => new mongoose.Types.ObjectId(id))
  const tenants = await mongoose.connection.db!.collection('tenants').find(
    { _id: { $in: tenantIds } },
    { projection: { name: 1, slug: 1, commissionBalance: 1 } }
  ).toArray()
  const tenantMap = Object.fromEntries(tenants.map((t: any) => [t._id.toString(), t]))

  let totalFixed = 0

  for (const [tenantId, inflatedAmount] of byTenant) {
    const tenant = tenantMap[tenantId]
    if (!tenant) continue

    const currentBalance = tenant.commissionBalance?.transfer || 0
    const newBalance = Math.max(0, currentBalance - inflatedAmount)
    const diff = currentBalance - newBalance

    console.log(`\n${tenant.name} (${tenant.slug}):`)
    console.log(`  Balance actual:     $${(currentBalance / 100).toLocaleString('es-AR')}`)
    console.log(`  Monto a revertir:   $${(inflatedAmount / 100).toLocaleString('es-AR')}`)
    console.log(`  Balance corregido:  $${(newBalance / 100).toLocaleString('es-AR')}`)

    if (!isDryRun && diff > 0) {
      await mongoose.connection.db!.collection('tenants').updateOne(
        { _id: new mongoose.Types.ObjectId(tenantId) },
        { $inc: { 'commissionBalance.transfer': -inflatedAmount } }
      )
      console.log(`  ✅ Balance corregido`)
    } else if (isDryRun) {
      console.log(`  ⏳ DRY RUN — sin cambios`)
    }

    totalFixed += inflatedAmount
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(`Total a corregir: $${(totalFixed / 100).toLocaleString('es-AR')}`)
  console.log(`Tenants afectados: ${byTenant.size}`)

  if (isDryRun) {
    console.log(`\nPara ejecutar: npx tsx scripts/fix-commission-inflation.ts`)
  }

  await mongoose.disconnect()
}
run().catch(console.error)
