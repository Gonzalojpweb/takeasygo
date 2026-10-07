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

  const results = {};

  // 1. DATA AUDIT & VERIFICATION OF REFERENCE COUNTS
  console.log('--- 1. DATA AUDIT & COUNTS ---');
  const totalOrders = await db.collection('orders').countDocuments({ tenantId: { $in: [kekeTenantId, kekeStr] } });
  const ordersByStatusRaw = await db.collection('orders').aggregate([
    { $match: { tenantId: { $in: [kekeTenantId, kekeStr] } } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]).toArray();

  const validOrders = await db.collection('orders').find({ 
    tenantId: { $in: [kekeTenantId, kekeStr] }, 
    status: { $nin: ['cancelled', 'CANCELLED'] } 
  }).toArray();

  const cancelledOrders = await db.collection('orders').find({ 
    tenantId: { $in: [kekeTenantId, kekeStr] }, 
    status: { $in: ['cancelled', 'CANCELLED'] } 
  }).toArray();

  const allOrders = await db.collection('orders').find({ tenantId: { $in: [kekeTenantId, kekeStr] } }).toArray();

  // Date range of orders
  const orderDates = allOrders.map(o => new Date(o.createdAt || o.created_at)).filter(d => !isNaN(d));
  const minOrderDate = new Date(Math.min(...orderDates));
  const maxOrderDate = new Date(Math.max(...orderDates));

  results.dataAudit = {
    totalOrdersInDB: totalOrders,
    validOrdersCount: validOrders.length,
    cancelledOrdersCount: cancelledOrders.length,
    orderStatusBreakdown: ordersByStatusRaw,
    minOrderDate: minOrderDate.toISOString(),
    maxOrderDate: maxOrderDate.toISOString(),
  };

  // Customers (by phone in orders)
  const phoneToOrdersMap = {};
  validOrders.forEach(o => {
    const phone = o.customerPhone || o.phone || (o.customer && o.customer.phone) || (o.customerInfo && o.customerInfo.phone) || 'unknown';
    if (!phoneToOrdersMap[phone]) phoneToOrdersMap[phone] = [];
    phoneToOrdersMap[phone].push(o);
  });

  const uniquePurchasingPhones = Object.keys(phoneToOrdersMap).filter(p => p !== 'unknown');

  // Customer profiles
  const profilesCount = await db.collection('customerprofiles').countDocuments({ tenantId: { $in: [kekeTenantId, kekeStr] } });
  const loyaltyMembersCount = await db.collection('loyaltymembers').countDocuments({ tenantId: { $in: [kekeTenantId, kekeStr] } });
  const loyaltyMembers = await db.collection('loyaltymembers').find({ tenantId: { $in: [kekeTenantId, kekeStr] } }).toArray();

  // Events & MenuVisits
  const totalCustomerEvents = await db.collection('customerevents').countDocuments({ tenantId: { $in: [kekeTenantId, kekeStr] } });
  const customerEventBreakdown = await db.collection('customerevents').aggregate([
    { $match: { tenantId: { $in: [kekeTenantId, kekeStr] } } },
    { $group: { _id: '$type', count: { $sum: 1 }, uniquePhones: { $addToSet: '$phoneHash' } } },
    { $project: { type: '$_id', count: 1, uniqueUsers: { $size: '$uniquePhones' } } },
    { $sort: { count: -1 } }
  ]).toArray();

  const menuVisitsCount = await db.collection('menuvisits').countDocuments({ tenantId: { $in: [kekeTenantId, kekeStr] } });
  const menuVisits = await db.collection('menuvisits').find({ tenantId: { $in: [kekeTenantId, kekeStr] } }).toArray();

  const qrPromosCount = await db.collection('qrpromos').countDocuments({ tenantId: { $in: [kekeTenantId, kekeStr] } });
  const qrPromoViewsCount = await db.collection('qrpromoviews').countDocuments({ tenantId: { $in: [kekeTenantId, kekeStr] } });
  const qrPromoViews = await db.collection('qrpromoviews').find({ tenantId: { $in: [kekeTenantId, kekeStr] } }).toArray();
  const promotionsCount = await db.collection('promotions').countDocuments({ tenantId: { $in: [kekeTenantId, kekeStr] } });
  const promotions = await db.collection('promotions').find({ tenantId: { $in: [kekeTenantId, kekeStr] } }).toArray();

  const feedbacks = await db.collection('feedbacks').find({ tenantId: { $in: [kekeTenantId, kekeStr] } }).toArray();

  results.dataAudit.uniquePurchasingPhones = uniquePurchasingPhones.length;
  results.dataAudit.customerProfilesCount = profilesCount;
  results.dataAudit.loyaltyMembersCount = loyaltyMembersCount;
  results.dataAudit.totalCustomerEvents = totalCustomerEvents;
  results.dataAudit.customerEventBreakdown = customerEventBreakdown;
  results.dataAudit.menuVisitsCount = menuVisitsCount;
  results.dataAudit.qrPromosCount = qrPromosCount;
  results.dataAudit.qrPromoViewsCount = qrPromoViewsCount;
  results.dataAudit.promotionsCount = promotionsCount;
  results.dataAudit.feedbacksCount = feedbacks.length;

  // 2. MENU VISITS / ENTRY / NAVEGACION
  console.log('--- 2. MENU VISITS / ENTRY ANALYSIS ---');
  const visitIPs = new Set();
  const visitsBySource = {};
  const visitsByDevice = {};
  const visitsByHour = Array(24).fill(0);
  const visitsByDayOfWeek = Array(7).fill(0); // 0 = Sun

  menuVisits.forEach(v => {
    if (v.ip) visitIPs.add(v.ip);
    const src = v.source || 'direct/unknown';
    visitsBySource[src] = (visitsBySource[src] || 0) + 1;

    const dev = v.deviceType || 'unknown';
    visitsByDevice[dev] = (visitsByDevice[dev] || 0) + 1;

    if (v.visitedAt) {
      const dt = new Date(v.visitedAt);
      if (!isNaN(dt)) {
        visitsByHour[dt.getUTCHours()]++;
        visitsByDayOfWeek[dt.getUTCDay()]++;
      }
    }
  });

  results.menuEntry = {
    totalMenuVisits: menuVisitsCount,
    uniqueIPs: visitIPs.size,
    visitsBySource,
    visitsByDevice,
    visitsByHour,
    visitsByDayOfWeek
  };

  // 3. PRODUCTS & ORDERS ANALYSIS (Sales, Combinations, Ticket, Sequences)
  console.log('--- 3. PRODUCTS & ORDERS ANALYSIS ---');
  const productSalesMap = {}; // productName -> { count, totalQuantity, totalRevenue }
  const productPairMap = {};  // "A + B" -> count
  const orderTicketList = [];
  const itemsPerOrderList = [];

  validOrders.forEach(o => {
    const totalAmount = o.totalAmount || o.total || o.amount || 0;
    // Amount in DB might be multiplied by 100 or in ARS/cents
    const finalAmount = totalAmount > 100000 ? totalAmount / 100 : totalAmount;
    orderTicketList.push(finalAmount);

    const items = o.items || o.orderItems || [];
    let itemsCountInOrder = 0;

    const currentOrderProducts = new Set();

    items.forEach(item => {
      const name = item.name || item.title || item.itemName || 'Producto Desconocido';
      const qty = item.quantity || item.qty || 1;
      const price = item.price || item.unitPrice || 0;
      const itemFinalPrice = price > 100000 ? price / 100 : price;

      itemsCountInOrder += qty;
      currentOrderProducts.add(name);

      if (!productSalesMap[name]) {
        productSalesMap[name] = { ordersCount: 0, totalQuantity: 0, totalRevenue: 0 };
      }
      productSalesMap[name].ordersCount++;
      productSalesMap[name].totalQuantity += qty;
      productSalesMap[name].totalRevenue += (itemFinalPrice * qty);
    });

    itemsPerOrderList.push(itemsCountInOrder);

    // Product combinations (pairs within same order)
    const prodArray = Array.from(currentOrderProducts).sort();
    for (let i = 0; i < prodArray.length; i++) {
      for (let j = i + 1; j < prodArray.length; j++) {
        const pairKey = `${prodArray[i]} + ${prodArray[j]}`;
        productPairMap[pairKey] = (productPairMap[pairKey] || 0) + 1;
      }
    }
  });

  const productSalesSorted = Object.entries(productSalesMap).map(([name, stats]) => ({
    name,
    ...stats,
    percentageOfValidOrders: ((stats.ordersCount / validOrders.length) * 100).toFixed(2) + '%'
  })).sort((a, b) => b.ordersCount - a.ordersCount);

  const productPairsSorted = Object.entries(productPairMap).map(([pair, count]) => ({
    pair,
    ordersCount: count,
    percentageOfValidOrders: ((count / validOrders.length) * 100).toFixed(2) + '%'
  })).sort((a, b) => b.ordersCount - a.ordersCount);

  results.salesAnalysis = {
    validOrdersCount: validOrders.length,
    meanTicket: mean(orderTicketList),
    medianTicket: quantile(orderTicketList, 0.5),
    p25Ticket: quantile(orderTicketList, 0.25),
    p75Ticket: quantile(orderTicketList, 0.75),
    p90Ticket: quantile(orderTicketList, 0.90),
    meanItemsPerOrder: mean(itemsPerOrderList),
    medianItemsPerOrder: quantile(itemsPerOrderList, 0.5),
    productSalesSorted,
    topProductPairs: productPairsSorted.slice(0, 30)
  };

  // 4. FRONTEND EVENTS / EVENT TAXONOMY (From CustomerEvents)
  console.log('--- 4. CUSTOMER EVENTS TAXONOMY ---');
  // Group CustomerEvents by type
  const productViewEvents = await db.collection('customerevents').find({ tenantId: { $in: [kekeTenantId, kekeStr] }, type: 'product_view' }).toArray();
  const productViewsByName = {};
  productViewEvents.forEach(e => {
    const item = e.data?.itemName || 'Desconocido';
    productViewsByName[item] = (productViewsByName[item] || 0) + 1;
  });

  results.eventsTaxonomy = {
    totalCustomerEvents: totalCustomerEvents,
    eventTypesSummary: customerEventBreakdown,
    productViewsByName,
    nonInstrumentedEvents: [
      'click (general)', 'tap', 'category_view', 'add_to_cart', 'remove_from_cart', 
      'increase_quantity', 'decrease_quantity', 'modifier_selected', 'modifier_removed', 
      'checkout_started', 'payment_started', 'payment_completed', 'promotion_clicked', 
      'promotion_viewed', 'reward_viewed', 'reward_clicked', 'club_viewed', 'club_joined_event', 
      'points_viewed', 'reward_redeemed_event'
    ]
  };

  // 5. CLUB / LOYALTY ANALYSIS
  console.log('--- 5. CLUB / LOYALTY ANALYSIS ---');
  const pointsList = loyaltyMembers.map(m => m.loyalty?.points || 0);
  const zeroPointsMembers = loyaltyMembers.filter(m => (m.loyalty?.points || 0) === 0).length;
  const positivePointsMembers = loyaltyMembers.filter(m => (m.loyalty?.points || 0) > 0).length;

  // Members near or at 12,690 points reward
  const rewardThreshold = 12690;
  const membersReachedReward = loyaltyMembers.filter(m => (m.loyalty?.points || 0) >= rewardThreshold);
  const membersNearReward = loyaltyMembers.filter(m => (m.loyalty?.points || 0) >= 8000 && (m.loyalty?.points || 0) < rewardThreshold);

  // Redemptions
  const totalRedemptionsCount = loyaltyMembers.reduce((sum, m) => sum + (m.store?.totalRedemptions || 0), 0);

  // Compare Members vs Non-Members in Orders
  const memberPhones = new Set(loyaltyMembers.map(m => m.phone ? m.phone.replace(/[^0-9]/g, '') : '').filter(Boolean));
  
  const memberOrders = [];
  const nonMemberOrders = [];

  validOrders.forEach(o => {
    const phoneRaw = o.customerPhone || o.phone || (o.customer && o.customer.phone) || '';
    const cleanPhone = phoneRaw.replace(/[^0-9]/g, '');
    if (cleanPhone && memberPhones.has(cleanPhone)) {
      memberOrders.push(o);
    } else {
      nonMemberOrders.push(o);
    }
  });

  const memberTickets = memberOrders.map(o => {
    const t = o.totalAmount || o.total || o.amount || 0;
    return t > 100000 ? t / 100 : t;
  });

  const nonMemberTickets = nonMemberOrders.map(o => {
    const t = o.totalAmount || o.total || o.amount || 0;
    return t > 100000 ? t / 100 : t;
  });

  // Check SOS / Reward Advance
  const membersWithSosConfig = loyaltyMembers.filter(m => m.sosConfig);
  const membersUsedSos = loyaltyMembers.filter(m => m.sosConfig && m.sosConfig.sosUsed > 0);

  results.clubAnalysis = {
    totalMembers: loyaltyMembers.length,
    zeroPointsMembers,
    positivePointsMembers,
    pointsDistribution: {
      mean: mean(pointsList),
      median: quantile(pointsList, 0.5),
      p25: quantile(pointsList, 0.25),
      p75: quantile(pointsList, 0.75),
      p90: quantile(pointsList, 0.90),
      max: Math.max(...pointsList, 0)
    },
    membersReachedRewardCount: membersReachedReward.length,
    membersNearRewardCount: membersNearReward.length,
    membersReachedRewardList: membersReachedReward.map(m => ({ name: m.name, phone: m.phone, points: m.loyalty?.points })),
    totalRedemptionsCount,
    comparison: {
      memberOrdersCount: memberOrders.length,
      memberMeanTicket: mean(memberTickets),
      memberMedianTicket: quantile(memberTickets, 0.5),
      nonMemberOrdersCount: nonMemberOrders.length,
      nonMemberMeanTicket: mean(nonMemberTickets),
      nonMemberMedianTicket: quantile(nonMemberTickets, 0.5),
    },
    rewardAdvance: {
      membersWithSosConfigCount: membersWithSosConfig.length,
      membersUsedSosCount: membersUsedSos.length,
      evidence: membersUsedSos.length > 0 ? membersUsedSos : 'Existe la funcionalidad sosConfig en el modelo de datos, pero 0 usuarios registran sosUsed > 0.'
    }
  };

  // 6. RECURRENCE ANALYSIS
  console.log('--- 6. RECURRENCE ANALYSIS ---');
  const customerOrderCounts = Object.values(phoneToOrdersMap).map(arr => arr.length);
  const oneTimeBuyers = customerOrderCounts.filter(c => c === 1).length;
  const repeatBuyers = customerOrderCounts.filter(c => c > 1).length;

  const repeatIntervals = []; // in days
  Object.values(phoneToOrdersMap).forEach(orders => {
    if (orders.length > 1) {
      const sorted = orders.map(o => new Date(o.createdAt || o.created_at)).sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        const diffDays = (sorted[i] - sorted[i - 1]) / (1000 * 60 * 60 * 24);
        if (!isNaN(diffDays)) repeatIntervals.push(diffDays);
      }
    }
  });

  results.recurrenceAnalysis = {
    totalPurchasingCustomers: Object.keys(phoneToOrdersMap).length,
    oneTimeBuyers,
    repeatBuyers,
    repeatRate: Object.keys(phoneToOrdersMap).length ? ((repeatBuyers / Object.keys(phoneToOrdersMap).length) * 100).toFixed(2) + '%' : '0%',
    repeatIntervalsDays: {
      mean: mean(repeatIntervals),
      median: quantile(repeatIntervals, 0.5),
      p25: quantile(repeatIntervals, 0.25),
      p75: quantile(repeatIntervals, 0.75),
    }
  };

  // 7. QR & PROMOTION ANALYSIS
  console.log('--- 7. QR & PROMOTION ANALYSIS ---');
  const qrViewsBySource = {};
  qrPromoViews.forEach(v => {
    const s = v.source || 'direct/empty';
    qrViewsBySource[s] = (qrViewsBySource[s] || 0) + 1;
  });

  results.qrAndPromoAnalysis = {
    totalQRPromos: qrPromosCount,
    totalQRPromoViews: qrPromoViewsCount,
    qrViewsBySource,
    promotionsList: promotions.map(p => ({ title: p.title, price: p.price, originalPrice: p.originalPrice, isActive: p.isActive, redemptionsCount: p.redemptionsCount }))
  };

  // Save to JSON file
  const outputPath = path.join(__dirname, 'keke_analytics_summary.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log('\nAnalytics summary successfully written to:', outputPath);

  await mongoose.disconnect();
}

run().catch(console.error);
