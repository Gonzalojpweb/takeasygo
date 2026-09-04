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

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const tid = new mongoose.Types.ObjectId('69f8bf6ad3fcc97fd64bec87');
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Exact same query as funnel API
  const agg = await db.collection('customerevents').aggregate([
    { $match: { tenantId: tid, createdAt: { $gte: since }, type: { $in: ['menu_opened','product_view','cart_add','checkout_started','order_completed'] } } },
    { $group: { _id: '$type', count: { $sum: 1 } } }
  ]).toArray();
  
  console.log('Funnel query result (with createdAt filter):');
  const map = {};
  agg.forEach(a => { map[a._id] = a.count; });
  ['menu_opened','product_view','cart_add','checkout_started','order_completed'].forEach(t => {
    console.log('  ' + t + ': ' + (map[t] || 0));
  });

  // WITHOUT createdAt filter
  const agg2 = await db.collection('customerevents').aggregate([
    { $match: { tenantId: tid, type: { $in: ['menu_opened','product_view','cart_add','checkout_started','order_completed'] } } },
    { $group: { _id: '$type', count: { $sum: 1 } } }
  ]).toArray();
  
  console.log('\nFunnel query result (NO createdAt filter):');
  const map2 = {};
  agg2.forEach(a => { map2[a._id] = a.count; });
  ['menu_opened','product_view','cart_add','checkout_started','order_completed'].forEach(t => {
    console.log('  ' + t + ': ' + (map2[t] || 0));
  });

  // Sample product_view events
  const sample = await db.collection('customerevents').find({ type: 'product_view', tenantId: tid }).limit(3).toArray();
  console.log('\nSample product_view events:');
  sample.forEach(e => console.log('  createdAt=' + e.createdAt + ' type=' + e.type));

  // Check if createdAt is missing
  const noDate = await db.collection('customerevents').countDocuments({ type: 'product_view', tenantId: tid, createdAt: { $exists: false } });
  console.log('\nproduct_view without createdAt: ' + noDate);

  // Check CustomerProfile
  const profiles = await db.collection('customerprofiles').find({ tenantId: tid }).limit(3).toArray();
  console.log('\nSample CustomerProfiles:');
  profiles.forEach(p => console.log('  phoneHash=' + p.phoneHash + ' segment=' + p.segment + ' orderCount=' + p.orderCount));

  await mongoose.disconnect();
}
check().catch(e => { console.error(e); process.exit(1); });
