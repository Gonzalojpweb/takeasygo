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

  const orders = await db.collection('orders').find({ tenantId: { $in: [kekeTenantId, kekeStr] } }).limit(10).toArray();

  console.log('--- FIRST 5 ORDERS FIELD NAMES ---');
  orders.slice(0, 5).forEach((o, i) => {
    console.log(`Order ${i+1}: keys =`, Object.keys(o));
    console.log(`  customer:`, o.customer);
    console.log(`  customerPhone:`, o.customerPhone);
    console.log(`  phone:`, o.phone);
    console.log(`  customerInfo:`, o.customerInfo);
    console.log(`  phoneHash:`, o.phoneHash);
    console.log(`  consumerId:`, o.consumerId);
  });

  await mongoose.disconnect();
}

run().catch(console.error);
