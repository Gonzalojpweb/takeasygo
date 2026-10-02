import mongoose from 'mongoose'
import * as fs from 'fs'
import * as path from 'path'

// ============================================================================
// FINAL COMPREHENSIVE ANALYSIS - KEKE & LARRY
// Análisis profundo de combinaciones de productos y métricas adicionales
// ============================================================================

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://pgonzalojose_db_user:6oXEemLauaEuPoaq@takeasygo.ssjlhfw.mongodb.net/?appName=takeasygo'
const TENANT_ID = '69f8bf6ad3fcc97fd64bec87'
const OUTPUT_DIR = path.join(__dirname, '../audit-data-keke-larry')

async function connect() {
  await mongoose.connect(MONGODB_URI, { bufferCommands: false, maxPoolSize: 5 })
  console.log('✅ Connected to MongoDB')
}

async function disconnect() {
  await mongoose.disconnect()
  console.log('✅ Disconnected from MongoDB')
}

async function deepProductAnalysis(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  console.log('  📊 Deep product analysis...')
  
  // Product performance with time series
  const productTimeSeries = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $unwind: '$items' },
    { $group: {
      _id: {
        productId: '$items.menuItemId',
        productName: '$items.name',
        month: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }
      },
      quantity: { $sum: '$items.quantity' },
      revenue: { $sum: '$items.subtotal' },
      orders: { $sum: 1 }
    }},
    { $sort: { '_id.month': 1, revenue: -1 } }
  ]).toArray()
  
  // Product hourly patterns
  const productHourly = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $unwind: '$items' },
    { $group: {
      _id: {
        productId: '$items.menuItemId',
        productName: '$items.name',
        hour: { $hour: '$createdAt' }
      },
      quantity: { $sum: '$items.quantity' },
      revenue: { $sum: '$items.subtotal' }
    }},
    { $sort: { '_id.productId': 1, '_id.hour': 1 } }
  ]).toArray()
  
  // Product weekday patterns
  const productWeekday = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $unwind: '$items' },
    { $group: {
      _id: {
        productId: '$items.menuItemId',
        productName: '$items.name',
        weekday: { $dayOfWeek: '$createdAt' }
      },
      quantity: { $sum: '$items.quantity' },
      revenue: { $sum: '$items.subtotal' }
    }},
    { $sort: { '_id.productId': 1, '_id.weekday': 1 } }
  ]).toArray()
  
  return { productTimeSeries, productHourly, productWeekday }
}

async function customerDeepAnalysis(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  console.log('  📊 Deep customer analysis...')
  
  // Customer cohorts by first purchase month
  const customerCohorts = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $sort: { createdAt: 1 } },
    { $group: {
      _id: '$customer.phoneHash',
      firstMonth: { $dateToString: { format: '%Y-%m', date: { $min: '$createdAt' } } },
      orders: { $push: { date: '$createdAt', total: '$total' } },
      totalSpent: { $sum: '$total' },
      orderCount: { $sum: 1 }
    }},
    { $group: {
      _id: '$firstMonth',
      customers: { $addToSet: '$_id' },
      customerCount: { $sum: 1 },
      avgSpent: { $avg: '$totalSpent' },
      avgOrders: { $avg: '$orderCount' }
    }},
    { $sort: { _id: 1 } }
  ]).toArray()
  
  // Customer purchase patterns
  const purchasePatterns = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $group: {
      _id: '$customer.phoneHash',
      orders: { $push: { date: '$createdAt', total: '$total', items: '$items' } },
      totalOrders: { $sum: 1 },
      totalSpent: { $sum: '$total' }
    }},
    { $project: {
      _id: 1,
      totalOrders: 1,
      totalSpent: 1,
      avgOrderValue: { $divide: ['$totalSpent', '$totalOrders'] },
      orderIntervals: {
        $slice: [
          {
            $map: {
              input: { $slice: ['$orders', 1, { $size: '$orders' }] },
              as: 'order',
              in: {
                $divide: [
                  { $subtract: ['$$order.date', { $arrayElemAt: ['$orders.date', 0] }] },
                  86400000
                ]
              }
            }
          },
          0,
          10
        ]
      }
    }},
    { $sort: { totalSpent: -1 } }
  ]).toArray()
  
  return { customerCohorts, purchasePatterns }
}

