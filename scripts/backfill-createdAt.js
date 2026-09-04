const path = require('path');
const fs = require('fs');
const mongoose = require(path.join(__dirname, '../apps/saas/node_modules/mongoose'));

const content = fs.readFileSync(path.join(__dirname, '../apps/saas/.env.local'), 'utf-8');
for (const line of content.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq === -1) continue;
  process.env[t.slice(0,eq).trim()] = t.slice(eq+1).trim();
}

async function backfill() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  // Set createdAt = _id.getTimestamp() for events missing createdAt
  // (ObjectId encodes creation time)
  const result = await db.collection('customerevents').updateMany(
    { createdAt: { $exists: false } },
    [{ $set: { createdAt: { $toDate: '$_id' } } }]
  );
  console.log('Backfilled ' + result.modifiedCount + ' events with createdAt from ObjectId');

  // Verify
  const noDate = await db.collection('customerevents').countDocuments({ createdAt: { $exists: false } });
  console.log('Events still without createdAt: ' + noDate);

  // Verify funnel now works
  const tid = new mongoose.Types.ObjectId('69f8bf6ad3fcc97fd64bec87');
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const agg = await db.collection('customerevents').aggregate([
    { $match: { tenantId: tid, createdAt: { $gte: since }, type: { $in: ['menu_opened','product_view','cart_add','checkout_started','order_completed'] } } },
    { $group: { _id: '$type', count: { $sum: 1 } } }
  ]).toArray();
  console.log('\nFunnel after backfill:');
  const map = {};
  agg.forEach(a => { map[a._id] = a.count; });
  ['menu_opened','product_view','cart_add','checkout_started','order_completed'].forEach(t => {
    console.log('  ' + t + ': ' + (map[t] || 0));
  });

  await mongoose.disconnect();
}
backfill().catch(e => { console.error(e); process.exit(1); });
