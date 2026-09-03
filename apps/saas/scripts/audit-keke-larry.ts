import mongoose from 'mongoose'
import * as fs from 'fs'
import * as path from 'path'

// ─────────────────────────────────────────────────────────────────────────────
// TGO DATA INTELLIGENCE AUDIT — Keke & Larry
// Script de extracción de datos (READ-ONLY)
// ─────────────────────────────────────────────────────────────────────────────

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://pgonzalojose_db_user:6oXEemLauaEuPoaq@takeasygo.ssjlhfw.mongodb.net/?appName=takeasygo'

interface AuditResult {
  timestamp: string
  tenant: any
  collections: Record<string, number>
  orders: any
  customers: any
  loyalty: any
  feedback: any
  tia: any
  products: any
  temporal: any
  dataQuality: any
}

async function connect() {
  await mongoose.connect(MONGODB_URI, {
    bufferCommands: false,
    maxPoolSize: 5,
  })
  console.log('✅ Connected to MongoDB')
}

async function disconnect() {
  await mongoose.disconnect()
  console.log('✅ Disconnected from MongoDB')
}

async function getTenantInfo(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  const tenant = await db.collection('tenants').findOne({ _id: tenantId })
  const locations = await db.collection('locations').find({ tenantId }).toArray()
  
  return { tenant, locations }
}

async function getCollectionsCounts(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  const collections = [
    'orders', 'consumers', 'customerprofiles', 'customerevents',
    'loyaltymembers', 'feedbacks', 'tiainsights', 'ratings',
    'menus', 'storeitems', 'promotions', 'qrpromos',
    'impactevents', 'explorevents', 'shareevents', 'menuvisits',
    'hiddenrewardclaims', 'storeitemredemptions'
  ]
  
  const counts: Record<string, number> = {}
  
  for (const col of collections) {
    try {
      counts[col] = await db.collection(col).countDocuments({ tenantId })
    } catch {
      counts[col] = 0
    }
  }
  
  return counts
}

async function getOrderStats(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  // Date range
  const dateRange = await db.collection('orders').aggregate([
    { $match: { tenantId } },
    { $group: {
      _id: null,
      minDate: { $min: '$createdAt' },
      maxDate: { $max: '$createdAt' },
      count: { $sum: 1 }
    }}
  ]).toArray()
  
  // Status distribution
  const statusDist = await db.collection('orders').aggregate([
    { $match: { tenantId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray()
  
  // Order modes
  const modeDist = await db.collection('orders').aggregate([
    { $match: { tenantId } },
    { $group: { _id: '$orderMode', count: { $sum: 1 } } }
  ]).toArray()
  
  // Revenue stats (total in cents)
  const revenueStats = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $group: {
      _id: null,
      totalRevenue: { $sum: '$total' },
      avgTicket: { $avg: '$total' },
      medianTicket: { $percentile: { p: [0.5], input: '$total', method: 'approximate' } },
      minTicket: { $min: '$total' },
      maxTicket: { $max: '$total' },
      count: { $sum: 1 }
    }}
  ]).toArray()
  
  // Items per order
  const itemsPerOrder = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $project: {
      itemCount: { $size: '$items' },
      uniqueProducts: { $size: { $setUnion: '$items.menuItemId' } }
    }},
    { $group: {
      _id: null,
      avgItems: { $avg: '$itemCount' },
      avgUniqueProducts: { $avg: '$uniqueProducts' },
      maxItems: { $max: '$itemCount' }
    }}
  ]).toArray()
  
  // Discount stats
  const discountStats = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $group: {
      _id: null,
      totalDiscounts: { $sum: '$discountAmount' },
      ordersWithDiscount: {
        $sum: { $cond: [{ $gt: ['$discountAmount', 0] }, 1, 0] }
      },
      totalLoyaltyDiscounts: { $sum: '$loyaltyDiscountAmount' },
      ordersWithLoyaltyDiscount: {
        $sum: { $cond: [{ $gt: ['$loyaltyDiscountAmount', 0] }, 1, 0] }
      },
      totalLoyaltyPointsUsed: { $sum: '$loyaltyPointsUsed' }
    }}
  ]).toArray()
  
  // Loyalty points credited
  const loyaltyPointsCredited = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $group: {
      _id: null,
      totalOrders: { $sum: 1 },
      ordersWithPointsCredited: {
        $sum: { $cond: ['$loyaltyPointsCredited', 1, 0] }
      }
    }}
  ]).toArray()
  
  return {
    dateRange: dateRange[0] || { minDate: null, maxDate: null, count: 0 },
    statusDistribution: statusDist,
    modeDistribution: modeDist,
    revenueStats: revenueStats[0] || {},
    itemsPerOrder: itemsPerOrder[0] || {},
    discountStats: discountStats[0] || {},
    loyaltyPointsCredited: loyaltyPointsCredited[0] || {}
  }
}