async function loyaltyDeepAnalysis(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  console.log('  📊 Deep loyalty analysis...')
  
  // Member acquisition over time
  const memberAcquisition = await db.collection('loyaltymembers').aggregate([
    { $match: { tenantId } },
    { $group: {
      _id: { $dateToString: { format: '%Y-%m', date: '$joinedAt' } },
      count: { $sum: 1 },
      bySource: {
        $push: { source: '$source' }
      }
    }},
    { $sort: { _id: 1 } }
  ]).toArray()
  
  // Member activity
  const memberActivity = await db.collection('loyaltymembers').aggregate([
    { $match: { tenantId, status: 'active' } },
    { $group: {
      _id: null,
      totalMembers: { $sum: 1 },
      membersWithPoints: { $sum: { $cond: [{ $gt: ['$loyalty.points', 0] }, 1, 0] } },
      membersWithRedemptions: { $sum: { $cond: [{ $gt: ['$store.totalRedemptions', 0] }, 1, 0] } },
      totalPoints: { $sum: '$loyalty.points' },
      totalRedemptions: { $sum: '$store.totalRedemptions' },
      totalPointsSpent: { $sum: '$store.totalPointsSpent' }
    }}
  ]).toArray()
  
  // Member vs non-member behavior comparison
  const memberPhoneHashes = await db.collection('loyaltymembers').distinct('phoneHash', { tenantId, status: 'active' })
  
  const memberBehavior = await db.collection('orders').aggregate([
    { $match: { tenantId, 'customer.phoneHash': { $in: memberPhoneHashes }, status: { $nin: ['cancelled'] } } },
    { $group: {
      _id: null,
      totalOrders: { $sum: 1 },
      totalRevenue: { $sum: '$total' },
      avgTicket: { $avg: '$total' },
      uniqueCustomers: { $addToSet: '$customer.phoneHash' }
    }},
    { $project: {
      totalOrders: 1,
      totalRevenue: 1,
      avgTicket: 1,
      uniqueCustomerCount: { $size: '$uniqueCustomers' }
    }}
  ]).toArray()
  
  const nonMemberBehavior = await db.collection('orders').aggregate([
    { $match: { tenantId, 'customer.phoneHash': { $nin: memberPhoneHashes }, status: { $nin: ['cancelled'] } } },
    { $group: {
      _id: null,
      totalOrders: { $sum: 1 },
      totalRevenue: { $sum: '$total' },
      avgTicket: { $avg: '$total' },
      uniqueCustomers: { $addToSet: '$customer.phoneHash' }
    }},
    { $project: {
      totalOrders: 1,
      totalRevenue: 1,
      avgTicket: 1,
      uniqueCustomerCount: { $size: '$uniqueCustomers' }
    }}
  ]).toArray()
  
  return { 
    memberAcquisition, 
    memberActivity: memberActivity[0] || {},
    memberBehavior: memberBehavior[0] || {},
    nonMemberBehavior: nonMemberBehavior[0] || {}
  }
}

async function promotionAnalysis(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  console.log('  📊 Promotion analysis...')
  
  // Promotion usage
  const promotionUsage = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $group: {
      _id: '$promoCode',
      count: { $sum: 1 },
      totalDiscount: { $sum: '$discountAmount' },
      totalRevenue: { $sum: '$total' }
    }},
    { $sort: { count: -1 } }
  ]).toArray()
  
  // QR promo views
  const qrPromoViews = await db.collection('qrpromoviews').aggregate([
    { $match: { tenantId } },
    { $group: {
      _id: '$qrPromoId',
      views: { $sum: 1 },
      uniqueCustomers: { $addToSet: '$phoneHash' }
    }},
    { $sort: { views: -1 } }
  ]).toArray()
  
  return { promotionUsage, qrPromoViews }
}

