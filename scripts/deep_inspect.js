const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

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
const kekeStr = '69f8bf6ad3fcc97fd64bec87';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  // Inspect Orders sample
  const sampleOrder = await db.collection('orders').findOne({ tenantId: { $in: [kekeTenantId, kekeStr] } });
  console.log('\n--- SAMPLE ORDER ---');
  console.log(JSON.stringify(sampleOrder, null, 2));

  // Inspect CustomerEvents sample for each type
  const eventTypes = await db.collection('customerevents').distinct('type', { tenantId: { $in: [kekeTenantId, kekeStr] } });
  console.log('\n--- CUSTOMER EVENT TYPES ---', eventTypes);
  for (const et of eventTypes) {
    const sampleEv = await db.collection('customerevents').findOne({ tenantId: { $in: [kekeTenantId, kekeStr] }, type: et });
    console.log(`\nSample CustomerEvent (${et}):`, JSON.stringify(sampleEv, null, 2));
  }

  // Inspect menuvisits sample
  const sampleMenuVisit = await db.collection('menuvisits').findOne({ tenantId: { $in: [kekeTenantId, kekeStr] } });
  console.log('\n--- SAMPLE MENU VISIT ---');
  console.log(JSON.stringify(sampleMenuVisit, null, 2));

  // Inspect loyaltymembers sample
  const sampleLoyalty = await db.collection('loyaltymembers').findOne({ tenantId: { $in: [kekeTenantId, kekeStr] } });
  console.log('\n--- SAMPLE LOYALTY MEMBER ---');
  console.log(JSON.stringify(sampleLoyalty, null, 2));

  // Inspect qrpromos & qrpromoviews sample
  const sampleQR = await db.collection('qrpromos').findOne({ tenantId: { $in: [kekeTenantId, kekeStr] } });
  console.log('\n--- SAMPLE QR PROMO ---');
  console.log(JSON.stringify(sampleQR, null, 2));

  const sampleQRView = await db.collection('qrpromoviews').findOne({ tenantId: { $in: [kekeTenantId, kekeStr] } });
  console.log('\n--- SAMPLE QR PROMO VIEW ---');
  console.log(JSON.stringify(sampleQRView, null, 2));

  // Inspect promotions sample
  const samplePromo = await db.collection('promotions').findOne({ tenantId: { $in: [kekeTenantId, kekeStr] } });
  console.log('\n--- SAMPLE PROMOTION ---');
  console.log(JSON.stringify(samplePromo, null, 2));

  // Inspect menus / storeitems
  const sampleMenu = await db.collection('menus').findOne({ tenantId: { $in: [kekeTenantId, kekeStr] } });
  console.log('\n--- SAMPLE MENU ---');
  console.log(JSON.stringify(sampleMenu ? { _id: sampleMenu._id, name: sampleMenu.name, categoriesCount: sampleMenu.categories ? sampleMenu.categories.length : 0 } : null, null, 2));

  await mongoose.disconnect();
}

run().catch(console.error);
