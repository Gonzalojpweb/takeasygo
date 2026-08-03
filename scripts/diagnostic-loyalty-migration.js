const mongoose = require('mongoose');

const uri = 'mongodb+srv://pgonzalojose_db_user:6oXEemLauaEuPoaq@takeasygo.ssjlhfw.mongodb.net/?appName=takeasygo';

(async () => {
  await mongoose.connect(uri, { dbName: 'test' });
  const db = mongoose.connection.db;

  console.log('=== LoyaltyMember Migration Diagnostic ===\n');

  // 1. Total LoyaltyMember count
  const totalCount = await db.collection('loyaltymembers').countDocuments();
  console.log(`1. Total LoyaltyMember count: ${totalCount}`);

  // 2. LoyaltyMember with phoneHash (non-null, non-empty)
  const withPhoneHash = await db.collection('loyaltymembers').countDocuments({
    phoneHash: { $type: 'string', $gt: '' }
  });
  console.log(`2. LoyaltyMember with phoneHash: ${withPhoneHash}`);

  // 3. Orders with loyaltyPointsCredited: true
  const creditedOrders = await db.collection('orders').countDocuments({
    loyaltyPointsCredited: true
  });
  console.log(`3. Orders with loyaltyPointsCredited: ${creditedOrders}`);

  // 4. Distinct tenants with loyalty members
  const tenantsWithMembers = await db.collection('loyaltymembers').distinct('tenantId');
  console.log(`4. Distinct tenants with loyalty members: ${tenantsWithMembers.length}`);

  // 5. Distribution of members per tenant (min, max, average)
  const distribution = await db.collection('loyaltymembers').aggregate([
    { $group: { _id: '$tenantId', count: { $sum: 1 } } },
    {
      $group: {
        _id: null,
        min: { $min: '$count' },
        max: { $max: '$count' },
        avg: { $avg: '$count' },
        totalTenants: { $sum: 1 },
        totalMembers: { $sum: '$count' }
      }
    }
  ]).toArray();

  if (distribution.length > 0) {
    const d = distribution[0];
    console.log(`5. Members per tenant distribution:`);
    console.log(`   Min: ${d.min}, Max: ${d.max}, Avg: ${Math.round(d.avg)}`);
    console.log(`   Total tenants: ${d.totalTenants}, Total members: ${d.totalMembers}`);
  }

  // 6. Orders that could be used for reconstruction (have customer.phoneHash AND locationId)
  const reconstructable = await db.collection('orders').countDocuments({
    'customer.phoneHash': { $type: 'string', $gt: '' },
    locationId: { $exists: true, $ne: null }
  });
  console.log(`6. Orders with customer.phoneHash AND locationId (reconstructable): ${reconstructable}`);

  // BONUS: Top 10 tenants by member count
  console.log('\n--- Top 10 tenants by member count ---');
  const topTenants = await db.collection('loyaltymembers').aggregate([
    { $group: { _id: '$tenantId', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]).toArray();
  for (const t of topTenants) {
    console.log(`   ${t._id}: ${t.count} members`);
  }

  // BONUS: Total orders in database
  const totalOrders = await db.collection('orders').countDocuments();
  console.log(`\nTotal orders in database: ${totalOrders}`);

  // BONUS: Orders with any phoneHash (regardless of locationId)
  const ordersWithPhoneHash = await db.collection('orders').countDocuments({
    'customer.phoneHash': { $type: 'string', $gt: '' }
  });
  console.log(`Orders with customer.phoneHash (any): ${ordersWithPhoneHash}`);

  // BONUS: Check how many tenants have multiple locations
  const tenantsWithLocations = await db.collection('locations').aggregate([
    { $group: { _id: '$tenantId', locationCount: { $sum: 1 } } },
    { $match: { locationCount: { $gt: 1 } } },
    { $sort: { locationCount: -1 } }
  ]).toArray();
  console.log(`\nTenants with multiple locations: ${tenantsWithLocations.length}`);
  for (const t of tenantsWithLocations.slice(0, 10)) {
    console.log(`   ${t._id}: ${t.locationCount} locations`);
  }

  // BONUS: LoyaltyMember distribution by source
  const bySource = await db.collection('loyaltymembers').aggregate([
    { $group: { _id: '$source', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  console.log('\nLoyaltyMember by source:');
  for (const s of bySource) {
    console.log(`   ${s._id || 'null'}: ${s.count}`);
  }

  process.exit();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