async function temporalDeepAnalysis(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  console.log('  📊 Deep temporal analysis...')
  
  // Hourly patterns
  const hourlyPatterns = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $group: {
      _id: { $hour: '$createdAt' },
      count: { $sum: 1 },
      revenue: { $sum: '$total' },
      avgTicket: { $avg: '$total' }
    }},
    { $sort: { _id: 1 } }
  ]).toArray()
  
  // Day of week patterns
  const dowPatterns = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $group: {
      _id: { $dayOfWeek: '$createdAt' },
      count: { $sum: 1 },
      revenue: { $sum: '$total' },
      avgTicket: { $avg: '$total' }
    }},
    { $sort: { _id: 1 } }
  ]).toArray()
  
  // Daily trends
  const dailyTrends = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $group: {
      _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
      count: { $sum: 1 },
      revenue: { $sum: '$total' },
      avgTicket: { $avg: '$total' }
    }},
    { $sort: { _id: 1 } }
  ]).toArray()
  
  return { hourlyPatterns, dowPatterns, dailyTrends }
}

async function generateFinalReport() {
  console.log('🔍 FINAL COMPREHENSIVE ANALYSIS — Keke & Larry')
  console.log('='.repeat(70))
  
  try {
    await connect()
    
    const tenantId = new mongoose.Types.ObjectId(TENANT_ID)
    
    // Run all deep analyses
    console.log('\n📊 Running deep analyses...')
    
    const productAnalysis = await deepProductAnalysis(tenantId)
    const customerAnalysis = await customerDeepAnalysis(tenantId)
    const loyaltyAnalysis = await loyaltyDeepAnalysis(tenantId)
    const promotionAnalysis_data = await promotionAnalysis(tenantId)
    const temporalAnalysis = await temporalDeepAnalysis(tenantId)
    
    // Combine all analyses
    const finalReport = {
      timestamp: new Date().toISOString(),
      productAnalysis,
      customerAnalysis,
      loyaltyAnalysis,
      promotionAnalysis: promotionAnalysis_data,
      temporalAnalysis
    }
    
    // Save report
    const reportPath = path.join(OUTPUT_DIR, 'final-comprehensive-analysis.json')
    fs.writeFileSync(reportPath, JSON.stringify(finalReport, null, 2))
    
    // Generate comprehensive markdown
    const mdPath = path.join(OUTPUT_DIR, 'FINAL_COMPREHENSIVE_REPORT.md')
    const mdContent = generateFinalMarkdown(finalReport)
    fs.writeFileSync(mdPath, mdContent)
    
    console.log('\n' + '='.repeat(70))
    console.log('✅ FINAL ANALYSIS COMPLETE')
    console.log('='.repeat(70))
    console.log(`\n📄 Report: ${reportPath}`)
    console.log(`📝 Markdown: ${mdPath}`)
    
  } catch (error) {
    console.error('❌ Error:', error)
    throw error
  } finally {
    await disconnect()
  }
}

