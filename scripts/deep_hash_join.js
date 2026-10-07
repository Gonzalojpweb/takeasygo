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

function quantile(arr, q) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const validOrders = await db.collection('orders').find({ 
    tenantId: { $in: [kekeTenantId, kekeStr] }, 
    status: { $nin: ['cancelled', 'CANCELLED'] } 
  }).toArray();

  const loyaltyMembers = await db.collection('loyaltymembers').find({ tenantId: { $in: [kekeTenantId, kekeStr] } }).toArray();

  console.log(`Loaded ${validOrders.length} valid orders and ${loyaltyMembers.length} loyalty members.`);

  // Build map of phoneHash -> loyalty member
  const memberHashMap = new Map();
  loyaltyMembers.forEach(m => {
    if (m.phoneHash) memberHashMap.set(m.phoneHash, m);
  });

  // Unique phoneHashes in orders
  const ordersByHash = {};
  validOrders.forEach(o => {
    const hash = o.customer?.phoneHash;
    if (hash) {
      if (!ordersByHash[hash]) ordersByHash[hash] = [];
      ordersByHash[hash].push(o);
    }
  });

  const uniquePurchasingHashes = Object.keys(ordersByHash);
  console.log(`Unique purchasing phoneHashes in orders: ${uniquePurchasingHashes.length}`);

  // Match orders to loyalty members via phoneHash
  let matchedOrdersCount = 0;
  let unmatchedOrdersCount = 0;
  const memberOrdersList = [];
  const nonMemberOrdersList = [];

  validOrders.forEach(o => {
    const hash = o.customer?.phoneHash;
    const total = o.totalAmount || o.total || o.amount || 0;
    const finalAmount = total > 100000 ? total / 100 : total;

    if (hash && memberHashMap.has(hash)) {
      matchedOrdersCount++;
      memberOrdersList.push({ order: o, ticket: finalAmount, member: memberHashMap.get(hash) });
    } else {
      unmatchedOrdersCount++;
      nonMemberOrdersList.push({ order: o, ticket: finalAmount });
    }
  });

  console.log(`\nMatched Orders to Loyalty Members via phoneHash: ${matchedOrdersCount} / ${validOrders.length} (${((matchedOrdersCount/validOrders.length)*100).toFixed(2)}%)`);
  console.log(`Unmatched Orders (Non-members): ${unmatchedOrdersCount} / ${validOrders.length} (${((unmatchedOrdersCount/validOrders.length)*100).toFixed(2)}%)`);

  // Tickets comparison
  const memberTickets = memberOrdersList.map(x => x.ticket);
  const nonMemberTickets = nonMemberOrdersList.map(x => x.ticket);

  console.log('\n--- TICKET COMPARISON: MEMBERS VS NON-MEMBERS ---');
  console.log('Member Orders Count:', memberTickets.length);
  console.log('Member Mean Ticket:', mean(memberTickets).toFixed(2));
  console.log('Member Median Ticket:', quantile(memberTickets, 0.5));
  console.log('Member P25 Ticket:', quantile(memberTickets, 0.25));
  console.log('Member P75 Ticket:', quantile(memberTickets, 0.75));
  console.log('Non-Member Orders Count:', nonMemberTickets.length);
  console.log('Non-Member Mean Ticket:', mean(nonMemberTickets).toFixed(2));
  console.log('Non-Member Median Ticket:', quantile(nonMemberTickets, 0.5));
  console.log('Non-Member P25 Ticket:', quantile(nonMemberTickets, 0.25));
  console.log('Non-Member P75 Ticket:', quantile(nonMemberTickets, 0.75));

  // Recurrence Analysis via phoneHash
  console.log('\n--- RECURRENCE ANALYSIS VIA PHONEHASH ---');
  const orderCountsPerCustomer = uniquePurchasingHashes.map(h => ordersByHash[h].length);
  const customersWith1Order = orderCountsPerCustomer.filter(c => c === 1).length;
  const customersWith2Orders = orderCountsPerCustomer.filter(c => c === 2).length;
  const customersWith3PlusOrders = orderCountsPerCustomer.filter(c => c >= 3).length;

  console.log('Total Purchasing Customers (Unique Hashes):', uniquePurchasingHashes.length);
  console.log('1-time buyers:', customersWith1Order, `(${((customersWith1Order/uniquePurchasingHashes.length)*100).toFixed(2)}%)`);
  console.log('2-time buyers:', customersWith2Orders, `(${((customersWith2Orders/uniquePurchasingHashes.length)*100).toFixed(2)}%)`);
  console.log('3+ time buyers:', customersWith3PlusOrders, `(${((customersWith3PlusOrders/uniquePurchasingHashes.length)*100).toFixed(2)}%)`);

  // Max orders by a single customer
  const maxOrders = Math.max(...orderCountsPerCustomer);
  console.log('Max orders by a single customer hash:', maxOrders);

  // Repeat intervals in days
  const repeatIntervals = [];
  uniquePurchasingHashes.forEach(h => {
    const customerOrders = ordersByHash[h];
    if (customerOrders.length > 1) {
      const dates = customerOrders.map(o => new Date(o.createdAt || o.created_at)).sort((a,b) => a - b);
      for (let i = 1; i < dates.length; i++) {
        const diffDays = (dates[i] - dates[i-1]) / (1000 * 60 * 60 * 24);
        if (!isNaN(diffDays) && diffDays >= 0) {
          repeatIntervals.push(diffDays);
        }
      }
    }
  });

  console.log('Repeat Intervals (Days):', {
    count: repeatIntervals.length,
    mean: mean(repeatIntervals).toFixed(2),
    median: quantile(repeatIntervals, 0.5).toFixed(2),
    p25: quantile(repeatIntervals, 0.25).toFixed(2),
    p75: quantile(repeatIntervals, 0.75).toFixed(2),
    min: Math.min(...repeatIntervals, 0).toFixed(2),
    max: Math.max(...repeatIntervals, 0).toFixed(2)
  });

  // Time difference between Club Join Date and Order Date
  console.log('\n--- TIMING: CLUB JOINING VS FIRST PURCHASE ---');
  let joinedBeforeFirstPurchase = 0;
  let joinedWithinOneHour = 0;
  let joinedAfterFirstPurchase = 0;
  const diffHoursList = [];

  loyaltyMembers.forEach(m => {
    if (m.phoneHash && ordersByHash[m.phoneHash]) {
      const mOrders = ordersByHash[m.phoneHash];
      const firstOrderDate = new Date(Math.min(...mOrders.map(o => new Date(o.createdAt || o.created_at))));
      const joinDate = new Date(m.joinedAt || m.createdAt);

      const diffHours = (joinDate - firstOrderDate) / (1000 * 60 * 60);
      diffHoursList.push(diffHours);

      if (Math.abs(diffHours) <= 1) {
        joinedWithinOneHour++;
      } else if (diffHours < -1) {
        joinedBeforeFirstPurchase++;
      } else {
        joinedAfterFirstPurchase++;
      }
    }
  });

  console.log('Loyalty Members who made orders:', diffHoursList.length);
  console.log('Joined within 1 hour of purchase (checkout signup):', joinedWithinOneHour);
  console.log('Joined before purchase (>1 hr prior):', joinedBeforeFirstPurchase);
  console.log('Joined after purchase (>1 hr after):', joinedAfterFirstPurchase);

  await mongoose.disconnect();
}

run().catch(console.error);
