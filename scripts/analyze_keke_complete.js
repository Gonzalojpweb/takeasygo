const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Load env
let envPath = path.join(__dirname, '../apps/saas/.env.local');
if (!fs.existsSync(envPath)) envPath = path.join(__dirname, '../.env');
if (!fs.existsSync(envPath)) envPath = path.join(__dirname, '../apps/saas/.env');

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    process.env[t.slice(0,eq).trim()] = t.slice(eq+1).trim();
  }
}

const kekeTenantId = new mongoose.Types.ObjectId('69f8bf6ad3fcc97fd64bec87');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  console.log('=== 1. VERIFICATION OF REFERENCE COUNTS & ALL COLLECTIONS FOR KEKE&LARRY ===');
  
  // Orders
  const totalOrders = await db.collection('orders').countDocuments({ tenantId: kekeTenantId });
  const validOrders = await db.collection('orders').countDocuments({ tenantId: kekeTenantId, status: { $ne: 'CANCELLED' } });
  const cancelledOrders = await db.collection('orders').countDocuments({ tenantId: kekeTenantId, status: 'CANCELLED' });
  console.log(`Orders -> Total: ${totalOrders}, Valid: ${validOrders}, Cancelled: ${cancelledOrders}`);

  // Status breakdown of orders
  const orderStatuses = await db.collection('orders').aggregate([
    { $match: { tenantId: kekeTenantId } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]).toArray();
  console.log('Order Statuses:', orderStatuses);

  // Consumers / Customer Base
  const totalConsumers = await db.collection('consumers').countDocuments({ tenantId: kekeTenantId }).catch(() => 0);
  const totalProfiles = await db.collection('customerprofiles').countDocuments({ tenantId: kekeTenantId }).catch(() => 0);
  console.log(`Consumers collection count: ${totalConsumers}, CustomerProfiles count: ${totalProfiles}`);

  // Unique customers with orders
  const uniquePurchasingCustomers = (await db.collection('orders').distinct('customerPhone', { tenantId: kekeTenantId, status: { $ne: 'CANCELLED' } })).length;
  console.log(`Unique purchasing customers (by phone): ${uniquePurchasingCustomers}`);

  // Loyalty / Club Members
  const totalLoyaltyMembers = await db.collection('loyaltymembers').countDocuments({ tenantId: kekeTenantId });
  console.log(`Loyalty Members count: ${totalLoyaltyMembers}`);

  // CustomerEvents
  const totalCustomerEvents = await db.collection('customerevents').countDocuments({ tenantId: kekeTenantId });
  console.log(`CustomerEvents total count: ${totalCustomerEvents}`);

  // Event types in CustomerEvents
  const eventTypeCounts = await db.collection('customerevents').aggregate([
    { $match: { tenantId: kekeTenantId } },
    { $group: { _id: '$type', count: { $sum: 1 }, uniquePhones: { $addToSet: '$phoneHash' }, uniqueSessions: { $addToSet: '$sessionId' } } },
    { $project: { type: '$_id', count: 1, uniqueUsers: { $size: '$uniquePhones' }, uniqueSessions: { $size: '$uniqueSessions' } } },
    { $sort: { count: -1 } }
  ]).toArray();
  console.log('CustomerEvent types breakdown:');
  console.table(eventTypeCounts);

  // Customer Journeys / Menu Visits
  const totalMenuVisits = await db.collection('menuvisits').countDocuments({ tenantId: kekeTenantId }).catch(() => 0);
  console.log(`MenuVisits count: ${totalMenuVisits}`);

  // Unique sessions in CustomerEvents
  const uniqueSessionsEvents = (await db.collection('customerevents').distinct('sessionId', { tenantId: kekeTenantId })).length;
  console.log(`Unique sessionId in CustomerEvents: ${uniqueSessionsEvents}`);

  // Store Items / Products / Customizations
  const storeItemsCount = await db.collection('storeitems').countDocuments({ tenantId: kekeTenantId });
  console.log(`StoreItems (products/variants) count: ${storeItemsCount}`);

  // Promotions & QR Promos & QR Promo Views
  const promotionsCount = await db.collection('promotions').countDocuments({ tenantId: kekeTenantId }).catch(() => 0);
  const qrPromosCount = await db.collection('qrpromos').countDocuments({ tenantId: kekeTenantId }).catch(() => 0);
  const qrPromoViewsCount = await db.collection('qrpromoviews').countDocuments({ tenantId: kekeTenantId }).catch(() => 0);
  console.log(`Promotions: ${promotionsCount}, QR Promos: ${qrPromosCount}, QR Promo Views: ${qrPromoViewsCount}`);

  // Feedbacks / Ratings
  const feedbacksCount = await db.collection('feedbacks').countDocuments({ tenantId: kekeTenantId }).catch(() => 0);
  const ratingsCount = await db.collection('ratings').countDocuments({ tenantId: kekeTenantId }).catch(() => 0);
  console.log(`Feedbacks: ${feedbacksCount}, Ratings: ${ratingsCount}`);

  // Store Redemptions
  const storeRedemptionsCount = await db.collection('storeredemptions').countDocuments({ tenantId: kekeTenantId }).catch(() => 0);
  console.log(`Store Redemptions: ${storeRedemptionsCount}`);

  await mongoose.disconnect();
}

run().catch(console.error);