async function getCustomerStats(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  // Unique customers (from orders)
  const uniqueCustomers = await db.collection('orders').aggregate([
    { $match: { tenantId } },
    { $group: { _id: '$customer.phoneHash' } },
    { $count: 'total' }
  ]).toArray()
  
  // Customer order distribution
  const customerOrderDist = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $group: { _id: '$customer.phoneHash', orderCount: { $sum: 1 }, totalSpent: { $sum: '$total' } } },
    { $group: {
      _id: '$orderCount',
      customerCount: { $sum: 1 },
      totalRevenue: { $sum: '$totalSpent' }
    }},
    { $sort: { _id: 1 } }
  ]).toArray()
  
  // Repeat customers (2+ orders)
  const repeatCustomers = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $group: { _id: '$customer.phoneHash', orderCount: { $sum: 1 } } },
    { $match: { orderCount: { $gte: 2 } } },
    { $count: 'total' }
  ]).toArray()
  
  // High-frequency customers (3+ orders)
  const highFreqCustomers = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $group: { _id: '$customer.phoneHash', orderCount: { $sum: 1 } } },
    { $match: { orderCount: { $gte: 3 } } },
    { $count: 'total' }
  ]).toArray()
  
  // New vs returning by month
  const customersByMonth = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $group: {
      _id: {
        phoneHash: '$customer.phoneHash',
        month: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }
      },
      firstInMonth: { $min: '$createdAt' }
    }},
    { $group: {
      _id: '$_id.month',
      uniqueCustomers: { $addToSet: '$_id.phoneHash' }
    }},
    { $project: {
      month: '$_id',
      customerCount: { $size: '$uniqueCustomers' }
    }},
    { $sort: { month: 1 } }
  ]).toArray()
  
  return {
    uniqueCustomers: uniqueCustomers[0]?.total || 0,
    customerOrderDistribution: customerOrderDist,
    repeatCustomers: repeatCustomers[0]?.total || 0,
    highFrequencyCustomers: highFreqCustomers[0]?.total || 0,
    customersByMonth
  }
}

