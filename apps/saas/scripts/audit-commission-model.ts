import mongoose from 'mongoose'

/**
 * AUDITORÍA DE COMISIONES — Comparación modelo viejo vs nuevo
 *
 * Lee las órdenes de transferencia de las últimas 4 semanas y compara:
 *   - Monto cobrado (modelo viejo): order.payment.platformFeeAmount
 *   - Monto correcto (modelo nuevo): surcharge sobre subtotal solamente, sin delivery
 *
 * SOLO LECTURA — no modifica ningún documento.
 *
 * Uso: npx tsx scripts/audit-commission-model.ts
 */

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://pgonzalojose_db_user:6oXEemLauaEuPoaq@takeasygo.ssjlhfw.mongodb.net/?appName=takeasygo'

const c2p = (cents: number) => `$${(cents / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

async function run() {
  console.log('🔍 AUDITORÍA DE COMISIONES — Modelo viejo vs nuevo')
  console.log('⚠️  SOLO LECTURA — ningún documento será modificado')
  console.log('='.repeat(80))

  await mongoose.connect(MONGODB_URI, { bufferCommands: false, maxPoolSize: 5 })
  console.log('✅ Conectado a MongoDB\n')

  const db = mongoose.connection.db!

  // Últimas 4 semanas
  const now = new Date()
  const fourWeeksAgo = new Date(now)
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)

  // Buscar órdenes de transferencia + delivery confirmadas en las últimas 4 semanas
  const orders = await db.collection('orders').find({
    'payment.method': 'transfer',
    orderMode: 'delivery',
    status: { $nin: ['cancelled', 'open', 'awaiting_payment'] },
    'statusTimestamps.confirmedAt': { $gte: fourWeeksAgo, $lte: now },
  }, {
    projection: {
      tenantId: 1,
      orderNumber: 1,
      subtotal: 1,
      discountAmount: 1,
      deliveryCost: 1,
      total: 1,
      'payment.method': 1,
      'payment.baseTotal': 1,
      'payment.surchargePercent': 1,
      'payment.surchargeAmount': 1,
      'payment.platformFeeAmount': 1,
      'statusTimestamps.confirmedAt': 1,
    },
  }).sort({ 'statusTimestamps.confirmedAt': 1 }).toArray()

  console.log(`📋 Órdenes de transferencia + delivery encontradas: ${orders.length}\n`)

  if (orders.length === 0) {
    console.log('No hay órdenes para auditar.')
    await mongoose.disconnect()
    return
  }

  // Obtener configuración de plataforma para saber el % default de transfer
  const platformConfig = await db.collection('platformconfigs').findOne(
    { _id: 'platform' },
    { projection: { platformFees: 1 } }
  )
  const defaultTransferPercent = platformConfig?.platformFees?.takeasygoTransferCommissionPercent ?? 0
  console.log(`% default de transferencia de plataforma: ${defaultTransferPercent}%\n`)

  // Obtener tenants para mostrar nombres
  const tenantIds = [...new Set(orders.map((o: any) => o.tenantId.toString()))]
  const tenants = await db.collection('tenants').find(
    { _id: { $in: tenantIds.map(id => new mongoose.Types.ObjectId(id)) } },
    { projection: { name: 1, slug: 1, 'transfer.commissionPercent': 1 } }
  ).toArray()
  const tenantMap = new Map(tenants.map((t: any) => [t._id.toString(), t]))

  // Calcular diferencia para cada orden
  interface Row {
    tenantName: string
    tenantSlug: string
    orderNumber: string
    confirmedAt: Date
    subtotal: number
    deliveryCost: number
    surchargePercent: number
    oldCommission: number
    newCommission: number
    difference: number
  }

  const rows: Row[] = []
  let totalOld = 0
  let totalNew = 0

  for (const order of orders) {
    const tenant = tenantMap.get(order.tenantId.toString())
    const tenantName = tenant?.name ?? order.tenantId.toString()
    const tenantSlug = tenant?.slug ?? 'unknown'

    const subtotal = (order.subtotal || 0) - (order.discountAmount || 0)
    const deliveryCost = order.deliveryCost || 0
    const surchargePercent = order.payment?.surchargePercent ?? 0
    const oldCommission = order.payment?.platformFeeAmount ?? 0

    // Modelo nuevo: recargo sobre subtotal (sin delivery)
    let newCommission: number
    if (surchargePercent > 0) {
      // Tenant tiene recargo → comisión = recargo cobrado al cliente
      newCommission = Math.round(subtotal * surchargePercent / 100)
    } else {
      // Tenant sin recargo → comisión = % default de plataforma sobre subtotal
      newCommission = Math.ceil(subtotal * defaultTransferPercent / 100)
    }

    const difference = newCommission - oldCommission
    totalOld += oldCommission
    totalNew += newCommission

    rows.push({
      tenantName,
      tenantSlug,
      orderNumber: order.orderNumber,
      confirmedAt: order.statusTimestamps?.confirmedAt,
      subtotal,
      deliveryCost,
      surchargePercent,
      oldCommission,
      newCommission,
      difference,
    })
  }

  // ── Tabla detallada por orden ──
  console.log('═'.repeat(80))
  console.log('DETALLE POR ORDEN')
  console.log('═'.repeat(80))
  console.log(
    'Orden'.padEnd(20) +
    'Fecha'.padEnd(12) +
    'Subtotal'.padStart(12) +
    'Delivery'.padStart(12) +
    'Recargo%'.padStart(9) +
    'Cobrado'.padStart(12) +
    'Correcto'.padStart(12) +
    'Diferencia'.padStart(12)
  )
  console.log('-'.repeat(80))

  for (const r of rows) {
    const date = r.confirmedAt ? new Date(r.confirmedAt).toLocaleDateString('es-AR') : 'N/A'
    const sign = r.difference >= 0 ? '+' : ''
    console.log(
      r.orderNumber.padEnd(20) +
      date.padEnd(12) +
      c2p(r.subtotal).padStart(12) +
      c2p(r.deliveryCost).padStart(12) +
      `${r.surchargePercent}%`.padStart(9) +
      c2p(r.oldCommission).padStart(12) +
      c2p(r.newCommission).padStart(12) +
      `${sign}${c2p(r.difference)}`.padStart(12)
    )
  }

  // ── Resumen por tenant ──
  console.log('\n' + '═'.repeat(80))
  console.log('RESUMEN POR TENANT')
  console.log('═'.repeat(80))

  const byTenant = new Map<string, { name: string; slug: string; old: number; new: number; count: number }>()
  for (const r of rows) {
    const key = r.tenantSlug
    if (!byTenant.has(key)) {
      byTenant.set(key, { name: r.tenantName, slug: r.tenantSlug, old: 0, new: 0, count: 0 })
    }
    const t = byTenant.get(key)!
    t.old += r.oldCommission
    t.new += r.newCommission
    t.count++
  }

  console.log(
    'Tenant'.padEnd(25) +
    'Órdenes'.padStart(8) +
    'Cobrado'.padStart(14) +
    'Correcto'.padStart(14) +
    'Diferencia'.padStart(14) +
    'Desvío%'.padStart(10)
  )
  console.log('-'.repeat(80))

  for (const [, t] of byTenant) {
    const diff = t.new - t.old
    const sign = diff >= 0 ? '+' : ''
    const pct = t.old > 0 ? ((diff / t.old) * 100).toFixed(1) : 'N/A'
    console.log(
      `${t.name} (${t.slug})`.padEnd(25) +
      `${t.count}`.padStart(8) +
      c2p(t.old).padStart(14) +
      c2p(t.new).padStart(14) +
      `${sign}${c2p(diff)}`.padStart(14) +
      `${pct}%`.padStart(10)
    )
  }

  // ── Total general ──
  const totalDiff = totalNew - totalOld
  const totalSign = totalDiff >= 0 ? '+' : ''
  const totalPct = totalOld > 0 ? ((totalDiff / totalOld) * 100).toFixed(1) : 'N/A'

  console.log('\n' + '═'.repeat(80))
  console.log('TOTAL GENERAL')
  console.log('═'.repeat(80))
  console.log(`  Total cobrado (modelo viejo):   ${c2p(totalOld)}`)
  console.log(`  Total correcto (modelo nuevo):  ${c2p(totalNew)}`)
  console.log(`  Diferencia:                     ${totalSign}${c2p(totalDiff)} (${totalPct}%)`)
  console.log(`  Órdenes auditadas:              ${orders.length}`)

  if (totalDiff < 0) {
    console.log('\n📊 Interpretación: el modelo viejo cobró MÁS de lo correcto')
    console.log('   (por incluir delivery en la base de cálculo de la comisión)')
  } else if (totalDiff > 0) {
    console.log('\n📊 Interpretación: el modelo viejo cobró MENOS de lo correcto')
  } else {
    console.log('\n📊 Los modelos producen el mismo resultado')
  }

  await mongoose.disconnect()
  console.log('\n✅ Desconectado. Script finalizado (solo lectura, sin modificaciones).')
}

run().catch(err => {
  console.error('❌ Error:', err)
  process.exit(1)
})
