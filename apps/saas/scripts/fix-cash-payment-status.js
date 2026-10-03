const { MongoClient } = require('mongodb')

async function run() {
  const c = new MongoClient(process.env.MONGODB_URI)
  await c.connect()
  const db = c.db()

  const affected = await db
    .collection('orders')
    .find({
      'payment.method': 'cash',
      'payment.status': 'pending',
      deletedAt: null,
    })
    .project({ orderNumber: 1, status: 1, 'payment.status': 1, total: 1, createdAt: 1 })
    .toArray()

  console.log('Cash orders con payment.status=pending:', affected.length)
  const byStatus = {}
  for (const o of affected) {
    byStatus[o.status] = (byStatus[o.status] || 0) + 1
  }
  console.log('Por estado de orden:', JSON.stringify(byStatus, null, 2))
  const byTenant = {}
  for (const o of affected) {
    const t = String(o.tenantId)
    byTenant[t] = (byTenant[t] || 0) + 1
  }
  console.log('Top tenants:', Object.entries(byTenant).sort((a, b) => b[1] - a[1]).slice(0, 10))

  if (process.argv[2] === '--fix') {
    const res = await db.collection('orders').updateMany(
      { 'payment.method': 'cash', 'payment.status': 'pending', deletedAt: null },
      { $set: { 'payment.status': 'approved' } }
    )
    console.log('FIX aplicado — modificados:', res.modifiedCount)
  } else {
    console.log('(dry run — pasá --fix para corregir)')
  }

  await c.close()
}
run().catch((e) => {
  console.error('ERROR:', e.message)
  process.exit(1)
})