function generateFinalMarkdown(report: any): string {
  const { productAnalysis, customerAnalysis, loyaltyAnalysis, promotionAnalysis, temporalAnalysis } = report
  
  return `# Final Comprehensive Analysis - Keke & Larry
**Generated:** ${report.timestamp}

## 9. PRODUCT INTELLIGENCE (DEEP)

### Time Series Data
${productAnalysis.productTimeSeries.slice(0, 50).map((p: any) => 
  `- **${p._id.productName}** (${p._id.month}): ${p.quantity} units, $${(p.revenue / 100).toFixed(2)}`
).join('\n')}

### Hourly Patterns
${temporalAnalysis.hourlyPatterns.map((h: any) => 
  `- Hour ${h._id}: ${h.count} orders, $${(h.revenue / 100).toFixed(2)}, avg $${(h.avgTicket / 100).toFixed(2)}`
).join('\n')}

### Day of Week Patterns
${temporalAnalysis.dowPatterns.map((d: any) => 
  `- Day ${d._id}: ${d.count} orders, $${(d.revenue / 100).toFixed(2)}, avg $${(d.avgTicket / 100).toFixed(2)}`
).join('\n')}

## 10. CUSTOMER INTELLIGENCE (DEEP)

### Customer Cohorts
${customerAnalysis.customerCohorts.map((c: any) => 
  `- **${c._id}**: ${c.customerCount} customers, avg $${(c.avgSpent / 100).toFixed(2)}, ${c.avgOrders.toFixed(1)} orders`
).join('\n')}

### Purchase Patterns
Top 10 customers by spend:
${customerAnalysis.purchasePatterns.slice(0, 10).map((p: any) => 
  `- Customer ${p._id.substring(0, 8)}...: ${p.totalOrders} orders, $${(p.totalSpent / 100).toFixed(2)}, avg $${(p.avgOrderValue / 100).toFixed(2)}`
).join('\n')}

## 14. LOYALTY / CLUB (DEEP)

### Member Acquisition
${loyaltyAnalysis.memberAcquisition.map((m: any) => 
  `- **${m._id}**: ${m.count} new members`
).join('\n')}

### Member Activity
- Total Members: ${loyaltyAnalysis.memberActivity.totalMembers || 0}
- Members with Points: ${loyaltyAnalysis.memberActivity.membersWithPoints || 0}
- Members with Redemptions: ${loyaltyAnalysis.memberActivity.membersWithRedemptions || 0}
- Total Points: ${loyaltyAnalysis.memberActivity.totalPoints || 0}
- Total Redemptions: ${loyaltyAnalysis.memberActivity.totalRedemptions || 0}
- Total Points Spent: ${loyaltyAnalysis.memberActivity.totalPointsSpent || 0}

### Member vs Non-Member Comparison

**Members:**
- Orders: ${loyaltyAnalysis.memberBehavior.totalOrders || 0}
- Revenue: $${((loyaltyAnalysis.memberBehavior.totalRevenue || 0) / 100).toFixed(2)}
- Avg Ticket: $${((loyaltyAnalysis.memberBehavior.avgTicket || 0) / 100).toFixed(2)}
- Unique Customers: ${loyaltyAnalysis.memberBehavior.uniqueCustomerCount || 0}

**Non-Members:**
- Orders: ${loyaltyAnalysis.nonMemberBehavior.totalOrders || 0}
- Revenue: $${((loyaltyAnalysis.nonMemberBehavior.totalRevenue || 0) / 100).toFixed(2)}
- Avg Ticket: $${((loyaltyAnalysis.nonMemberBehavior.avgTicket || 0) / 100).toFixed(2)}
- Unique Customers: ${loyaltyAnalysis.nonMemberBehavior.uniqueCustomerCount || 0}

## 15. PROMOTIONS

### Promotion Usage
${promotionAnalysis.promotionUsage.map((p: any) => 
  p._id ? `- **${p._id}**: ${p.count} uses, $${(p.totalDiscount / 100).toFixed(2)} discount` : ''
).filter(Boolean).join('\n')}

### QR Promo Views
${promotionAnalysis.qrPromoViews.map((q: any) => 
  `- Promo ${q._id}: ${q.views} views, ${q.uniqueCustomers.length} unique customers`
).join('\n')}

## 12. TEMPORAL INTELLIGENCE (DEEP)

### Daily Trends (Last 30 days)
${temporalAnalysis.dailyTrends.slice(-30).map((d: any) => 
  `- **${d._id}**: ${d.count} orders, $${(d.revenue / 100).toFixed(2)}, avg $${(d.avgTicket / 100).toFixed(2)}`
).join('\n')}
`
}

generateFinalReport()
