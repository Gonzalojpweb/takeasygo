import mongoose from 'mongoose'
import * as fs from 'fs'
import * as path from 'path'

// ─────────────────────────────────────────────────────────────────────────────
// TGO DATA INTELLIGENCE AUDIT — Keke & Larry (Extended Analysis)
// Script de análisis profundo (READ-ONLY)
// ─────────────────────────────────────────────────────────────────────────────

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://pgonzalojose_db_user:6oXEemLauaEuPoaq@takeasygo.ssjlhfw.mongodb.net/?appName=takeasygo'
const TENANT_ID = '69f8bf6ad3fcc97fd64bec87'

async function connect() {
  await mongoose.connect(MONGODB_URI, { bufferCommands: false, maxPoolSize: 5 })
  console.log('✅ Connected to MongoDB')
}

async function disconnect() {
  await mongoose.disconnect()
  console.log('✅ Disconnected')
}

async function runExtendedAnalysis() {
  console.log('🔍 TGO EXTENDED ANALYSIS — Keke & Larry')
  console.log('='.repeat(60))

  try {
    await connect()
    const db = mongoose.connection.db!
    const tenantId = new mongoose.Types.ObjectId(TENANT_ID)

    // ═══════════════════════════════════════════════════════════════════════
    // FASE 5 — RETENTION ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📊 FASE 5: RETENTION ANALYSIS')

    // Customer lifetime: days between first and last order
    const customerLifetime = await db.collection('orders').aggregate([
      { $match: { tenantId, status: { $nin: ['cancelled'] } } },
      { $group: {
        _id: '$customer.phoneHash',
        firstOrder: { $min: '$createdAt' },
        lastOrder: { $max: '$createdAt' },
        orderCount: { $sum: 1 },
        totalSpent: { $sum: '$total' }
      }},
      { $project: {
        _id: 1,
        firstOrder: 1,
        lastOrder: 1,
        orderCount: 1,
        totalSpent: 1,
        daysBetween: {
          $divide: [
            { $subtract: ['$lastOrder', '$firstOrder'] },
            86400000 // milliseconds per day
          ]
        }
      }},
      { $sort: { totalSpent: -1 } }
    ]).toArray()

    // Time to second purchase
    const timeToSecondPurchase = await db.collection('orders').aggregate([
      { $match: { tenantId, status: { $nin: ['cancelled'] } } },
      { $sort: { createdAt: 1 } },
      { $group: {
        _id: '$customer.phoneHash',
        orders: { $push: '$createdAt' }
      }},
      { $match: { 'orders.1': { $exists: true } } },
      { $project: {
        _id: 1,
        daysToSecond: {
          $divide: [
            { $subtract: [{ $arrayElemAt: ['$orders', 1] }, { $arrayElemAt: ['$orders', 0] }] },
            86400000
          ]
        }
      }}
    ]).toArray()

    // Cohort analysis by month
    const cohortData = await db.collection('orders').aggregate([
      { $match: { tenantId, status: { $nin: ['cancelled'] } } },
      { $sort: { createdAt: 1 } },
      { $group: {
        _id: {
          phoneHash: '$customer.phoneHash',
          firstMonth: { $dateToString: { format: '%Y-%m', date: { $min: '$createdAt' } } }
        },
        orders: { $push: { date: '$createdAt', total: '$total' } },
        orderCount: { $sum: 1 }
      }},
      { $group: {
        _id: '$_id.firstMonth',
        customers: { $addToSet: '$_id.phoneHash' },
        customerCount: { $sum: 1 }
      }},
      { $project: {
        month: '$_id',
        customerCount: 1,
        customers: 1
      }},
      { $sort: { month: 1 } }
    ]).toArray()

    // For each cohort, check how many came back in subsequent months
    const cohortRetention: any[] = []
    for (const cohort of cohortData) {
      const monthStr = cohort.month
      const customers = cohort.customers

      // Get orders for these customers after their first month
      const subsequentOrders = await db.collection('orders').aggregate([
        { $match: {
          tenantId,
          'customer.phoneHash': { $in: customers },
          status: { $nin: ['cancelled'] },
          createdAt: { $gt: new Date(`${monthStr}-01T23:59:59.999Z`) }
        }},
        { $group: {
          _id: '$customer.phoneHash',
          orderCount: { $sum: 1 },
          totalSpent: { $sum: '$total' }
        }}
      ]).toArray()

      const repeatCustomers = subsequentOrders.filter((c: any) => c.orderCount >= 1).length
      const twoPlusOrders = subsequentOrders.filter((c: any) => c.orderCount >= 2).length
      const threePlusOrders = subsequentOrders.filter((c: any) => c.orderCount >= 3).length
      const subsequentRevenue = subsequentOrders.reduce((sum: number, c: any) => sum + c.totalSpent, 0)

      cohortRetention.push({
        month: monthStr,
        totalCustomers: customers.length,
        returnedAfterFirstMonth: repeatCustomers,
        returnRate: customers.length > 0 ? (repeatCustomers / customers.length * 100).toFixed(1) : 0,
        twoPlusOrders,
        twoPlusRate: customers.length > 0 ? (twoPlusOrders / customers.length * 100).toFixed(1) : 0,
        threePlusOrders,
        threePlusRate: customers.length > 0 ? (threePlusOrders / customers.length * 100).toFixed(1) : 0,
        subsequentRevenue
      })
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FASE 6 — CUSTOMER VALUE
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📊 FASE 6: CUSTOMER VALUE')

    const customerValue = await db.collection('orders').aggregate([
      { $match: { tenantId, status: { $nin: ['cancelled'] } } },
      { $group: {
        _id: '$customer.phoneHash',
        totalOrders: { $sum: 1 },
        totalRevenue: { $sum: '$total' },
        avgTicket: { $avg: '$total' },
        firstOrder: { $min: '$createdAt' },
        lastOrder: { $max: '$createdAt' }
      }},
      { $sort: { totalRevenue: -1 } }
    ]).toArray()

    const totalRevenue = customerValue.reduce((sum: number, c: any) => sum + c.totalRevenue, 0)
    const top10Revenue = customerValue.slice(0, 10).reduce((sum: number, c: any) => sum + c.totalRevenue, 0)
    const top10Share = totalRevenue > 0 ? (top10Revenue / totalRevenue * 100).toFixed(1) : 0

    // ═══════════════════════════════════════════════════════════════════════
    // FASE 9 — UPSELLING ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📊 FASE 9: UPSELLING ANALYSIS')

    const UPSELL_SOURCES = ['upsell_sheet', 'checkout_banner', 'best_sellers']

    const upsellStats = await db.collection('orders').aggregate([
      { $match: { tenantId, status: { $nin: ['cancelled'] } } },
      { $unwind: '$items' },
      { $group: {
        _id: {
          source: '$items.addedFrom',
          itemName: '$items.name'
        },
        quantity: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.subtotal' },
        orderCount: { $sum: 1 }
      }},
      { $sort: { revenue: -1 } }
    ]).toArray()

    const upsellItems = upsellStats.filter((u: any) => UPSELL_SOURCES.includes(u._id?.source))
    const nonUpsellItems = upsellStats.filter((u: any) => !UPSELL_SOURCES.includes(u._id?.source) && u._id?.source)

    const totalUpsellRevenue = upsellItems.reduce((sum: number, u: any) => sum + u.revenue, 0)
    const totalNonUpsellRevenue = nonUpsellItems.reduce((sum: number, u: any) => sum + u.revenue, 0)
    const totalUpsellQuantity = upsellItems.reduce((sum: number, u: any) => sum + u.quantity, 0)

    // Orders with upsell items
    const ordersWithUpsell = await db.collection('orders').aggregate([
      { $match: { tenantId, status: { $nin: ['cancelled'] } } },
      { $unwind: '$items' },
      { $match: { 'items.addedFrom': { $in: UPSELL_SOURCES } } },
      { $group: { _id: '$_id' } },
      { $count: 'total' }
    ]).toArray()

    const totalValidOrders = await db.collection('orders').countDocuments({ tenantId, status: { $nin: ['cancelled'] } })

    // ═══════════════════════════════════════════════════════════════════════
    // FASE 10 — TIA ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📊 FASE 10: TIA ANALYSIS')

    const tiaBySource = await db.collection('tiainsights').aggregate([
      { $match: { tenantId } },
      { $group: { _id: '$source', count: { $sum: 1 } } }
    ]).toArray()

    const tiaRecentActive = await db.collection('tiainsights').find(
      { tenantId, status: 'active' },
      { projection: { title: 1, description: 1, type: 1, severity: 1, category: 1, metric: 1, currentValue: 1, recommendation: 1 } }
    ).sort({ generatedAt: -1 }).limit(10).toArray()

    // ═══════════════════════════════════════════════════════════════════════
    // FASE 11 — CIS ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📊 FASE 11: CIS ANALYSIS')

    const customerProfiles = await db.collection('customerprofiles').aggregate([
      { $match: { tenantId } },
      { $group: {
        _id: '$segment',
        count: { $sum: 1 },
        avgOrderCount: { $avg: '$orderCount' },
        avgTotalSpent: { $avg: '$totalSpent' },
        avgHealthScore: { $avg: '$healthScore.total' }
      }},
      { $sort: { count: -1 } }
    ]).toArray()

    const healthScoreDistribution = await db.collection('customerprofiles').aggregate([
      { $match: { tenantId } },
      { $bucket: {
        groupBy: '$healthScore.total',
        boundaries: [0, 20, 40, 60, 80, 100],
        default: '100+',
        output: {
          count: { $sum: 1 },
          avgOrderCount: { $avg: '$orderCount' },
          avgTotalSpent: { $avg: '$totalSpent' }
        }
      }}
    ]).toArray()

    // ═══════════════════════════════════════════════════════════════════════
    // FASE 12 — FEEDBACK INTELLIGENCE
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📊 FASE 12: FEEDBACK INTELLIGENCE')

    const feedbackDetails = await db.collection('feedbacks').find(
      { tenantId },
      { projection: { event: 1, satisfaction: 1, errorType: 1, errorDetail: 1, comment: 1, understoodPoints: 1, wasEasy: 1, wasUseful: 1, clientHash: 1, createdAt: 1 } }
    ).toArray()

    const feedbackWithComments = feedbackDetails.filter((f: any) => f.comment && f.comment.trim() !== '')

    // ═══════════════════════════════════════════════════════════════════════
    // FASE 13 — PRODUCT INTELLIGENCE
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📊 FASE 13: PRODUCT INTELLIGENCE')

    // Product co-occurrence (products bought together in same order)
    const coOccurrence = await db.collection('orders').aggregate([
      { $match: { tenantId, status: { $nin: ['cancelled'] } } },
      { $unwind: '$items' },
      { $group: {
        _id: '$_id',
        products: { $addToSet: '$items.name' },
        totalProducts: { $sum: 1 }
      }},
      { $match: { totalProducts: { $gte: 2 } } },
      { $unwind: {
        path: '$products',
        includeArrayIndex: 'idx1'
      }},
      { $unwind: {
        path: '$products',
        includeArrayIndex: 'idx2'
      }},
      { $match: { $expr: { $lt: ['$idx1', '$idx2'] } } },
      { $group: {
        _id: { product1: { $arrayElemAt: ['$products', 0] }, product2: { $arrayElemAt: ['$products', 1] } },
        count: { $sum: 1 }
      }},
      { $sort: { count: -1 } },
      { $limit: 15 }
    ]).toArray()

    // ═══════════════════════════════════════════════════════════════════════
    // FASE 14 — TEMPORAL INTELLIGENCE (detailed)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📊 FASE 14: TEMPORAL INTELLIGENCE')

    // Ticket by hour
    const ticketByHour = await db.collection('orders').aggregate([
      { $match: { tenantId, status: { $nin: ['cancelled'] } } },
      { $group: {
        _id: { $hour: '$createdAt' },
        avgTicket: { $avg: '$total' },
        count: { $sum: 1 },
        totalRevenue: { $sum: '$total' }
      }},
      { $sort: { _id: 1 } }
    ]).toArray()

    // Ticket by day of week
    const ticketByDayOfWeek = await db.collection('orders').aggregate([
      { $match: { tenantId, status: { $nin: ['cancelled'] } } },
      { $group: {
        _id: { $dayOfWeek: '$createdAt' },
        avgTicket: { $avg: '$total' },
        count: { $sum: 1 },
        totalRevenue: { $sum: '$total' }
      }},
      { $sort: { _id: 1 } }
    ]).toArray()

    // ═══════════════════════════════════════════════════════════════════════
    // FASE 15 — STATISTICAL ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📊 FASE 15: STATISTICAL ANALYSIS')

    // Ticket distribution (percentiles)
    const ticketPercentiles = await db.collection('orders').aggregate([
      { $match: { tenantId, status: { $nin: ['cancelled'] } } },
      { $group: { _id: null, tickets: { $push: '$total' } } },
      { $project: {
        _id: 0,
        p10: { $arrayElemAt: ['$tickets', { $floor: { $multiply: [{ $size: '$tickets' }, 0.10] } }] },
        p25: { $arrayElemAt: ['$tickets', { $floor: { $multiply: [{ $size: '$tickets' }, 0.25] } }] },
        p50: { $arrayElemAt: ['$tickets', { $floor: { $multiply: [{ $size: '$tickets' }, 0.50] } }] },
        p75: { $arrayElemAt: ['$tickets', { $floor: { $multiply: [{ $size: '$tickets' }, 0.75] } }] },
        p90: { $arrayElemAt: ['$tickets', { $floor: { $multiply: [{ $size: '$tickets' }, 0.90] } }] },
        count: { $size: '$tickets' }
      }}
    ]).toArray()

    // Revenue concentration (Gini-like)
    const revenueDistribution = customerValue.map((c: any) => c.totalRevenue).sort((a: number, b: number) => a - b)
    const cumulativeRevenue: number[] = []
    let cumSum = 0
    for (const rev of revenueDistribution) {
      cumSum += rev
      cumulativeRevenue.push(cumSum)
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FASE 18 — DATASET GENERATION
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📊 FASE 18: GENERATING ANALYTICAL DATASETS')

    // customer_analytics
    const customerAnalytics = await db.collection('orders').aggregate([
      { $match: { tenantId, status: { $nin: ['cancelled'] } } },
      { $sort: { createdAt: 1 } },
      { $group: {
        _id: '$customer.phoneHash',
        firstOrderDate: { $min: '$createdAt' },
        lastOrderDate: { $max: '$createdAt' },
        totalOrders: { $sum: 1 },
        totalRevenue: { $sum: '$total' },
        tickets: { $push: '$total' }
      }},
      { $lookup: {
        from: 'loyaltymembers',
        let: { phoneHash: '$_id' },
        pipeline: [
          { $match: { tenantId, status: 'active' } },
          { $match: { $expr: { $eq: ['$phoneHash', '$$phoneHash'] } } }
        ],
        as: 'loyaltyMember'
      }},
      { $project: {
        customer_id: '$_id',
        first_order_date: '$firstOrderDate',
        last_order_date: '$lastOrderDate',
        total_orders: '$totalOrders',
        total_revenue: '$totalRevenue',
        avg_ticket: { $avg: '$tickets' },
        days_since_last_order: {
          $divide: [
            { $subtract: [new Date(), '$lastOrderDate'] },
            86400000
          ]
        },
        repeat_customer: { $gte: ['$totalOrders', 2] },
        club_member: { $gt: [{ $size: '$loyaltyMember' }, 0] }
      }},
      { $sort: { total_revenue: -1 } }
    ]).toArray()

    // ═══════════════════════════════════════════════════════════════════════
    // SAVE RESULTS
    // ═══════════════════════════════════════════════════════════════════════
    const results = {
      timestamp: new Date().toISOString(),
      retention: {
        customerLifetime,
        timeToSecondPurchase,
        cohortRetention
      },
      customerValue: {
        distribution: customerValue,
        top10Share: parseFloat(top10Share),
        totalRevenue
      },
      upselling: {
        items: upsellItems,
        totalUpsellRevenue,
        totalUpsellQuantity,
        ordersWithUpsell: ordersWithUpsell[0]?.total || 0,
        totalValidOrders
      },
      tia: {
        bySource: tiaBySource,
        recentActive: tiaRecentActive
      },
      cis: {
        segments: customerProfiles,
        healthScoreDistribution
      },
      feedback: {
        total: feedbackDetails.length,
        withComments: feedbackWithComments.length,
        comments: feedbackWithComments.map((f: any) => ({
          comment: f.comment,
          satisfaction: f.satisfaction,
          event: f.event,
          createdAt: f.createdAt
        }))
      },
      products: {
        coOccurrence
      },
      temporal: {
        ticketByHour,
        ticketByDayOfWeek
      },
      statistics: {
        ticketPercentiles: ticketPercentiles[0] || {},
        revenueDistribution: {
          cumulativeRevenue,
          customerCount: customerValue.length
        }
      },
      datasets: {
        customerAnalytics: customerAnalytics.slice(0, 50) // Sample
      }
    }

    const outputPath = path.join(__dirname, '../audit-results-keke-larry-extended.json')
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2))

    console.log(`\n✅ Extended analysis complete! Results saved to: ${outputPath}`)

    // Print key findings
    console.log('\n' + '='.repeat(60))
    console.log('📋 KEY FINDINGS SUMMARY')
    console.log('='.repeat(60))

    console.log('\n🔄 RETENTION:')
    console.log(`  - Customer lifetime (avg): ${(customerLifetime.reduce((s: number, c: any) => s + c.daysBetween, 0) / customerLifetime.length).toFixed(1)} days`)
    console.log(`  - Time to second purchase (avg): ${(timeToSecondPurchase.reduce((s: number, c: any) => s + c.daysToSecond, 0) / timeToSecondPurchase.length).toFixed(1)} days`)
    console.log(`  - Cohort retention:`, cohortRetention.map(c => `${c.month}: ${c.returnRate}%`).join(', '))

    console.log('\n💰 CUSTOMER VALUE:')
    console.log(`  - Top 10 customers: ${top10Share}% of revenue`)
    console.log(`  - Total customers: ${customerValue.length}`)

    console.log('\n📈 UPSELLING:')
    console.log(`  - Orders with upsell: ${ordersWithUpsell[0]?.total || 0} / ${totalValidOrders} (${((ordersWithUpsell[0]?.total || 0) / totalValidOrders * 100).toFixed(1)}%)`)
    console.log(`  - Upsell revenue: $${(totalUpsellRevenue / 100).toFixed(2)}`)
    console.log(`  - Upsell items:`, upsellItems.slice(0, 5).map((u: any) => `${u._id.itemName}: ${u.quantity}x`).join(', '))

    console.log('\n🧠 CIS SEGMENTS:')
    for (const seg of customerProfiles) {
      console.log(`  - ${seg._id}: ${seg.count} customers, avg $${(seg.avgTotalSpent / 100).toFixed(2)} spent, avg ${seg.avgOrderCount.toFixed(1)} orders`)
    }

    console.log('\n📊 PRODUCT CO-OCCURRENCE:')
    for (const co of coOccurrence.slice(0, 5)) {
      console.log(`  - ${co._id.product1} + ${co._id.product2}: ${co.count}x together`)
    }

  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await disconnect()
  }
}

runExtendedAnalysis()