async function getLoyaltyStats(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  // Members count
  const membersCount = await db.collection('loyaltymembers').countDocuments({ tenantId, status: 'active' })
  
  // Members source distribution
  const membersBySource = await db.collection('loyaltymembers').aggregate([
    { $match: { tenantId, status: 'active' } },
    { $group: { _id: '$source', count: { $sum: 1 } } }
  ]).toArray()
  
  // Members loyalty points stats
  const pointsStats = await db.collection('loyaltymembers').aggregate([
    { $match: { tenantId, status: 'active' } },
    { $group: {
      _id: null,
      totalPoints: { $sum: '$loyalty.points' },
      avgPoints: { $avg: '$loyalty.points' },
      membersWithPoints: {
        $sum: { $cond: [{ $gt: ['$loyalty.points', 0] }, 1, 0] }
      }
    }}
  ]).toArray()
  
  // Store redemptions
  const redemptionsStats = await db.collection('loyaltymembers').aggregate([
    { $match: { tenantId, status: 'active' } },
    { $group: {
      _id: null,
      totalRedemptions: { $sum: '$store.totalRedemptions' },
      totalPointsSpent: { $sum: '$store.totalPointsSpent' },
      membersWhoRedeemed: {
        $sum: { $cond: [{ $gt: ['$store.totalRedemptions', 0] }, 1, 0] }
      }
    }}
  ]).toArray()
  
  // Member vs non-member comparison
  const memberPhoneHashes = await db.collection('loyaltymembers').distinct('phoneHash', { tenantId, status: 'active' })
  
  // Members order stats
  const memberOrderStats = await db.collection('orders').aggregate([
    { $match: { tenantId, 'customer.phoneHash': { $in: memberPhoneHashes }, status: { $nin: ['cancelled'] } } },
    { $group: {
      _id: null,
      totalOrders: { $sum: 1 },
      avgTicket: { $avg: '$total' },
      totalRevenue: { $sum: '$total' }
    }}
  ]).toArray()
  
  // Non-members order stats
  const nonMemberOrderStats = await db.collection('orders').aggregate([
    { $match: { tenantId, 'customer.phoneHash': { $nin: memberPhoneHashes }, status: { $nin: ['cancelled'] } } },
    { $group: {
      _id: null,
      totalOrders: { $sum: 1 },
      avgTicket: { $avg: '$total' },
      totalRevenue: { $sum: '$total' }
    }}
  ]).toArray()
  
  // Member unique customers
  const memberUniqueCustomers = await db.collection('orders').aggregate([
    { $match: { tenantId, 'customer.phoneHash': { $in: memberPhoneHashes }, status: { $nin: ['cancelled'] } } },
    { $group: { _id: '$customer.phoneHash' } },
    { $count: 'total' }
  ]).toArray()
  
  // Non-member unique customers
  const nonMemberUniqueCustomers = await db.collection('orders').aggregate([
    { $match: { tenantId, 'customer.phoneHash': { $nin: memberPhoneHashes }, status: { $nin: ['cancelled'] } } },
    { $group: { _id: '$customer.phoneHash' } },
    { $count: 'total' }
  ]).toArray()
  
  // Member repeat rate
  const memberRepeatRate = await db.collection('orders').aggregate([
    { $match: { tenantId, 'customer.phoneHash': { $in: memberPhoneHashes }, status: { $nin: ['cancelled'] } } },
    { $group: { _id: '$customer.phoneHash', orderCount: { $sum: 1 } } },
    { $group: {
      _id: null,
      total: { $sum: 1 },
      repeat: { $sum: { $cond: [{ $gte: ['$orderCount', 2] }, 1, 0] } }
    }}
  ]).toArray()
  
  // Non-member repeat rate
  const nonMemberRepeatRate = await db.collection('orders').aggregate([
    { $match: { tenantId, 'customer.phoneHash': { $nin: memberPhoneHashes }, status: { $nin: ['cancelled'] } } },
    { $group: { _id: '$customer.phoneHash', orderCount: { $sum: 1 } } },
    { $group: {
      _id: null,
      total: { $sum: 1 },
      repeat: { $sum: { $cond: [{ $gte: ['$orderCount', 2] }, 1, 0] } }
    }}
  ]).toArray()
  
  return {
    membersCount,
    membersBySource,
    pointsStats: pointsStats[0] || {},
    redemptionsStats: redemptionsStats[0] || {},
    memberOrderStats: memberOrderStats[0] || {},
    nonMemberOrderStats: nonMemberOrderStats[0] || {},
    memberUniqueCustomers: memberUniqueCustomers[0]?.total || 0,
    nonMemberUniqueCustomers: nonMemberUniqueCustomers[0]?.total || 0,
    memberRepeatRate: memberRepeatRate[0] || {},
    nonMemberRepeatRate: nonMemberRepeatRate[0] || {}
  }
}

async function getFeedbackStats(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  // Feedback count
  const feedbackCount = await db.collection('feedbacks').countDocuments({ tenantId })
  
  // By event type
  const byEvent = await db.collection('feedbacks').aggregate([
    { $match: { tenantId } },
    { $group: { _id: '$event', count: { $sum: 1 } } }
  ]).toArray()
  
  // Satisfaction distribution
  const satisfactionDist = await db.collection('feedbacks').aggregate([
    { $match: { tenantId, satisfaction: { $exists: true } } },
    { $group: { _id: '$satisfaction', count: { $sum: 1 } } }
  ]).toArray()
  
  // Comments
  const comments = await db.collection('feedbacks').find(
    { tenantId, comment: { $exists: true, $ne: '' } },
    { projection: { comment: 1, event: 1, satisfaction: 1, createdAt: 1 } }
  ).limit(50).toArray()
  
  return { feedbackCount, byEvent, satisfactionDist, comments }
}

