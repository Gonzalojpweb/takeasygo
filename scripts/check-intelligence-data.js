const mongoose = require('mongoose');

async function check() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/takeasygo';
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  // 1. CustomerEvent counts by type
  const events = await db.collection('customerevents').aggregate([
    { $group: { _id: '$type', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  console.log('=== CustomerEvent counts by type ===');
  if (events.length === 0) console.log('  (empty collection)');
  events.forEach(e => console.log('  ' + e._id + ': ' + e.count));

  // 2. Funnel events specifically
  const funnelTypes = ['menu_opened', 'product_view', 'cart_add', 'checkout_started', 'order_completed'];
  console.log('\n=== Funnel events (last 30 days) ===');
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  for (const t of funnelTypes) {
    const count = await db.collection('customerevents').countDocuments({ type: t, createdAt: { $gte: since30 } });
    console.log('  ' + t + ': ' + count);
  }

  // 3. CustomerProfile count
  const profiles = await db.collection('customerprofiles').countDocuments();
  console.log('\n=== CustomerProfiles total: ' + profiles + ' ===');

  // 4. TiaInsight count for today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const insightsToday = await db.collection('tiainsights').countDocuments({ generatedAt: { $gte: today } });
  console.log('=== TiaInsights today: ' + insightsToday + ' ===');

  // 5. Total TiaInsights
  const insightsTotal = await db.collection('tiainsights').countDocuments();
  console.log('=== TiaInsights total: ' + insightsTotal + ' ===');

  // 6. Check a few CustomerEvents to see what types exist
  const recentEvents = await db.collection('customerevents').find().sort({ createdAt: -1 }).limit(5).toArray();
  console.log('\n=== 5 most recent CustomerEvents ===');
  recentEvents.forEach(e => console.log('  ' + e.type + ' | ' + e.createdAt + ' | phoneHash: ' + (e.phoneHash || 'none')));

  await mongoose.disconnect();
}

check().catch(e => { console.error(e); process.exit(1); });
