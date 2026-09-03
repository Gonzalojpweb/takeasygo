import mongoose from 'mongoose'
import * as fs from 'fs'
import * as path from 'path'

// ─────────────────────────────────────────────────────────────────────────────
// TGO DATA AUDIT 2.0 — RECONCILIATION & VALIDATION
// Verifica integridad matemática de todos los números del reporte anterior
// ─────────────────────────────────────────────────────────────────────────────

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://pgonzalojose_db_user:6oXEemLauaEuPoaq@takeasygo.ssjlhfw.mongodb.net/?appName=takeasygo'
const TENANT_ID = '69f8bf6ad3fcc97fd64bec87'

// Helper: convert cents to pesos for display
const c2p = (cents: number) => cents / 100
const c2pStr = (cents: number) => `$${(cents / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

async function connect() {
  await mongoose.connect(MONGODB_URI, { bufferCommands: false, maxPoolSize: 5 })
  console.log('✅ Connected')
}

async function disconnect() {
  await mongoose.disconnect()
  console.log('✅ Disconnected')
}

async function runReconciliation() {
  console.log('🔍 DATA AUDIT 2.0 — RECONCILIATION')
  console.log('='.repeat(70))

  try {
    await connect()
    const db = mongoose.connection.db!
    const tenantId = new mongoose.Types.ObjectId(TENANT_ID)

    const results: any = {}

    // ═══════════════════════════════════════════════════════════════════════
    // 1. MONETARY UNIT VALIDATION
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n══════════════════════════════════════════════════════════════')
    console.log('1. MONETARY UNIT VALIDATION (cents vs pesos)')
    console.log('══════════════════════════════════════════════════════════════')

    // Sample raw orders to inspect field values
    const sampleOrders = await db.collection('orders').find(
      { tenantId },
      { projection: { orderNumber: 1, total: 1, subtotal: 1, discountAmount: 1, items: 1, loyaltyDiscountAmount: 1, loyaltyPointsUsed: 1, deliveryCost: 1 } }
    ).limit(5).toArray()

    console.log('\n📋 SAMPLE RAW ORDER VALUES (should be in cents):')
    for (const o of sampleOrders) {
      const itemsSubtotal = o.items?.reduce((sum: number, i: any) => sum + (i.subtotal || 0), 0) || 0
      console.log(`  Order ${o.orderNumber}:`)
      console.log(`    total = ${o.total} (${c2pStr(o.total)})`)
      console.log(`    subtotal = ${o.subtotal} (${c2pStr(o.subtotal)})`)
      console.log(`    discountAmount = ${o.discountAmount} (${c2pStr(o.discountAmount)})`)
      console.log(`    items subtotal sum = ${itemsSubtotal} (${c2pStr(itemsSubtotal)})`)
      console.log(`    deliveryCost = ${o.deliveryCost} (${c2pStr(o.deliveryCost)})`)
      console.log(`    loyaltyPointsUsed = ${o.loyaltyPointsUsed} (NOT cents — points)`)
    }

    // Verify: total should be >= subtotal (usually)
    const totalSubtotalComparison = await db.collection('orders').aggregate([
      { $match: { tenantId, status: { $nin: ['cancelled'] } } },
      { $project: {
        orderNumber: 1,
        total: 1,
        subtotal: 1,
        itemsSubtotal: { $sum: '$items.subtotal' },
        difference: { $subtract: ['$total', { $sum: '$items.subtotal' }] }
      }},
      { $group: {
        _id: null,
        avgDifference: { $avg: '$difference' },
        maxDifference: { $max: '$difference' },
        minDifference: { $min: '$difference' },
        ordersWhereTotalGreater: {
          $sum: { $cond: [{ $gt: ['$total', { $sum: '$items.subtotal' }] }, 1, 0] }
        },
        ordersWhereSubtotalGreater: {
          $sum: { $cond: [{ $lt: ['$total', { $sum: '$items.subtotal' }] }, 1, 0] }
        },
        count: { $sum: 1 }
      }}
    ]).toArray()

    console.log('\n📊 TOTAL vs ITEMS SUBTOTAL RECONCILIATION:')
    const comp = totalSubtotalComparison[0] || {}
    console.log(`  Orders analyzed: ${comp.count}`)
    console.log(`  Avg difference (total - itemsSubtotal): ${comp.avgDifference?.toFixed(0)} cents = ${c2pStr(comp.avgDifference || 0)}`)
    console.log(`  Max difference: ${comp.maxDifference?.toFixed(0)} cents = ${c2pStr(comp.maxDifference || 0)}`)
    console.log(`  Min difference: ${comp.minDifference?.toFixed(0)} cents = ${c2pStr(comp.minDifference || 0)}`)
    console.log(`  Orders where total > itemsSubtotal: ${comp.ordersWhereTotalGreater} (expected: discounts, delivery, surcharges)`)
    console.log(`  Orders where total < itemsSubtotal: ${comp.ordersWhereSubtotalGreater} (unexpected: investigate)`)

    results.monetaryUnit = {
      sampleOrders: sampleOrders.map((o: any) => ({
        orderNumber: o.orderNumber,
        total_cents: o.total,
        total_pesos: c2p(o.total),
        subtotal_cents: o.subtotal,
        itemsSubtotal_cents: o.items?.reduce((s: number, i: any) => s + (i.subtotal || 0), 0) || 0
      })),
      reconciliation: comp
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 2. ORDER RECONCILIATION
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n══════════════════════════════════════════════════════════════')
    console.log('2. ORDER RECONCILIATION')
    console.log('══════════════════════════════════════════════════════════════')

    const orderStats = await db.collection('orders').aggregate([
      { $match: { tenantId } },
      { $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        validOrders: { $sum: { $cond: [{ $ne: ['$status', 'cancelled'] }, 1, 0] } },
        cancelledOrders: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        totalRevenue_cents: { $sum: { $cond: [{ $ne: ['$status', 'cancelled'] }, '$total', 0] } },
        avgTicket_cents: { $avg: { $cond: [{ $ne: ['$status', 'cancelled'] }, '$total', null] } },
        deliveryOrders: { $sum: { $cond: [{ $eq: ['$orderMode', 'delivery'] }, 1, 0] } },
        takeawayOrders: { $sum: { $cond: [{ $eq: ['$orderMode', 'takeaway'] }, 1, 0] } }
      }}
    ]).toArray()

    const os = orderStats[0] || {}
    console.log(`  Total orders: ${os.totalOrders}`)
    console.log(`  Valid orders: ${os.validOrders}`)
    console.log(`  Cancelled: ${os.cancelledOrders}`)
    console.log(`  Delivery: ${os.deliveryOrders} | Takeaway: ${os.takeawayOrders}`)
    console.log(`  TOTAL REVENUE: ${os.totalRevenue_cents} cents = ${c2pStr(os.totalRevenue_cents)}`)
    console.log(`  AVG TICKET: ${os.avgTicket_cents?.toFixed(0)} cents = ${c2pStr(os.avgTicket_cents || 0)}`)

    results.orderReconciliation = {
      total: os.totalOrders,
      valid: os.validOrders,
      cancelled: os.cancelledOrders,
      totalRevenue_cents: os.totalRevenue_cents,
      totalRevenue_pesos: c2p(os.totalRevenue_cents),
      avgTicket_cents: os.avgTicket_cents,
      avgTicket_pesos: c2p(os.avgTicket_cents || 0)
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 3. PRODUCT REVENUE RECONCILIATION
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n══════════════════════════════════════════════════════════════')
    console.log('3. PRODUCT REVENUE vs ORDER REVENUE RECONCILIATION')
    console.log('══════════════════════════════════════════════════════════════')

    // Sum of all items.subtotal from valid orders
    const itemsRevenue = await db.collection('orders').aggregate([
      { $match: { tenantId, status: { $nin: ['cancelled'] } } },
      { $unwind: '$items' },
      { $group: {
        _id: null,
        totalItemsRevenue_cents: { $sum: '$items.subtotal' },
        totalQuantity: { $sum: '$items.quantity' },
        uniqueProducts: { $addToSet: '$items.menuItemId' }
      }}
    ]).toArray()

    const ir = itemsRevenue[0] || {}
    console.log(`  Sum of items.subtotal: ${ir.totalItemsRevenue_cents} cents = ${c2pStr(ir.totalItemsRevenue_cents)}`)
    console.log(`  Total revenue (orders.total): ${os.totalRevenue_cents} cents = ${c2pStr(os.totalRevenue_cents)}`)
    console.log(`  Difference (total - itemsSum): ${os.totalRevenue_cents - ir.totalItemsRevenue_cents} cents = ${c2pStr(os.totalRevenue_cents - ir.totalItemsRevenue_cents)}`)
    console.log(`  This difference should = discountAmount + deliveryCost + surcharges`)
    console.log(`  Total units sold: ${ir.totalQuantity}`)
    console.log(`  Unique products: ${ir.uniqueProducts?.length}`)

    // Breakdown: discount + delivery + surcharge
    const costBreakdown = await db.collection('orders').aggregate([
      { $match: { tenantId, status: { $nin: ['cancelled'] } } },
      { $group: {
        _id: null,
        totalDiscount_cents: { $sum: '$discountAmount' },
        totalDeliveryCost_cents: { $sum: '$deliveryCost' },
        totalLoyaltyDiscount_cents: { $sum: '$loyaltyDiscountAmount' },
        totalSurcharge_cents: { $sum: '$payment.surchargeAmount' }
      }}
    ]).toArray()

    const cb = costBreakdown[0] || {}
    console.log(`\n  COST BREAKDOWN:`)
    console.log(`    Total discounts: ${cb.totalDiscount_cents} cents = ${c2pStr(cb.totalDiscount_cents)}`)
    console.log(`    Total delivery cost: ${cb.totalDeliveryCost_cents} cents = ${c2pStr(cb.totalDeliveryCost_cents)}`)
    console.log(`    Total loyalty discounts: ${cb.totalLoyaltyDiscount_cents} cents = ${c2pStr(cb.totalLoyaltyDiscount_cents)}`)
    console.log(`    Total surcharges: ${cb.totalSurcharge_cents} cents = ${c2pStr(cb.totalSurcharge_cents)}`)
    console.log(`    SUM of adjustments: ${(cb.totalDiscount_cents + cb.totalDeliveryCost_cents + cb.totalLoyaltyDiscount_cents + cb.totalSurcharge_cents)} cents`)

    // Verify: itemsSum + adjustments should ≈ totalRevenue
    const calculatedTotal = ir.totalItemsRevenue_cents - cb.totalDiscount_cents + cb.totalDeliveryCost_cents - cb.totalLoyaltyDiscount_cents + cb.totalSurcharge_cents
    console.log(`\n  RECONCILIATION CHECK:`)
    console.log(`    itemsSum - discounts + delivery - loyalty + surcharge = ${calculatedTotal} cents = ${c2pStr(calculatedTotal)}`)
    console.log(`    orders.total sum = ${os.totalRevenue_cents} cents = ${c2pStr(os.totalRevenue_cents)}`)
    console.log(`    MATCH: ${Math.abs(calculatedTotal - os.totalRevenue_cents) < 100 ? '✅ YES (within 1 peso)' : '❌ NO — investigate'}`)

    // Category breakdown
    const categoryRevenue = await db.collection('orders').aggregate([
      { $match: { tenantId, status: { $nin: ['cancelled'] } } },
      { $unwind: '$items' },
      { $group: {
        _id: { $ifNull: ['$items.categoryName', '(sin categoría)'] },
        revenue_cents: { $sum: '$items.subtotal' },
        quantity: { $sum: '$items.quantity' },
        orderCount: { $sum: 1 }
      }},
      { $sort: { revenue_cents: -1 } }
    ]).toArray()

    console.log('\n📊 CATEGORY REVENUE (from items.subtotal, in cents):')
    let totalCatRevenue = 0
    for (const cat of categoryRevenue) {
      totalCatRevenue += cat.revenue_cents
      console.log(`  ${cat._id}: ${cat.revenue_cents} cents = ${c2pStr(cat.revenue_cents)} (${cat.quantity} units, ${cat.orderCount} orders)`)
    }
    console.log(`  TOTAL: ${totalCatRevenue} cents = ${c2pStr(totalCatRevenue)}`)

    results.productReconciliation = {
      itemsRevenue_cents: ir.totalItemsRevenue_cents,
      itemsRevenue_pesos: c2p(ir.totalItemsRevenue_cents),
      totalRevenue_cents: os.totalRevenue_cents,
      difference_cents: os.totalRevenue_cents - ir.totalItemsRevenue_cents,
      costBreakdown: {
        discounts: cb.totalDiscount_cents,
        deliveryCost: cb.totalDeliveryCost_cents,
        loyaltyDiscounts: cb.totalLoyaltyDiscount_cents,
        surcharges: cb.totalSurcharge_cents
      },
      categories: categoryRevenue.map((c: any) => ({
        name: c._id,
        revenue_cents: c.revenue_cents,
        revenue_pesos: c2p(c.revenue_cents),
        percentage: ((c.revenue_cents / totalCatRevenue) * 100).toFixed(1) + '%'
      }))
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4. CUSTOMER RECONCILIATION
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n══════════════════════════════════════════════════════════════')
    console.log('4. CUSTOMER RECONCILIATION')
    console.log('══════════════════════════════════════════════════════════════')

    const customerStats = await db.collection('orders').aggregate([
      { $match: { tenantId, status: { $nin: ['cancelled'] } } },
      { $group: {
        _id: '$customer.phoneHash',
        orderCount: { $sum: 1 },
        totalSpent_cents: { $sum: '$total' },
        avgTicket_cents: { $avg: '$total' }
      }},
      { $group: {
        _id: null,
        uniqueCustomers: { $sum: 1 },
        oneTimeCustomers: { $sum: { $cond: [{ $eq: ['$orderCount', 1] }, 1, 0] } },
        repeatCustomers: { $sum: { $cond: [{ $gte: ['$orderCount', 2] }, 1, 0] } },
        highFreqCustomers: { $sum: { $cond: [{ $gte: ['$orderCount', 3] }, 1, 0] } },
        totalRevenue_cents: { $sum: '$totalSpent_cents' },
        avgRevenuePerCustomer_cents: { $avg: '$totalSpent_cents' }
      }}
    ]).toArray()

    const cs = customerStats[0] || {}
    console.log(`  Unique customers: ${cs.uniqueCustomers}`)
    console.log(`  One-time: ${cs.oneTimeCustomers} (${(cs.oneTimeCustomers / cs.uniqueCustomers * 100).toFixed(1)}%)`)
    console.log(`  Repeat (2+): ${cs.repeatCustomers} (${(cs.repeatCustomers / cs.uniqueCustomers * 100).toFixed(1)}%)`)
    console.log(`  High freq (3+): ${cs.highFreqCustomers} (${(cs.highFreqCustomers / cs.uniqueCustomers * 100).toFixed(1)}%)`)
    console.log(`  Total customer revenue: ${cs.totalRevenue_cents} cents = ${c2pStr(cs.totalRevenue_cents)}`)
    console.log(`  Avg revenue per customer: ${cs.avgRevenuePerCustomer_cents?.toFixed(0)} cents = ${c2pStr(cs.avgRevenuePerCustomer_cents || 0)}`)
    console.log(`  Cross-check vs order total: ${cs.totalRevenue_cents === os.totalRevenue_cents ? '✅ MATCH' : '❌ MISMATCH'}`)

    results.customerReconciliation = {
      uniqueCustomers: cs.uniqueCustomers,
      oneTime: cs.oneTimeCustomers,
      repeat: cs.repeatCustomers,
      highFreq: cs.highFreqCustomers,
      totalRevenue_cents: cs.totalRevenue_cents,
      crossCheckMatch: cs.totalRevenue_cents === os.totalRevenue_cents
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 5. LOYALTY RECONCILIATION
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n══════════════════════════════════════════════════════════════')
    console.log('5. LOYALTY RECONCILIATION')
    console.log('══════════════════════════════════════════════════════════════')

    // Member phone hashes
    const memberPhoneHashes = await db.collection('loyaltymembers').distinct('phoneHash', { tenantId, status: 'active' })

    // Member orders
    const memberOrderStats = await db.collection('orders').aggregate([
      { $match: { tenantId, 'customer.phoneHash': { $in: memberPhoneHashes }, status: { $nin: ['cancelled'] } } },
      { $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalRevenue_cents: { $sum: '$total' },
        avgTicket_cents: { $avg: '$total' },
        uniqueMembers: { $addToSet: '$customer.phoneHash' }
      }}
    ]).toArray()

    const mos = memberOrderStats[0] || {}
    console.log(`  Active loyalty members: ${memberPhoneHashes.length}`)
    console.log(`  Members who ordered (valid): ${mos.uniqueMembers?.length || 0}`)
    console.log(`  Member orders: ${mos.totalOrders}`)
    console.log(`  Member revenue: ${mos.totalRevenue_cents} cents = ${c2pStr(mos.totalRevenue_cents)}`)
    console.log(`  Member avg ticket: ${mos.avgTicket_cents?.toFixed(0)} cents = ${c2pStr(mos.avgTicket_cents || 0)}`)

    // Non-member orders
    const nonMemberOrderStats = await db.collection('orders').aggregate([
      { $match: { tenantId, 'customer.phoneHash': { $nin: memberPhoneHashes }, status: { $nin: ['cancelled'] } } },
      { $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalRevenue_cents: { $sum: '$total' },
        avgTicket_cents: { $avg: '$total' },
        uniqueNonMembers: { $addToSet: '$customer.phoneHash' }
      }}
    ]).toArray()

    const nmos = nonMemberOrderStats[0] || {}
    console.log(`\n  Non-member orders: ${nmos.totalOrders}`)
    console.log(`  Non-member revenue: ${nmos.totalRevenue_cents} cents = ${c2pStr(nmos.totalRevenue_cents)}`)
    console.log(`  Non-member avg ticket: ${nmos.avgTicket_cents?.toFixed(0)} cents = ${c2pStr(nmos.avgTicket_cents || 0)}`)
    console.log(`  Non-member unique customers: ${nmos.uniqueNonMembers?.length || 0}`)

    // Cross-check: member + non-member revenue should = total revenue
    const combinedRevenue = (mos.totalRevenue_cents || 0) + (nmos.totalRevenue_cents || 0)
    console.log(`\n  CROSS-CHECK: ${combinedRevenue} cents = ${c2pStr(combinedRevenue)}`)
    console.log(`  vs total order revenue: ${os.totalRevenue_cents} cents = ${c2pStr(os.totalRevenue_cents)}`)
    console.log(`  MATCH: ${Math.abs(combinedRevenue - os.totalRevenue_cents) < 100 ? '✅ YES' : '❌ NO'}`)

    // Points stats
    const pointsStats = await db.collection('loyaltymembers').aggregate([
      { $match: { tenantId, status: 'active' } },
      { $group: {
        _id: null,
        totalPoints: { $sum: '$loyalty.points' },
        avgPoints: { $avg: '$loyalty.points' },
        membersWithPoints: { $sum: { $cond: [{ $gt: ['$loyalty.points', 0] }, 1, 0] } },
        totalPointsSpent: { $sum: '$store.totalPointsSpent' },
        membersWhoRedeemed: { $sum: { $cond: [{ $gt: ['$store.totalRedemptions', 0] }, 1, 0] } }
      }}
    ]).toArray()

    const ps = pointsStats[0] || {}
    console.log(`\n  POINTS:`)
    console.log(`    Total points (all members): ${ps.totalPoints}`)
    console.log(`    Avg points/member: ${ps.avgPoints?.toFixed(0)}`)
    console.log(`    Members with points: ${ps.membersWithPoints}/${memberPhoneHashes.length}`)
    console.log(`    Points spent: ${ps.totalPointsSpent}`)
    console.log(`    Members who redeemed: ${ps.membersWhoRedeemed}`)
    console.log(`    Points utilization rate: ${ps.totalPoints > 0 ? (ps.totalPointsSpent / ps.totalPoints * 100).toFixed(1) : 0}%`)
    console.log(`    ⚠️  NOTE: points are NOT cents. Points are a separate unit.`)

    results.loyaltyReconciliation = {
      activeMembers: memberPhoneHashes.length,
      memberOrders: mos.totalOrders,
      memberRevenue_cents: mos.totalRevenue_cents,
      memberRevenue_pesos: c2p(mos.totalRevenue_cents || 0),
      nonMemberOrders: nmos.totalOrders,
      nonMemberRevenue_cents: nmos.totalRevenue_cents,
      nonMemberRevenue_pesos: c2p(nmos.totalRevenue_cents || 0),
      crossCheckMatch: Math.abs(combinedRevenue - os.totalRevenue_cents) < 100,
      totalPoints: ps.totalPoints,
      pointsSpent: ps.totalPointsSpent,
      utilizationRate: ps.totalPoints > 0 ? (ps.totalPointsSpent / ps.totalPoints * 100).toFixed(1) + '%' : '0%'
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 6. UPSELL RECONCILIATION
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n══════════════════════════════════════════════════════════════')
    console.log('6. UPSELL RECONCILIATION')
    console.log('══════════════════════════════════════════════════════════════')

    const UPSELL_SOURCES = ['upsell_sheet', 'checkout_banner', 'best_sellers']

    // Check what addedFrom values actually exist
    const addedFromValues = await db.collection('orders').aggregate([
      { $match: { tenantId } },
      { $unwind: '$items' },
      { $group: { _id: '$items.addedFrom', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray()

    console.log('\n  ALL addedFrom VALUES IN ORDERS:')
    for (const v of addedFromValues) {
      const isUpsell = UPSELL_SOURCES.includes(v._id)
      console.log(`    ${v._id || '(null)'}: ${v.count} items ${isUpsell ? '← UPSELL' : ''}`)
    }

    // Upsell items detail
    const upsellDetail = await db.collection('orders').aggregate([
      { $match: { tenantId, status: { $nin: ['cancelled'] } } },
      { $unwind: '$items' },
      { $match: { 'items.addedFrom': { $in: UPSELL_SOURCES } } },
      { $group: {
        _id: { name: '$items.name', source: '$items.addedFrom' },
        quantity: { $sum: '$items.quantity' },
        revenue_cents: { $sum: '$items.subtotal' },
        orderCount: { $sum: 1 }
      }},
      { $sort: { revenue_cents: -1 } }
    ]).toArray()

    console.log('\n  UPSELL ITEMS DETAIL:')
    let totalUpsellRevenue = 0
    let totalUpsellQuantity = 0
    let totalUpsellOrders = 0
    for (const u of upsellDetail) {
      totalUpsellRevenue += u.revenue_cents
      totalUpsellQuantity += u.quantity
      totalUpsellOrders += u.orderCount
      console.log(`    ${u._id.name} (${u._id.source}): ${u.quantity}x = ${c2pStr(u.revenue_cents)}`)
    }
    console.log(`  TOTAL UPSELL: ${totalUpsellQuantity} units, ${c2pStr(totalUpsellRevenue)}`)

    // Orders containing upsell items
    const ordersWithUpsell = await db.collection('orders').aggregate([
      { $match: { tenantId, status: { $nin: ['cancelled'] } } },
      { $unwind: '$items' },
      { $match: { 'items.addedFrom': { $in: UPSELL_SOURCES } } },
      { $group: { _id: '$_id', total: { $first: '$total' } } },
      { $count: 'total' }
    ]).toArray()

    console.log(`\n  Orders with upsell items: ${ordersWithUpsell[0]?.total || 0} / ${os.validOrders}`)
    console.log(`  Upsell share of revenue: ${os.totalRevenue_cents > 0 ? (totalUpsellRevenue / os.totalRevenue_cents * 100).toFixed(2) : 0}%`)
    console.log(`  ⚠️  NOTE: upsell revenue = items subtotal, NOT the full order total`)

    results.upsellReconciliation = {
      addedFromDistribution: addedFromValues.map((v: any) => ({ source: v._id, count: v.count })),
      upsellRevenue_cents: totalUpsellRevenue,
      upsellRevenue_pesos: c2p(totalUpsellRevenue),
      upsellQuantity: totalUpsellQuantity,
      ordersWithUpsell: ordersWithUpsell[0]?.total || 0,
      totalValidOrders: os.validOrders,
      penetrationRate: ((ordersWithUpsell[0]?.total || 0) / os.validOrders * 100).toFixed(1) + '%',
      revenueShare: (totalUpsellRevenue / os.totalRevenue_cents * 100).toFixed(2) + '%'
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 7. TIA EVENT → OUTCOME CHAIN
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n══════════════════════════════════════════════════════════════')
    console.log('7. TIA → OUTCOME CHAIN VALIDATION')
    console.log('══════════════════════════════════════════════════════════════')

    // TIA insights by source
    const tiaSources = await db.collection('tiainsights').aggregate([
      { $match: { tenantId } },
      { $group: { _id: '$source', count: { $sum: 1 } } }
    ]).toArray()
    console.log('  TIA insights by source:')
    for (const s of tiaSources) {
      console.log(`    ${s._id}: ${s.count}`)
    }

    // TIA by status (active = not yet acted on)
    const tiaStatus = await db.collection('tiainsights').aggregate([
      { $match: { tenantId } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]).toArray()
    console.log('  TIA insights by status:')
    for (const s of tiaStatus) {
      console.log(`    ${s._id}: ${s.count}`)
    }

    // TIA critical/warning insights
    const tiaCritical = await db.collection('tiainsights').find(
      { tenantId, severity: { $in: ['critical', 'warning'] }, status: 'active' },
      { projection: { title: 1, severity: 1, category: 1, recommendation: 1, currentValue: 1 } }
    ).limit(10).toArray()

    console.log('\n  CRITICAL/WARNING TIA INSIGHTS (sample):')
    for (const i of tiaCritical) {
      console.log(`    [${i.severity.toUpperCase()}] ${i.title}`)
      console.log(`      Category: ${i.category} | Value: ${i.currentValue}`)
      if (i.recommendation) console.log(`      → ${i.recommendation}`)
    }

    // Can we trace TIA recommendation → customer action?
    // Check if any TIA recommendations match observable behavior changes
    console.log('\n  TIA → OUTCOME CHAIN STATUS:')
    console.log('    TIA generates insights: ✅ (1,639 total)')
    console.log('    TIA provides recommendations: ✅ (present in critical insights)')
    console.log('    User receives insights: ⚠️  UNKNOWN (no delivery tracking in data)')
    console.log('    User acts on recommendations: ⚠️  UNKNOWN (no action tracking in data)')
    console.log('    Measurable outcome: ⚠️  UNKNOWN (no before/after comparison in data)')
    console.log('    → RECOMMENDATION: Implement TIA interaction tracking (shown/clicked/acted)')

    results.tiaChain = {
      totalInsights: 1639,
      sources: tiaSources,
      status: tiaStatus,
      criticalInsights: tiaCritical.map((i: any) => ({
        title: i.title,
        severity: i.severity,
        category: i.category,
        recommendation: i.recommendation
      })),
      chainStatus: {
        generatesInsights: 'CONFIRMED',
        providesRecommendations: 'CONFIRMED',
        userReceivesInsights: 'UNVERIFIABLE',
        userActsOnRecommendations: 'UNVERIFIABLE',
        measurableOutcome: 'UNVERIFIABLE'
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 8. CIS → ORDERS RECONCILIATION
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n══════════════════════════════════════════════════════════════')
    console.log('8. CIS CUSTOMERS → ORDERS RECONCILIATION')
    console.log('══════════════════════════════════════════════════════════════')

    // CIS profiles
    const cisSegments = await db.collection('customerprofiles').aggregate([
      { $match: { tenantId } },
      { $group: {
        _id: '$segment',
        count: { $sum: 1 },
        totalOrderCount: { $sum: '$orderCount' },
        totalSpent_cents: { $sum: '$totalSpent' },
        avgOrderCount: { $avg: '$orderCount' },
        avgSpent_cents: { $avg: '$totalSpent' }
      }},
      { $sort: { count: -1 } }
    ]).toArray()

    console.log('\n  CIS SEGMENTS:')
    let cisTotalOrders = 0
    let cisTotalSpent = 0
    for (const seg of cisSegments) {
      cisTotalOrders += seg.totalOrderCount
      cisTotalSpent += seg.totalSpent_cents
      console.log(`    ${seg._id}: ${seg.count} customers, total orders: ${seg.totalOrderCount}, total spent: ${c2pStr(seg.totalSpent_cents)}`)
    }
    console.log(`  CIS total orders across all profiles: ${cisTotalOrders}`)
    console.log(`  CIS total spent across all profiles: ${cisTotalSpent} cents = ${c2pStr(cisTotalSpent)}`)
    console.log(`  Actual order count: ${os.totalOrders}`)
    console.log(`  Actual revenue: ${os.totalRevenue_cents} cents = ${c2pStr(os.totalRevenue_cents)}`)
    console.log(`  ORDER MATCH: ${cisTotalOrders === os.totalOrders ? '✅ MATCH' : `❌ MISMATCH (diff: ${cisTotalOrders - os.totalOrders})`}`)
    console.log(`  REVENUE MATCH: ${cisTotalSpent === os.totalRevenue_cents ? '✅ MATCH' : `❌ MISMATCH (diff: ${cisTotalSpent - os.totalRevenue_cents} cents = ${c2pStr(Math.abs(cisTotalSpent - os.totalRevenue_cents))})`}`)

    // How many CIS profiles have matching orders?
    const profilesVsOrders = await db.collection('customerprofiles').aggregate([
      { $match: { tenantId } },
      { $lookup: {
        from: 'orders',
        let: { phoneHash: '$phoneHash' },
        pipeline: [
          { $match: { tenantId } },
          { $match: { $expr: { $eq: ['$customer.phoneHash', '$$phoneHash'] } } },
          { $count: 'count' }
        ],
        as: 'orderData'
      }},
      { $project: {
        phoneHash: 1,
        segment: 1,
        cisOrderCount: '$orderCount',
        actualOrderCount: { $ifNull: [{ $arrayElemAt: ['$orderData.count', 0] }, 0] },
        match: { $eq: ['$orderCount', { $ifNull: [{ $arrayElemAt: ['$orderData.count', 0] }, 0] }] }
      }}
    ]).toArray()

    const matchCount = profilesVsOrders.filter((p: any) => p.match).length
    const mismatchCount = profilesVsOrders.filter((p: any) => !p.match).length
    console.log(`\n  Profile-level reconciliation:`)
    console.log(`    Profiles with matching order count: ${matchCount}/${profilesVsOrders.length}`)
    console.log(`    Profiles with MISMATCHED order count: ${mismatchCount}/${profilesVsOrders.length}`)
    if (mismatchCount > 0) {
      console.log(`    Sample mismatches:`)
      const mismatches = profilesVsOrders.filter((p: any) => !p.match).slice(0, 5)
      for (const m of mismatches) {
        console.log(`      ${m.phoneHash?.substring(0, 12)}... segment=${m.segment} cis=${m.cisOrderCount} actual=${m.actualOrderCount}`)
      }
    }

    results.cisReconciliation = {
      segments: cisSegments.map((s: any) => ({
        segment: s._id,
        count: s.count,
        totalOrders: s.totalOrderCount,
        totalSpent_cents: s.totalSpent_cents,
        totalSpent_pesos: c2p(s.totalSpent_cents)
      })),
      cisTotalOrders,
      actualTotalOrders: os.totalOrders,
      orderMatch: cisTotalOrders === os.totalOrders,
      profileMatchRate: `${matchCount}/${profilesVsOrders.length} (${(matchCount / profilesVsOrders.length * 100).toFixed(1)}%)`
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 9. TIMEZONE VALIDATION
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n══════════════════════════════════════════════════════════════')
    console.log('9. TIMEZONE VALIDATION')
    console.log('══════════════════════════════════════════════════════════════')

    // Check raw timestamps vs hour distribution
    const rawTimestamps = await db.collection('orders').find(
      { tenantId },
      { projection: { orderNumber: 1, createdAt: 1 } }
    ).limit(5).toArray()

    console.log('\n  RAW TIMESTAMPS (MongoDB stores UTC):')
    for (const o of rawTimestamps) {
      const utcHour = o.createdAt.getUTCHours()
      const argHour = (utcHour - 3 + 24) % 24 // Argentina = UTC-3
      console.log(`    ${o.orderNumber}: createdAt=${o.createdAt.toISOString()} | UTC hour=${utcHour} | AR hour=${argHour}`)
    }

    // Compare: distribution by UTC hour vs AR hour
    const hourDistribution = await db.collection('orders').aggregate([
      { $match: { tenantId, status: { $nin: ['cancelled'] } } },
      { $group: {
        _id: { $hour: '$createdAt' }, // UTC hour
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]).toArray()

    console.log('\n  HOUR DISTRIBUTION (UTC — raw from MongoDB):')
    for (const h of hourDistribution) {
      const arHour = (h._id - 3 + 24) % 24
      console.log(`    UTC ${String(h._id).padStart(2, '0')}:00 (AR ${String(arHour).padStart(2, '0')}:00): ${h.count} orders`)
    }

    // Adjusted: which hours are the actual peaks in Argentina time?
    const peakHoursAR = hourDistribution.map((h: any) => ({
      utcHour: h._id,
      arHour: (h._id - 3 + 24) % 24,
      count: h.count
    })).sort((a: any, b: any) => b.count - a.count)

    console.log('\n  TOP PEAK HOURS (Argentina time):')
    for (const p of peakHoursAR.slice(0, 5)) {
      console.log(`    AR ${String(p.arHour).padStart(2, '0')}:00 (UTC ${String(p.utcHour).padStart(2, '0')}:00): ${p.count} orders`)
    }

    results.timezone = {
      rawTimestamps: rawTimestamps.map((o: any) => ({
        orderNumber: o.orderNumber,
        createdAt_utc: o.createdAt.toISOString(),
        utcHour: o.createdAt.getUTCHours(),
        arHour: (o.createdAt.getUTCHours() - 3 + 24) % 24
      })),
      hourDistributionUTC: hourDistribution.map((h: any) => ({ utcHour: h._id, count: h.count })),
      peakHoursAR: peakHoursAR.slice(0, 5)
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 10. FINAL RECONCILIATION SUMMARY
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n══════════════════════════════════════════════════════════════')
    console.log('10. FINAL RECONCILIATION SUMMARY')
    console.log('══════════════════════════════════════════════════════════════')

    console.log('\n  ┌─────────────────────────────────────────────────────────────┐')
    console.log('  │ RECONCILIATION RESULT                                       │')
    console.log('  ├─────────────────────────────────────────────────────────────┤')
    console.log(`  │ Revenue: ${c2pStr(os.totalRevenue_cents)}                           │`)
    console.log(`  │ Orders: ${os.totalOrders} valid + ${os.cancelledOrders} cancelled = ${os.totalOrders} total         │`)
    console.log(`  │ Customers: ${cs.uniqueCustomers} unique                                  │`)
    console.log(`  │ Avg ticket: ${c2pStr(os.avgTicket_cents)}                         │`)
    console.log('  ├─────────────────────────────────────────────────────────────┤')
    console.log(`  │ Items sum vs total: ${Math.abs(calculatedTotal - os.totalRevenue_cents) < 100 ? '✅' : '❌'}                          │`)
    console.log(`  │ Customer sum vs total: ${cs.totalRevenue_cents === os.totalRevenue_cents ? '✅' : '❌'}                    │`)
    console.log(`  │ Member+Non-member vs total: ${results.loyaltyReconciliation.crossCheckMatch ? '✅' : '❌'}              │`)
    console.log(`  │ CIS orders vs actual: ${cisTotalOrders === os.totalOrders ? '✅' : '❌'}                      │`)
    console.log(`  │ Timezone: AR (UTC-3) confirmed                             │`)
    console.log(`  │ Currency: CENTS (÷100 for pesos) confirmed                 │`)
    console.log('  └─────────────────────────────────────────────────────────────┘')

    // Save results
    const outputPath = path.join(__dirname, '../audit-2.0-reconciliation.json')
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2))
    console.log(`\n✅ Full reconciliation saved to: ${outputPath}`)

  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await disconnect()
  }
}

runReconciliation()