async function getTIAStats(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  // TIA insights count
  const insightsCount = await db.collection('tiainsights').countDocuments({ tenantId })
  
  // By type
  const byType = await db.collection('tiainsights').aggregate([
    { $match: { tenantId } },
    { $group: { _id: '$type', count: { $sum: 1 } } }
  ]).toArray()
  
  // By severity
  const bySeverity = await db.collection('tiainsights').aggregate([
    { $match: { tenantId } },
    { $group: { _id: '$severity', count: { $sum: 1 } } }
  ]).toArray()
  
  // By category
  const byCategory = await db.collection('tiainsights').aggregate([
    { $match: { tenantId } },
    { $group: { _id: '$category', count: { $sum: 1 } } }
  ]).toArray()
  
  // By status
  const byStatus = await db.collection('tiainsights').aggregate([
    { $match: { tenantId } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]).toArray()
  
  // Recent insights
  const recentInsights = await db.collection('tiainsights').find(
    { tenantId },
    { projection: { title: 1, description: 1, type: 1, severity: 1, category: 1, status: 1, currentValue: 1, recommendation: 1, generatedAt: 1 } }
  ).sort({ generatedAt: -1 }).limit(20).toArray()
  
  return { insightsCount, byType, bySeverity, byCategory, byStatus, recentInsights }
}

async function getProductStats(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  // Menu items
  const menuItems = await db.collection('menus').aggregate([
    { $match: { tenantId } },
    { $unwind: '$categories' },
    { $unwind: '$categories.items' },
    { $project: {
      _id: 1,
      categoryName: '$categories.name',
      itemId: '$categories.items._id',
      itemName: '$categories.items.name',
      price: '$categories.items.price'
    }}
  ]).toArray()
  
  // Order items aggregation
  const topProducts = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $unwind: '$items' },
    { $group: {
      _id: '$items.menuItemId',
      name: { $first: '$items.name' },
      categoryName: { $first: '$items.categoryName' },
      totalQuantity: { $sum: '$items.quantity' },
      totalRevenue: { $sum: '$items.subtotal' },
      orderCount: { $sum: 1 }
    }},
    { $sort: { totalRevenue: -1 } },
    { $limit: 20 }
  ]).toArray()
  
  // Category aggregation
  const categoryStats = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $unwind: '$items' },
    { $group: {
      _id: '$items.categoryName',
      totalQuantity: { $sum: '$items.quantity' },
      totalRevenue: { $sum: '$items.subtotal' },
      orderCount: { $sum: 1 }
    }},
    { $sort: { totalRevenue: -1 } }
  ]).toArray()
  
  return { menuItemsCount: menuItems.length, topProducts, categoryStats }
}

async function getTemporalStats(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  // By day of week
  const byDayOfWeek = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $group: {
      _id: { $dayOfWeek: '$createdAt' },
      count: { $sum: 1 },
      revenue: { $sum: '$total' }
    }},
    { $sort: { _id: 1 } }
  ]).toArray()
  
  // By hour
  const byHour = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $group: {
      _id: { $hour: '$createdAt' },
      count: { $sum: 1 },
      revenue: { $sum: '$total' }
    }},
    { $sort: { _id: 1 } }
  ]).toArray()
  
  // By month
  const byMonth = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $group: {
      _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
      count: { $sum: 1 },
      revenue: { $sum: '$total' }
    }},
    { $sort: { _id: 1 } }
  ]).toArray()
  
  // Daily revenue trend
  const dailyRevenue = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $group: {
      _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
      count: { $sum: 1 },
      revenue: { $sum: '$total' }
    }},
    { $sort: { _id: 1 } }
  ]).toArray()
  
  return { byDayOfWeek, byHour, byMonth, dailyRevenue }
}

async function getDataQuality(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  // Orders without customer phoneHash
  const ordersWithoutPhone = await db.collection('orders').countDocuments({
    tenantId,
    'customer.phoneHash': { $in: [null, ''] }
  })
  
  // Orders without items
  const ordersWithoutItems = await db.collection('orders').countDocuments({
    tenantId,
    items: { $size: 0 }
  })
  
  // Orders with negative total
  const ordersWithNegativeTotal = await db.collection('orders').countDocuments({
    tenantId,
    total: { $lt: 0 }
  })
  
  // Orders with 0 total
  const ordersWithZeroTotal = await db.collection('orders').countDocuments({
    tenantId,
    total: 0,
    status: { $nin: ['cancelled'] }
  })
  
  // Duplicate order numbers
  const duplicateOrderNumbers = await db.collection('orders').aggregate([
    { $match: { tenantId } },
    { $group: { _id: '$orderNumber', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $count: 'total' }
  ]).toArray()
  
  // Orders with inconsistent totals
  const inconsistentTotals = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $project: {
      orderNumber: 1,
      total: 1,
      calculatedTotal: { $sum: '$items.subtotal' },
      difference: { $abs: { $subtract: ['$total', { $sum: '$items.subtotal' }] } }
    }},
    { $match: { difference: { $gt: 1 } } }, // More than 1 cent difference
    { $count: 'total' }
  ]).toArray()
  
  // Consumers without orders
  const consumersWithoutOrders = await db.collection('consumers').aggregate([
    { $match: { tenantIds: tenantId } },
    { $lookup: {
      from: 'orders',
      localField: '_id',
      foreignField: 'customer._id',
      as: 'orders'
    }},
    { $match: { orders: { $size: 0 } } },
    { $count: 'total' }
  ]).toArray()
  
  return {
    ordersWithoutPhone,
    ordersWithoutItems,
    ordersWithNegativeTotal,
    ordersWithZeroTotal,
    duplicateOrderNumbers: duplicateOrderNumbers[0]?.total || 0,
    inconsistentTotals: inconsistentTotals[0]?.total || 0,
    consumersWithoutOrders: consumersWithoutOrders[0]?.total || 0
  }
}

