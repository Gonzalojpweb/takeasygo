import mongoose from 'mongoose'

/**
 * Diagnóstico de comisiones: compara tenant.commissionBalance.transfer
 * contra la suma real de payment.platformFeeAmount en las órdenes.
 *
 * Uso:
 *   npx tsx scripts/diagnose-commissions.ts <tenant-slug>
 *   npx tsx scripts/diagnose-commissions.ts --all
 */
async function run() {
  const arg = process.argv[2]
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/takeasygo'
  await mongoose.connect(uri)

  const db = mongoose.connection.db!
  const tenantFilter = arg && arg !== '--all' ? { slug: arg } : {}

  const tenants = await db.collection('tenants').find(tenantFilter).toArray()

  console.log(`\n${'='.repeat(70)}`)
  console.log(`DIAGNÓSTICO DE COMISIONES — ${tenants.length} tenant(s)`)
  console.log(`${'='.repeat(70)}\n`)

  for (const tenant of tenants) {
    const tenantId = tenant._id
    const balance = tenant.commissionBalance?.transfer ?? 0

    // Suma real de comisiones en órdenes no canceladas, pago aprobado
    const orders = await db.collection('orders').find({
      tenantId,
      deletedAt: null,
      status: { $ne: 'cancelled' },
      'payment.status': 'approved',
    }).project({
      'payment.platformFeeAmount': 1,
      'payment.method': 1,
      'payment.commissionBalanceAdded': 1,
      status: 1,
      orderNumber: 1,
      createdAt: 1,
    }).toArray()

    let totalCommission = 0
    let flaggedCommission = 0
    let flaggedCount = 0
    const methodBreakdown: Record<string, number> = {}

    for (const order of orders) {
      const fee = order.payment?.platformFeeAmount ?? 0
      const method = order.payment?.method ?? 'unknown'
      totalCommission += fee
      methodBreakdown[method] = (methodBreakdown[method] || 0) + fee
      if (order.payment?.commissionBalanceAdded) {
        flaggedCommission += fee
        flaggedCount++
      }
    }

    // Órdenes canceladas con flag activo (inconsistencia)
    const cancelledFlagged = await db.collection('orders').find({
      tenantId,
      status: 'cancelled',
      'payment.commissionBalanceAdded': true,
    }).project({ 'payment.platformFeeAmount': 1, orderNumber: 1 }).toArray()

    const cancelledFlaggedAmount = cancelledFlagged.reduce(
      (s, o) => s + (o.payment?.platformFeeAmount ?? 0), 0
    )

    const diff = balance - totalCommission

    console.log(`Tenant: ${tenant.name} (${tenant.slug})`)
    console.log(`  commissionBalance.transfer:  $${(balance / 100).toFixed(2)}`)
    console.log(`  Suma real platformFeeAmount: $${(totalCommission / 100).toFixed(2)}`)
    console.log(`  Diferencia:                 $${(diff / 100).toFixed(2)} ${diff !== 0 ? '⚠️  MISMATCH' : '✅ OK'}`)
    console.log(`  `)
    console.log(`  Órdenes con flag (incremento aplicado): ${flaggedCount}`)
    console.log(`  Monto con flag:                          $${(flaggedCommission / 100).toFixed(2)}`)
    console.log(`  Órdenes canceladas con flag activo:      ${cancelledFlagged.length} ($${(cancelledFlaggedAmount / 100).toFixed(2)})`)
    if (cancelledFlagged.length > 0) {
      console.log(`    ⚠️  Estas órdenes fueron canceladas pero el flag no se limpió — balance inflado`)
      for (const o of cancelledFlagged) {
        console.log(`    - Orden #${o.orderNumber}: $${((o.payment?.platformFeeAmount ?? 0) / 100).toFixed(2)}`)
      }
    }
    console.log(`  `)
    console.log(`  Desglose por método:`)
    for (const [method, amount] of Object.entries(methodBreakdown)) {
      console.log(`    ${method.padEnd(15)} $${(amount / 100).toFixed(2)}`)
    }

    if (diff !== 0) {
      console.log(`  `)
      console.log(`  🔧 SUGERENCIA: ejecutar fix-commission-inflation.ts --dry-run`)
    }

    console.log(`\n${'-'.repeat(70)}\n`)
  }

  await mongoose.disconnect()
}
run().catch(console.error)
