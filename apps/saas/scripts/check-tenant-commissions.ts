import mongoose from 'mongoose'

/**
 * Diagnóstico puntual de UN tenant: muestra cada orden, su comisión,
 * y compara contra commissionBalance.transfer.
 *
 * Uso:
 *   MONGODB_URI="mongodb+srv://..." npx tsx scripts/check-tenant-commissions.ts que-cachapa
 */
async function run() {
  const slug = process.argv[2]
  if (!slug) {
    console.error('Uso: npx tsx scripts/check-tenant-commissions.ts <tenant-slug>')
    process.exit(1)
  }

  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('Setear MONGODB_URI')
    process.exit(1)
  }

  await mongoose.connect(uri)
  const db = mongoose.connection.db!

  const tenant = await db.collection('tenants').findOne({ slug })
  if (!tenant) {
    console.error(`Tenant "${slug}" no encontrado`)
    process.exit(1)
  }

  const balance = tenant.commissionBalance?.transfer ?? 0

  console.log(`\n${'='.repeat(70)}`)
  console.log(`TENANT: ${tenant.name} (${tenant.slug})`)
  console.log(`${'='.repeat(70)}`)
  console.log(`commissionBalance.transfer (en DB):  $${(balance / 100).toFixed(2)}`)
  console.log(`commissionThreshold: ${tenant.commissionThreshold ?? '(null)'}`)
  console.log()

  // ── TODAS las órdenes (no canceladas) ──
  const allOrders = await db.collection('orders').find({
    tenantId: tenant._id,
    deletedAt: null,
    status: { $ne: 'cancelled' },
  }).project({
    orderNumber: 1,
    status: 1,
    orderMode: 1,
    'payment.method': 1,
    'payment.status': 1,
    'payment.platformFeeAmount': 1,
    'payment.surchargeAmount': 1,
    'payment.baseTotal': 1,
    'payment.commissionBalanceAdded': 1,
    total: 1,
    createdAt: 1,
  }).sort({ createdAt: 1 }).toArray()

  console.log(`Órdenes NO canceladas: ${allOrders.length}`)
  console.log(`${'-'.repeat(70)}`)

  let sumAll = 0
  let sumTransferApproved = 0
  let sumFlagged = 0

  for (const o of allOrders) {
    const fee = o.payment?.platformFeeAmount ?? 0
    const method = o.payment?.method ?? '?'
    const pStatus = o.payment?.status ?? '?'
    const flag = o.payment?.commissionBalanceAdded ? '🟢 flag' : '🔴 sin flag'
    const mode = o.orderMode ?? '?'
    sumAll += fee
    if (method === 'transfer' && pStatus === 'approved') sumTransferApproved += fee
    if (o.payment?.commissionBalanceAdded) sumFlagged += fee

    console.log(
      `  #${o.orderNumber} | ${o.status.padEnd(20)} | ${mode.padEnd(10)} | ` +
      `${method.padEnd(14)} | pago:${pStatus.padEnd(9)} | ` +
      `comisión: $${(fee / 100).toFixed(2).padStart(10)} | ${flag} | ${o.createdAt?.toISOString().slice(0, 10)}`
    )
  }

  console.log(`${'-'.repeat(70)}`)
  console.log(`Suma platformFeeAmount (todas):        $${(sumAll / 100).toFixed(2)}`)
  console.log(`Suma solo transfer + approved:         $${(sumTransferApproved / 100).toFixed(2)}`)
  console.log(`Suma con flag commissionBalanceAdded:  $${(sumFlagged / 100).toFixed(2)}`)
  console.log()
  console.log(`Balance en DB:                         $${(balance / 100).toFixed(2)}`)

  const diff = balance - sumTransferApproved
  console.log(`Diferencia (balance − transfer approved): $${(diff / 100).toFixed(2)} ${diff !== 0 ? '⚠️  MISMATCH' : '✅ OK'}`)

  // ── Órdenes CANCELADAS con flag activo ──
  const cancelledFlagged = await db.collection('orders').find({
    tenantId: tenant._id,
    status: 'cancelled',
    'payment.commissionBalanceAdded': true,
  }).project({ orderNumber: 1, 'payment.platformFeeAmount': 1 }).toArray()

  if (cancelledFlagged.length > 0) {
    console.log(`\n⚠️  Órdenes CANCELADAS con flag activo (balance inflado):`)
    for (const o of cancelledFlagged) {
      console.log(`  #${o.orderNumber}: $${((o.payment?.platformFeeAmount ?? 0) / 100).toFixed(2)}`)
    }
  }

  // ── Settlements ──
  const settlements = await db.collection('commissionsettlements').find({
    tenantId: tenant._id,
  }).toArray()

  console.log(`\nSettlements registrados: ${settlements.length}`)
  for (const s of settlements) {
    console.log(`  $${((s.amountCollected ?? 0) / 100).toFixed(2)} — ${s.collectedBy} — ${s.createdAt?.toISOString().slice(0, 10)}`)
  }

  console.log(`\n${'='.repeat(70)}\n`)
  await mongoose.disconnect()
}
run().catch(console.error)