async function runAudit() {
  console.log('🔍 TGO DATA INTELLIGENCE AUDIT — Keke & Larry')
  console.log('=' .repeat(60))
  
  try {
    await connect()
    
    // Find Keke & Larry tenant
    const db = mongoose.connection.db!
    const tenant = await db.collection('tenants').findOne({ name: { $regex: /keke|larry/i } })
    
    if (!tenant) {
      console.log('❌ Tenant "Keke & Larry" not found')
      // List all tenants
      const allTenants = await db.collection('tenants').find({}, { projection: { name: 1, _id: 1 } }).toArray()
      console.log('Available tenants:', allTenants.map(t => `${t.name} (${t._id})`))
      return
    }
    
    console.log(`\n📍 Tenant: ${tenant.name} (${tenant._id})`)
    
    const tenantId = tenant._id as mongoose.Types.ObjectId
    
    // Run all analyses
    console.log('\n📊 Collecting data...')
    
    const collections = await getCollectionsCounts(tenantId)
    const orders = await getOrderStats(tenantId)
    const customers = await getCustomerStats(tenantId)
    const loyalty = await getLoyaltyStats(tenantId)
    const feedback = await getFeedbackStats(tenantId)
    const tia = await getTIAStats(tenantId)
    const products = await getProductStats(tenantId)
    const temporal = await getTemporalStats(tenantId)
    const dataQuality = await getDataQuality(tenantId)
    
    const result: AuditResult = {
      timestamp: new Date().toISOString(),
      tenant: { id: tenant._id, name: tenant.name },
      collections,
      orders,
      customers,
      loyalty,
      feedback,
      tia,
      products,
      temporal,
      dataQuality
    }
    
    // Save result
    const outputPath = path.join(__dirname, '../audit-results-keke-larry.json')
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2))
    
    console.log(`\n✅ Audit complete! Results saved to: ${outputPath}`)
    
    // Print summary
    console.log('\n' + '=' .repeat(60))
    console.log('📋 SUMMARY')
    console.log('=' .repeat(60))
    console.log(`Collections:`, Object.entries(collections).filter(([_, v]) => v > 0).map(([k, v]) => `${k}: ${v}`))
    console.log(`\nOrders:`)
    console.log(`  - Date range: ${orders.dateRange.minDate} → ${orders.dateRange.maxDate}`)
    console.log(`  - Total: ${orders.dateRange.count}`)
    console.log(`  - Status: ${orders.statusDistribution.map((s: any) => `${s._id}: ${s.count}`).join(', ')}`)
    console.log(`  - Revenue: $${(orders.revenueStats.totalRevenue / 100).toFixed(2)}`)
    console.log(`  - Avg Ticket: $${(orders.revenueStats.avgTicket / 100).toFixed(2)}`)
    console.log(`\nCustomers:`)
    console.log(`  - Unique: ${customers.uniqueCustomers}`)
    console.log(`  - Repeat (2+): ${customers.repeatCustomers}`)
    console.log(`  - High freq (3+): ${customers.highFrequencyCustomers}`)
    console.log(`\nLoyalty:`)
    console.log(`  - Active members: ${loyalty.membersCount}`)
    console.log(`  - Total points: ${loyalty.pointsStats.totalPoints || 0}`)
    console.log(`  - Total redemptions: ${loyalty.redemptionsStats.totalRedemptions || 0}`)
    console.log(`\nFeedback:`)
    console.log(`  - Total: ${feedback.feedbackCount}`)
    console.log(`  - By event: ${feedback.byEvent.map((e: any) => `${e._id}: ${e.count}`).join(', ')}`)
    console.log(`\nTIA:`)
    console.log(`  - Total insights: ${tia.insightsCount}`)
    console.log(`  - By category: ${tia.byCategory.map((c: any) => `${c._id}: ${c.count}`).join(', ')}`)
    console.log(`\nData Quality:`)
    console.log(`  - Orders without phone: ${dataQuality.ordersWithoutPhone}`)
    console.log(`  - Orders without items: ${dataQuality.ordersWithoutItems}`)
    console.log(`  - Negative totals: ${dataQuality.ordersWithNegativeTotal}`)
    console.log(`  - Zero totals: ${dataQuality.ordersWithZeroTotal}`)
    console.log(`  - Duplicate order numbers: ${dataQuality.duplicateOrderNumbers}`)
    console.log(`  - Inconsistent totals: ${dataQuality.inconsistentTotals}`)
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await disconnect()
  }
}

runAudit()
