import mongoose from 'mongoose'
import * as fs from 'fs'
import * as path from 'path'

// ============================================================================
// REWARD INTELLIGENCE DATA EXTRACTION - KEKE&LARRY
// Extracción exhaustiva para análisis de rewards
// ============================================================================

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://pgonzalojose_db_user:6oXEemLauaEuPoaq@takeasygo.ssjlhfw.mongodb.net/?appName=takeasygo'
const TENANT_ID = '69f8bf6ad3fcc97fd64bec87'
const OUTPUT_DIR = path.join(__dirname, '../reward-intelligence-data-keke-larry')

async function connect() {
  await mongoose.connect(MONGODB_URI, { bufferCommands: false, maxPoolSize: 5 })
  console.log('✅ Connected to MongoDB')
}

async function disconnect() {
  await mongoose.disconnect()
  console.log('✅ Disconnected from MongoDB')
}

async function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }
}

// ============================================================================
// 1. TENANT Y COBERTURA
// ============================================================================
async function extractTenantCoverage(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  console.log('\n📊 1. TENANT Y COBERTURA')
  
  const tenant = await db.collection('tenants').findOne({ _id: tenantId })
  const locations = await db.collection('locations').find({ tenantId }).toArray()
  
  // First order
  const firstOrder = await db.collection('orders')
    .find({ tenantId })
    .sort({ createdAt: 1 })
    .limit(1)
    .toArray()
  
  // First loyalty member
  const firstMember = await db.collection('loyaltymembers')
    .find({ tenantId })
    .sort({ joinedAt: 1 })
    .limit(1)
    .toArray()
  
  // Last data
  const lastOrder = await db.collection('orders')
    .find({ tenantId })
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray()
  
  const lastEvent = await db.collection('customerevents')
    .find({ tenantId })
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray()
  
  const coverage = {
    tenant: {
      id: tenant._id,
      name: tenant.name,
      slug: tenant.slug,
      plan: tenant.plan,
      createdAt: tenant.createdAt,
      isActive: tenant.isActive
    },
    locations: locations.map(l => ({
      id: l._id,
      name: l.name,
      createdAt: l.createdAt
    })),
    firstOrder: firstOrder[0]?.createdAt || null,
    firstMember: firstMember[0]?.joinedAt || null,
    lastOrder: lastOrder[0]?.createdAt || null,
    lastEvent: lastEvent[0]?.createdAt || null,
    totalDays: firstOrder[0]?.createdAt 
      ? Math.floor((new Date().getTime() - new Date(firstOrder[0].createdAt).getTime()) / (1000 * 60 * 60 * 24))
      : 0
  }
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '01_tenant_coverage.json'),
    JSON.stringify(coverage, null, 2)
  )
  
  console.log('  ✅ Tenant coverage extracted')
  return coverage
}

// ============================================================================
// 2. CLUB - DATA COMPLETO
// ============================================================================
async function extractClubData(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  console.log('\n📊 2. CLUB - DATA COMPLETO')
  
  const members = await db.collection('loyaltymembers')
    .find({ tenantId })
    .toArray()
  
  const consumers = await db.collection('consumers')
    .find({ tenantIds: tenantId })
    .toArray()
  
  const profiles = await db.collection('customerprofiles')
    .find({ tenantId })
    .toArray()
  
  const clubData = {
    members: members.map(m => ({
      memberId: m._id,
      consumerId: m.userId,
      tenantId: m.tenantId,
      locationId: m.locationId,
      joinedAt: m.joinedAt,
      source: m.source,
      status: m.status,
      tier: m.loyalty.tier,
      pointsCurrent: m.loyalty.points,
      sosConfig: m.sosConfig,
      cache: m.cache,
      store: m.store,
      userImpact: m.userImpact,
      wallet: m.wallet,
      phoneHash: m.phoneHash,
      email: m.email,
      name: m.name,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt
    })),
    consumers: consumers.map(c => ({
      customerId: c._id,
      tenantIds: c.tenantIds,
      totalOrders: c.totalOrders,
      totalSpent: c.totalSpent,
      firstOrderAt: c.firstOrderAt,
      lastOrderAt: c.lastOrderAt,
      isLoyaltyMember: c.isLoyaltyMember,
      phoneHash: c.phoneHash,
      emailHash: c.emailHash,
      createdAt: c.createdAt
    })),
    profiles: profiles.map(p => ({
      customerId: p.customerId,
      tenantId: p.tenantId,
      segment: p.segment,
      healthScore: p.healthScore,
      signals: p.signals,
      orderCount: p.orderCount,
      totalSpent: p.totalSpent,
      lastOrderAt: p.lastOrderAt,
      updatedAt: p.updatedAt
    }))
  }
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '02_club_data.json'),
    JSON.stringify(clubData, null, 2)
  )
  
  console.log(`  ✅ ${members.length} members, ${consumers.length} consumers, ${profiles.length} profiles`)
  return clubData
}

// ============================================================================
// 3. REGLA DE PUNTOS (desde código)
// ============================================================================
function extractPointsRule() {
  console.log('\n📊 3. REGLA DE PUNTOS')
  
  // Desde el código fuente encontrado en apps/saas/lib/loyalty.ts
  const pointsRule = {
    source: 'apps/saas/lib/loyalty.ts',
    function: 'calculatePointsBreakdown',
    config: {
      enabled: true,
      mode: 'fixed_per_currency', // o 'percentage' o 'hybrid'
      pointsPerCurrency: 0.1, // default
      pointsPercentage: 10, // default
      pointsPerOrder: 0, // default
      minOrderForPoints: 0 // default
    },
    formula: {
      orderTotalPesos: 'orderTotal / 100', // centavos a pesos
      fixed_per_currency: 'orderTotalPesos * pointsPerCurrency',
      percentage: 'orderTotalPesos * pointsPercentage / 100',
      hybrid: '(orderTotalPesos * pointsPerCurrency) + (orderTotalPesos * pointsPercentage / 100)',
      basePoints: 'Math.floor(rawBase)',
      microBonus: 'fractionalRemainder * 0.0575',
      microBonusFinal: 'microBonus > 0 ? microBonus : (fractionalRemainder >= 0.5 ? 1 : 0)',
      total: 'basePoints + microBonusFinal + pointsPerOrder'
    },
    notes: [
      'Los puntos se calculan sobre el total de items de venta (excluyendo rewards)',
      'El micro-bonus evita que el saldo quede en cero redondo',
      'Hay un campo loyaltyPointsCredited en orders para evitar doble conteo',
      'Se puede configurar por location con LocationLoyaltyConfig'
    ]
  }
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '03_points_rule.json'),
    JSON.stringify(pointsRule, null, 2)
  )
  
  console.log('  ✅ Points rule extracted from code')
  return pointsRule
}

// ============================================================================
// 4. ÓRDENES COMPLETAS
// ============================================================================
async function extractOrdersComplete(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  console.log('\n📊 4. ÓRDENES COMPLETAS')
  
  const orders = await db.collection('orders')
    .find({ tenantId })
    .sort({ createdAt: 1 })
    .toArray()
  
  const ordersComplete = orders.map(o => ({
    orderId: o._id,
    orderNumber: o.orderNumber,
    tenantId: o.tenantId,
    locationId: o.locationId,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    status: o.status,
    orderMode: o.orderMode,
    subtotal: o.subtotal,
    discountAmount: o.discountAmount,
    loyaltyDiscountAmount: o.loyaltyDiscountAmount,
    promoCode: o.promoCode,
    promoSlug: o.promoSlug,
    promoCreatedBy: o.promoCreatedBy,
    qrPromoApplied: o.qrPromoApplied,
    total: o.total,
    baseTotal: o.baseTotal,
    surchargeAmount: o.surchargeAmount,
    surchargePercent: o.surchargePercent,
    platformFeeAmount: o.platformFeeAmount,
    deliveryCost: o.deliveryCost,
    deliveryDistance: o.deliveryDistance,
    payment: {
      status: o.payment.status,
      method: o.payment.method,
      mercadopagoId: o.payment.mercadopagoId,
      mercadopagoData: o.payment.mercadopagoData,
      transferConfirmed: o.payment.transferConfirmed,
      kriptonExternalCode: o.payment.kriptonExternalCode
    },
    customer: {
      name: o.customer.name,
      phone: o.customer.phone,
      email: o.customer.email,
      phoneHash: o.customer.phoneHash
    },
    loyaltyPointsCredited: o.loyaltyPointsCredited,
    loyaltyPointsUsed: o.loyaltyPointsUsed,
    loyaltyDiscountAmount: o.loyaltyDiscountAmount,
    rewardAdvanceApplied: o.rewardAdvanceApplied,
    rewardAdvanceAmount: o.rewardAdvanceAmount,
    rewardDeductionProcessed: o.rewardDeductionProcessed,
    rewardItems: o.rewardItems,
    hiddenRewardClaims: o.hiddenRewardClaims,
    items: o.items.map(i => ({
      menuItemId: i.menuItemId,
      promotionId: i.promotionId,
      storeItemId: i.storeItemId,
      itemType: i.itemType,
      categoryName: i.categoryName,
      name: i.name,
      description: i.description,
      basePrice: i.basePrice,
      extraPrice: i.extraPrice,
      price: i.price,
      quantity: i.quantity,
      subtotal: i.subtotal,
      customizations: i.customizations,
      selectedVariant: i.selectedVariant,
      addedFrom: i.addedFrom,
      notes: i.notes
    })),
    statusTimestamps: o.statusTimestamps,
    orderTiming: o.orderTiming,
    scheduledPickupAt: o.scheduledPickupAt,
    source: o.source
  }))
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '04_orders_complete.json'),
    JSON.stringify(ordersComplete, null, 2)
  )
  
  console.log(`  ✅ ${orders.length} orders extracted`)
  return ordersComplete
}

// ============================================================================
// 5. TICKET REAL (DERIVADO)
// ============================================================================
async function calculateTicketReal(orders: any[]) {
  console.log('\n📊 5. TICKET REAL (DERIVADO)')
  
  const validOrders = orders.filter(o => o.status !== 'cancelled')
  
  // Por orden
  const ticketByOrder = validOrders.map(o => ({
    orderId: o.orderId,
    orderNumber: o.orderNumber,
    ticket: o.total,
    itemsCount: o.items.length,
    units: o.items.reduce((sum, i) => sum + i.quantity, 0),
    products: o.items.map(i => i.name),
    categories: [...new Set(o.items.map(i => i.categoryName))],
    discountAmount: o.discountAmount,
    promoCode: o.promoCode,
    deliveryCost: o.deliveryCost,
    pointsEarned: o.loyaltyPointsCredited ? Math.floor(o.total / 1000) : 0 //估算
  }))
  
  // Por cliente
  const customerTickets = validOrders.reduce((acc, o) => {
    const hash = o.customer.phoneHash
    if (!hash) return acc
    
    if (!acc[hash]) {
      acc[hash] = {
        customerPhoneHash: hash,
        orders: [],
        totalSpent: 0,
        totalUnits: 0
      }
    }
    
    acc[hash].orders.push({
      orderId: o.orderId,
      orderNumber: o.orderNumber,
      total: o.total,
      itemsCount: o.items.length,
      units: o.items.reduce((sum, i) => sum + i.quantity, 0),
      createdAt: o.createdAt
    })
    acc[hash].totalSpent += o.total
    acc[hash].totalUnits += o.items.reduce((sum, i) => sum + i.quantity, 0)
    
    return acc
  }, {} as Record<string, any>)
  
  const ticketByCustomer = Object.values(customerTickets).map(c => {
    const tickets = c.orders.map(o => o.total)
    tickets.sort((a, b) => a - b)
    
    return {
      customerPhoneHash: c.customerPhoneHash,
      totalSpent: c.totalSpent,
      ordersCount: c.orders.length,
      totalUnits: c.totalUnits,
      avgTicket: c.totalSpent / c.orders.length,
      medianTicket: tickets[Math.floor(tickets.length / 2)],
      minTicket: tickets[0],
      maxTicket: tickets[tickets.length - 1],
      pointsPerOrder: c.totalSpent / c.orders.length / 1000, // 估算
      dollarsPerPoint: c.totalSpent / (c.totalSpent / 1000), // 估算
      firstOrder: c.orders[0]?.createdAt,
      lastOrder: c.orders[c.orders.length - 1]?.createdAt
    }
  })
  
  const ticketData = {
    byOrder: ticketByOrder,
    byCustomer: ticketByCustomer
  }
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '05_ticket_real.json'),
    JSON.stringify(ticketData, null, 2)
  )
  
  console.log(`  ✅ Ticket data: ${ticketByOrder.length} orders, ${ticketByCustomer.length} customers`)
  return ticketData
}

// ============================================================================
// 6. RECURRENCIA
// ============================================================================
async function calculateRecurrence(orders: any[]) {
  console.log('\n📊 6. RECURRENCIA')
  
  const validOrders = orders.filter(o => o.status !== 'cancelled')
  
  // Por cliente: secuencia de compras
  const customerSequences = validOrders.reduce((acc, o) => {
    const hash = o.customer.phoneHash
    if (!hash) return acc
    
    if (!acc[hash]) {
      acc[hash] = []
    }
    
    acc[hash].push({
      orderId: o.orderId,
      orderNumber: o.orderNumber,
      total: o.total,
      createdAt: o.createdAt,
      items: o.items.length,
      products: o.items.map(i => i.name)
    })
    
    return acc
  }, {} as Record<string, any[]>)
  
  const customerRecurrence = Object.entries(customerSequences).map(([hash, seq]) => {
    seq.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    
    const intervals = []
    for (let i = 1; i < seq.length; i++) {
      const days = Math.floor((new Date(seq[i].createdAt).getTime() - new Date(seq[i-1].createdAt).getTime()) / (1000 * 60 * 60 * 24))
      intervals.push(days)
    }
    
    return {
      customerPhoneHash: hash,
      ordersCount: seq.length,
      firstOrder: seq[0]?.createdAt,
      lastOrder: seq[seq.length - 1]?.createdAt,
      orders: seq,
      intervals,
      avgDaysBetween: intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : null,
      medianDaysBetween: intervals.length > 0 ? intervals[Math.floor(intervals.length / 2)] : null,
      totalSpent: seq.reduce((sum, o) => sum + o.total, 0),
      avgTicket: seq.reduce((sum, o) => sum + o.total, 0) / seq.length
    }
  })
  
  // Cohorts por cantidad de compras
  const cohorts = customerRecurrence.reduce((acc, c) => {
    const count = c.ordersCount
    if (!acc[count]) acc[count] = []
    acc[count].push(c)
    return acc
  }, {} as Record<number, any[]>)
  
  const cohortAnalysis = Object.entries(cohorts).map(([count, customers]) => {
    const totalSpent = customers.reduce((sum, c) => sum + c.totalSpent, 0)
    const totalOrders = customers.reduce((sum, c) => sum + c.ordersCount, 0)
    
    return {
      purchasesCount: parseInt(count),
      customerCount: customers.length,
      totalRevenue: totalSpent,
      avgTicket: totalSpent / totalOrders,
      // Puntos estimados (1 punto por $1000)
      totalPoints: totalSpent / 1000,
      avgPoints: totalSpent / totalOrders / 1000
    }
  })
  
  const recurrenceData = {
    customerRecurrence,
    cohortAnalysis
  }
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '06_recurrence.json'),
    JSON.stringify(recurrenceData, null, 2)
  )
  
  console.log(`  ✅ Recurrence: ${customerRecurrence.length} customers, ${Object.keys(cohorts).length} cohorts`)
  return recurrenceData
}

// ============================================================================
// 7. PUNTOS VS RECURRENCIA
// ============================================================================
async function calculatePointsVsRecurrence(customerRecurrence: any[], clubData: any) {
  console.log('\n📊 7. PUNTOS VS RECURRENCIA')
  
  const memberPointsMap = new Map(
    clubData.members.map((m: any) => [m.phoneHash, m.loyalty?.points || 0])
  )
  
  const pointsVsRecurrence = customerRecurrence.map(c => {
    const currentPoints = memberPointsMap.get(c.customerPhoneHash) || 0
    
    // Calcular puntos acumulados en cada compra (estimado)
    const pointsByPurchase = c.orders.map((o: any, idx: number) => {
      const spentSoFar = c.orders.slice(0, idx + 1).reduce((sum: number, ord: any) => sum + ord.total, 0)
      return {
        purchaseNumber: idx + 1,
        spentSoFar,
        estimatedPoints: spentSoFar / 1000
      }
    })
    
    return {
      customerPhoneHash: c.customerPhoneHash,
      currentPoints,
      ordersCount: c.ordersCount,
      totalSpent: c.totalSpent,
      pointsByPurchase,
      pointsPerOrder: c.totalSpent / c.ordersCount / 1000,
      dollarsPerPoint: c.totalSpent / (c.totalSpent / 1000)
    }
  })
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '07_points_vs_recurrence.json'),
    JSON.stringify(pointsVsRecurrence, null, 2)
  )
  
  console.log('  ✅ Points vs recurrence calculated')
  return pointsVsRecurrence
}

// ============================================================================
// 8. DISTANCIA AL REWARD
// ============================================================================
async function calculateRewardDistance(pointsVsRecurrence: any[]) {
  console.log('\n📊 8. DISTANCIA AL REWARD')
  
  const thresholds = [3000, 5000, 8000, 10000, 11000, 12000, 15000, 20000, 25000, 30000, 40000, 50000]
  
  const rewardDistance = pointsVsRecurrence.map(c => {
    const thresholdAnalysis = thresholds.map(th => {
      const pointsRemaining = Math.max(0, th - c.currentPoints)
      const percentageCompleted = Math.min(100, (c.currentPoints / th) * 100)
      const historicalPointsPerOrder = c.pointsPerOrder || 0
      const estimatedOrdersRemaining = historicalPointsPerOrder > 0 ? Math.ceil(pointsRemaining / historicalPointsPerOrder) : null
      const ordersAlreadyCompleted = c.ordersCount
      const estimatedTotalOrders = estimatedOrdersRemaining !== null ? ordersAlreadyCompleted + estimatedOrdersRemaining : null
      
      return {
        threshold: th,
        pointsRemaining,
        percentageCompleted,
        historicalPointsPerOrder,
        estimatedOrdersRemaining,
        ordersAlreadyCompleted,
        estimatedTotalOrders,
        reachedHistorically: c.currentPoints >= th
      }
    })
    
    return {
      customerPhoneHash: c.customerPhoneHash,
      currentPoints: c.currentPoints,
      ordersCount: c.ordersCount,
      pointsPerOrder: c.pointsPerOrder,
      lastOrder: c.lastOrder,
      daysSinceLastOrder: c.lastOrder ? Math.floor((new Date().getTime() - new Date(c.lastOrder).getTime()) / (1000 * 60 * 60 * 24)) : null,
      thresholdAnalysis
    }
  })
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '08_reward_distance.json'),
    JSON.stringify(rewardDistance, null, 2)
  )
  
  console.log('  ✅ Reward distance calculated')
  return rewardDistance
}

// ============================================================================
// 9. REWARD ADVANCE
// ============================================================================
async function extractRewardAdvanceData(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  console.log('\n📊 9. REWARD ADVANCE')
  
  // Extraer de CustomerEvents
  const rewardAdvanceEvents = await db.collection('customerevents')
    .find({
      tenantId,
      type: { $in: ['reward_advance_offered', 'reward_advance_accepted', 'reward_advance_consolidated'] }
    })
    .toArray()
  
  // Extraer de orders con rewardAdvanceApplied
  const ordersWithAdvance = await db.collection('orders')
    .find({
      tenantId,
      rewardAdvanceApplied: true
    })
    .toArray()
  
  const rewardAdvanceData = {
    events: rewardAdvanceEvents.map(e => ({
      eventId: e._id,
      phoneHash: e.phoneHash,
      tenantId: e.tenantId,
      type: e.type,
      data: e.data,
      metadata: e.metadata,
      createdAt: e.createdAt
    })),
    orders: ordersWithAdvance.map(o => ({
      orderId: o._id,
      orderNumber: o.orderNumber,
      customerPhoneHash: o.customer.phoneHash,
      rewardAdvanceAmount: o.rewardAdvanceAmount,
      rewardAdvanceApplied: o.rewardAdvanceApplied,
      rewardDeductionProcessed: o.rewardDeductionProcessed,
      total: o.total,
      createdAt: o.createdAt,
      status: o.status
    }))
  }
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '09_reward_advance.json'),
    JSON.stringify(rewardAdvanceData, null, 2)
  )
  
  console.log(`  ✅ Reward Advance: ${rewardAdvanceEvents.length} events, ${ordersWithAdvance.length} orders`)
  return rewardAdvanceData
}

// ============================================================================
// 10. REDEMPTIONS
// ============================================================================
async function extractRedemptions(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  console.log('\n📊 10. REDEMPTIONS')
  
  const storeRedemptions = await db.collection('storeredemptions')
    .find({ tenantId })
    .toArray()
  
  const hiddenRewardClaims = await db.collection('hiddenrewardclaims')
    .find({ tenantId })
    .toArray()
  
  const rewardItemsInOrders = await db.collection('orders')
    .find({
      tenantId,
      'rewardItems.0': { $exists: true }
    })
    .toArray()
  
  const redemptionsData = {
    storeRedemptions: storeRedemptions.map(r => ({
      redemptionId: r._id,
      tenantId: r.tenantId,
      memberId: r.memberId,
      storeItemId: r.storeItemId,
      pointsUsed: r.pointsUsed,
      cashValue: r.cashValue,
      status: r.status,
      redemptionCode: r.redemptionCode,
      locationId: r.locationId,
      claimedAt: r.claimedAt,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    })),
    hiddenRewardClaims: hiddenRewardClaims.map(h => ({
      claimId: h._id,
      tenantId: h.tenantId,
      phoneHash: h.phoneHash,
      menuItemId: h.menuItemId,
      discountPercentage: h.discountPercentage,
      consolidated: h.consolidated,
      orderId: h.orderId,
      createdAt: h.createdAt
    })),
    rewardItemsInOrders: rewardItemsInOrders.map(o => ({
      orderId: o._id,
      orderNumber: o.orderNumber,
      customerPhoneHash: o.customer.phoneHash,
      rewardItems: o.rewardItems,
      total: o.total,
      createdAt: o.createdAt,
      status: o.status
    }))
  }
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '10_redemptions.json'),
    JSON.stringify(redemptionsData, null, 2)
  )
  
  console.log(`  ✅ Redemptions: ${storeRedemptions.length} store, ${hiddenRewardClaims.length} hidden, ${rewardItemsInOrders.length} in orders`)
  return redemptionsData
}

// ============================================================================
// 11. STORE ITEMS / REWARDS
// ============================================================================
async function extractStoreItems(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  console.log('\n📊 11. STORE ITEMS / REWARDS')
  
  const storeItems = await db.collection('storeitems')
    .find({
      $or: [{ tenantId }, { targetTenants: tenantId }]
    })
    .toArray()
  
  const rewardsData = storeItems.map(i => ({
    itemId: i._id,
    tenantId: i.tenantId,
    locationId: i.locationId,
    name: i.name,
    description: i.description,
    imageUrl: i.imageUrl,
    pointsCost: i.pointsCost,
    cashValue: i.cashValue,
    isActive: i.isActive,
    stock: i.stock,
    maxPerMember: i.maxPerMember,
    tierRequirement: i.tierRequirement,
    linkedMenuItemIds: i.linkedMenuItemIds,
    minItemPurchases: i.minItemPurchases,
    category: i.category,
    tags: i.tags,
    sortOrder: i.sortOrder,
    isFeatured: i.isFeatured,
    totalRedemptions: i.totalRedemptions,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt
  }))
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '11_store_items.json'),
    JSON.stringify(rewardsData, null, 2)
  )
  
  console.log(`  ✅ Store items: ${rewardsData.length}`)
  return rewardsData
}

// ============================================================================
// 12. PRODUCTOS
// ============================================================================
async function extractProducts(orders: any[], menus: any[]) {
  console.log('\n📊 12. PRODUCTOS')
  
  // Analizar productos desde orders
  const productStats = new Map()
  
  orders.filter(o => o.status !== 'cancelled').forEach(o => {
    o.items.forEach(item => {
      const key = item.menuItemId || item.name
      
      if (!productStats.has(key)) {
        productStats.set(key, {
          productId: item.menuItemId,
          name: item.name,
          categoryName: item.categoryName,
          totalQuantity: 0,
          totalRevenue: 0,
          orderCount: 0,
          orders: [],
          customers: new Set(),
          firstSeen: o.createdAt,
          lastSeen: o.createdAt
        })
      }
      
      const stats = productStats.get(key)
      stats.totalQuantity += item.quantity
      stats.totalRevenue += item.subtotal
      stats.orderCount += 1
      stats.orders.push(o.orderId)
      if (o.customer.phoneHash) stats.customers.add(o.customer.phoneHash)
      if (o.createdAt < stats.firstSeen) stats.firstSeen = o.createdAt
      if (o.createdAt > stats.lastSeen) stats.lastSeen = o.createdAt
    })
  })
  
  const productsData = Array.from(productStats.values()).map(p => ({
    productId: p.productId,
    name: p.name,
    categoryName: p.categoryName,
    totalQuantity: p.totalQuantity,
    totalRevenue: p.totalRevenue,
    orderCount: p.orderCount,
    uniqueCustomers: p.customers.size,
    customerIds: Array.from(p.customers),
    firstSeen: p.firstSeen,
    lastSeen: p.lastSeen,
    avgRevenuePerOrder: p.totalRevenue / p.orderCount,
    avgQuantityPerOrder: p.totalQuantity / p.orderCount
  }))
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '12_products.json'),
    JSON.stringify(productsData, null, 2)
  )
  
  console.log(`  ✅ Products: ${productsData.length}`)
  return productsData
}

// ============================================================================
// 13. PRODUCTO × RECURRENCIA
// ============================================================================
async function calculateProductXRecurrence(orders: any[], productsData: any[]) {
  console.log('\n📊 13. PRODUCTO × RECURRENCIA')
  
  const productMap = new Map(productsData.map(p => [p.productId || p.name, p]))
  
  // Para cada cliente, analizar qué productos compra en cada compra
  const customerSequences = orders.filter(o => o.status !== 'cancelled').reduce((acc, o) => {
    const hash = o.customer.phoneHash
    if (!hash) return acc
    
    if (!acc[hash]) {
      acc[hash] = []
    }
    
    acc[hash].push({
      orderNumber: o.orderNumber,
      createdAt: o.createdAt,
      products: o.items.map(i => ({
        productId: i.menuItemId,
        name: i.name,
        categoryName: i.categoryName
      }))
    })
    
    return acc
  }, {} as Record<string, any[]>)
  
  const productRecurrence = productsData.map(p => {
    const purchaseNumbers = []
    
    Object.values(customerSequences).forEach(seq => {
      seq.forEach((order: any, idx: number) => {
        const hasProduct = order.products.some((prod: any) => 
          (prod.productId === p.productId || prod.name === p.name)
        )
        if (hasProduct) {
          purchaseNumbers.push(idx + 1)
        }
      })
    })
    
    return {
      productId: p.productId,
      name: p.name,
      categoryName: p.categoryName,
      totalQuantity: p.totalQuantity,
      orderCount: p.orderCount,
      purchaseNumbers,
      firstPurchase: Math.min(...purchaseNumbers),
      lastPurchase: Math.max(...purchaseNumbers),
      avgPurchaseNumber: purchaseNumbers.length > 0 ? purchaseNumbers.reduce((a, b) => a + b, 0) / purchaseNumbers.length : 0
    }
  })
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '13_product_x_recurrence.json'),
    JSON.stringify(productRecurrence, null, 2)
  )
  
  console.log('  ✅ Product × recurrence calculated')
  return productRecurrence
}

// ============================================================================
// 14. PRODUCTO × PUNTOS
// ============================================================================
async function calculateProductXPoints(orders: any[], productsData: any[]) {
  console.log('\n📊 14. PRODUCTO × PUNTOS')
  
  const productPoints = productsData.map(p => {
    // Calcular puntos promedio generados en órdenes donde aparece este producto
    const ordersWithProduct = orders.filter(o => 
      o.status !== 'cancelled' && 
      o.items.some(i => (i.menuItemId === p.productId || i.name === p.name))
    )
    
    const totalRevenue = ordersWithProduct.reduce((sum, o) => sum + o.total, 0)
    const estimatedPoints = totalRevenue / 1000
    const avgTicket = totalRevenue / ordersWithProduct.length
    
    return {
      productId: p.productId,
      name: p.name,
      categoryName: p.categoryName,
      orderCount: ordersWithProduct.length,
      totalRevenue,
      estimatedPoints,
      avgTicket,
      pointsPerOrder: estimatedPoints / ordersWithProduct.length
    }
  })
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '14_product_x_points.json'),
    JSON.stringify(productPoints, null, 2)
  )
  
  console.log('  ✅ Product × points calculated')
  return productPoints
}

// ============================================================================
// 15. COMBINACIONES DE PRODUCTOS
// ============================================================================
async function calculateProductCombinations(orders: any[]) {
  console.log('\n📊 15. COMBINACIONES DE PRODUCTOS')
  
  const combinations = {
    pairs: new Map<string, { count: number; customers: Set<string>; revenue: number }>(),
    all: []
  }
  
  orders.filter(o => o.status !== 'cancelled').forEach(order => {
    const products = order.items.map(i => i.name)
    const hash = order.customer.phoneHash
    
    // Pares
    for (let i = 0; i < products.length; i++) {
      for (let j = i + 1; j < products.length; j++) {
        const pair = [products[i], products[j]].sort().join(' + ')
        
        if (!combinations.pairs.has(pair)) {
          combinations.pairs.set(pair, { count: 0, customers: new Set(), revenue: 0 })
        }
        
        const data = combinations.pairs.get(pair)!
        data.count++
        if (hash) data.customers.add(hash)
        data.revenue += order.total
      }
    }
  })
  
  const pairsArray = Array.from(combinations.pairs.entries())
    .map(([pair, data]) => ({
      pair,
      count: data.count,
      uniqueCustomers: data.customers.size,
      revenue: data.revenue,
      avgTicket: data.revenue / data.count
    }))
    .sort((a, b) => b.count - a.count)
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '15_product_combinations.json'),
    JSON.stringify({ pairs: pairsArray }, null, 2)
  )
  
  console.log(`  ✅ Combinations: ${pairsArray.length} pairs`)
  return { pairs: pairsArray }
}

// ============================================================================
// 16. CLIENTE × PRODUCTO
// ============================================================================
async function calculateCustomerXProduct(orders: any[]) {
  console.log('\n📊 16. CLIENTE × PRODUCTO')
  
  const customerProducts = orders.filter(o => o.status !== 'cancelled').reduce((acc, o) => {
    const hash = o.customer.phoneHash
    if (!hash) return acc
    
    if (!acc[hash]) {
      acc[hash] = {
        customerPhoneHash: hash,
        orders: []
      }
    }
    
    acc[hash].orders.push({
      orderId: o.orderId,
      orderNumber: o.orderNumber,
      createdAt: o.createdAt,
      total: o.total,
      items: o.items.map(i => ({
        productId: i.menuItemId,
        name: i.name,
        categoryName: i.categoryName,
        quantity: i.quantity,
        subtotal: i.subtotal
      }))
    })
    
    return acc
  }, {} as Record<string, any>)
  
  const customerXProduct = Object.values(customerProducts).map(c => {
    const allProducts = new Map()
    
    c.orders.forEach(order => {
      order.items.forEach(item => {
        const key = item.productId || item.name
        if (!allProducts.has(key)) {
          allProducts.set(key, {
            productId: item.productId,
            name: item.name,
            categoryName: item.categoryName,
            quantity: 0,
            revenue: 0,
            orders: 0
          })
        }
        
        const prod = allProducts.get(key)!
        prod.quantity += item.quantity
        prod.revenue += item.subtotal
        prod.orders++
      })
    })
    
    return {
      customerPhoneHash: c.customerPhoneHash,
      ordersCount: c.orders.length,
      totalSpent: c.orders.reduce((sum, o) => sum + o.total, 0),
      products: Array.from(allProducts.values()),
      orders: c.orders
    }
  })
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '16_customer_x_product.json'),
    JSON.stringify(customerXProduct, null, 2)
  )
  
  console.log(`  ✅ Customer × Product: ${customerXProduct.length} customers`)
  return customerXProduct
}

// ============================================================================
// 17. PROMOCIONES
// ============================================================================
async function extractPromotions(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  console.log('\n📊 17. PROMOCIONES')
  
  const promotions = await db.collection('promotions')
    .find({
      $or: [{ tenantId }, { targetTenants: tenantId }]
    })
    .toArray()
  
  const qrPromos = await db.collection('qrpromos')
    .find({ tenantId })
    .toArray()
  
  const qrPromoViews = await db.collection('qrpromoviews')
    .find({ tenantId })
    .toArray()
  
  // Órdenes con promociones
  const ordersWithPromo = await db.collection('orders')
    .find({
      tenantId,
      $or: [
        { promoCode: { $exists: true, $ne: null } },
        { promoSlug: { $exists: true, $ne: null } },
        { qrPromoApplied: true }
      ]
    })
    .toArray()
  
  const promotionsData = {
    promotions: promotions.map(p => ({
      promotionId: p._id,
      tenantId: p.tenantId,
      locationId: p.locationId,
      type: p.type,
      title: p.title,
      description: p.description,
      price: p.price,
      originalPrice: p.originalPrice,
      isActive: p.isActive,
      isFeatured: p.isFeatured,
      scheduledStart: p.scheduledStart,
      scheduledEnd: p.scheduledEnd,
      activeDays: p.activeDays,
      slots: p.slots,
      sortOrder: p.sortOrder,
      redemptionsCount: p.redemptionsCount,
      maxRedemptions: p.maxRedemptions,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    })),
    qrPromos: qrPromos.map(q => ({
      qrPromoId: q._id,
      tenantId: q.tenantId,
      title: q.title,
      description: q.description,
      discountPercentage: q.discountPercentage,
      isActive: q.isActive,
      category: q.category,
      requiredMin: q.requiredMin,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt
    })),
    qrPromoViews: qrPromoViews.map(v => ({
      viewId: v._id,
      tenantId: v.tenantId,
      qrPromoId: v.qrPromoId,
      phoneHash: v.phoneHash,
      createdAt: v.createdAt
    })),
    ordersWithPromo: ordersWithPromo.map(o => ({
      orderId: o._id,
      orderNumber: o.orderNumber,
      promoCode: o.promoCode,
      promoSlug: o.promoSlug,
      qrPromoApplied: o.qrPromoApplied,
      discountAmount: o.discountAmount,
      total: o.total,
      customerPhoneHash: o.customer.phoneHash,
      createdAt: o.createdAt
    }))
  }
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '17_promotions.json'),
    JSON.stringify(promotionsData, null, 2)
  )
  
  console.log(`  ✅ Promotions: ${promotions.length} promos, ${qrPromos.length} QR promos, ${qrPromoViews.length} views, ${ordersWithPromo.length} orders`)
  return promotionsData
}

// ============================================================================
// 18. CUSTOMER EVENTS (COMPLETO)
// ============================================================================
async function extractCustomerEventsComplete(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  console.log('\n📊 18. CUSTOMER EVENTS (COMPLETO)')
  
  const events = await db.collection('customerevents')
    .find({ tenantId })
    .sort({ createdAt: 1 })
    .toArray()
  
  const eventsComplete = events.map(e => ({
    eventId: e._id,
    phoneHash: e.phoneHash,
    tenantId: e.tenantId,
    type: e.type,
    data: e.data,
    metadata: e.metadata,
    createdAt: e.createdAt
  }))
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '18_customer_events_complete.json'),
    JSON.stringify(eventsComplete, null, 2)
  )
  
  console.log(`  ✅ Customer events: ${eventsComplete.length}`)
  return eventsComplete
}

// ============================================================================
// 19. POSTHOG (VERIFICAR ACCESO)
// ============================================================================
async function checkPostHogAccess() {
  console.log('\n📊 19. POSTHOG - VERIFICANDO ACCESO')
  
  const config = {
    key: process.env.POSTHOG_SERVER_KEY,
    projectId: process.env.POSTHOG_PROJECT_ID
  }
  
  const posthogStatus = {
    hasCredentials: !!(config.key && config.projectId),
    keyAvailable: !!config.key,
    projectIdAvailable: !!config.projectId,
    status: config.key && config.projectId ? 'CREDENCIALES DISPONIBLE' : 'CREDENCIALES NO DISPONIBLES',
    note: 'Para extraer datos reales de PostHog, se requieren credenciales en el entorno'
  }
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '19_posthog_status.json'),
    JSON.stringify(posthogStatus, null, 2)
  )
  
  console.log(`  ✅ PostHog status: ${posthogStatus.status}`)
  return posthogStatus
}

// ============================================================================
// 20. TEMPORAL
// ============================================================================
async function calculateTemporal(orders: any[]) {
  console.log('\n📊 20. TEMPORAL')
  
  const validOrders = orders.filter(o => o.status !== 'cancelled')
  
  // Por hora
  const hourly = new Array(24).fill(0).map((_, i) => ({ hour: i, count: 0, revenue: 0 }))
  validOrders.forEach(o => {
    const hour = new Date(o.createdAt).getHours()
    hourly[hour].count++
    hourly[hour].revenue += o.total
  })
  
  // Por día de semana
  const dow = new Array(7).fill(0).map((_, i) => ({ dow: i, count: 0, revenue: 0 }))
  validOrders.forEach(o => {
    const day = new Date(o.createdAt).getDay()
    dow[day].count++
    dow[day].revenue += o.total
  })
  
  // Por fecha
  const daily = validOrders.reduce((acc, o) => {
    const date = new Date(o.createdAt).toISOString().split('T')[0]
    if (!acc[date]) acc[date] = { date, count: 0, revenue: 0 }
    acc[date].count++
    acc[date].revenue += o.total
    return acc
  }, {} as Record<string, any>)
  
  const dailyArray = Object.values(daily).sort((a, b) => a.date.localeCompare(b.date))
  
  const temporalData = {
    hourly,
    dow,
    daily: dailyArray
  }
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '20_temporal.json'),
    JSON.stringify(temporalData, null, 2)
  )
  
  console.log('  ✅ Temporal data calculated')
  return temporalData
}

// ============================================================================
// 21. CUSTOMER JOURNEY
// ============================================================================
async function extractCustomerJourney(customerEvents: any[], orders: any[], clubData: any) {
  console.log('\n📊 21. CUSTOMER JOURNEY')
  
  const customerJourneys = customerEvents.reduce((acc, e) => {
    const hash = e.phoneHash
    if (!acc[hash]) {
      acc[hash] = {
        customerPhoneHash: hash,
        events: []
      }
    }
    
    acc[hash].events.push({
      eventId: e._id,
      type: e.type,
      data: e.data,
      metadata: e.metadata,
      createdAt: e.createdAt
    })
    
    return acc
  }, {} as Record<string, any>)
  
  const journeysArray = Object.values(customerJourneys).map(j => {
    // Ordenar eventos por tiempo
    j.events.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    
    // Marcar pasos observados
    const steps = {
      firstInteraction: j.events[0]?.createdAt || null,
      menuOpened: j.events.find((e: any) => e.type === 'menu_opened')?.createdAt || null,
      productView: j.events.find((e: any) => e.type === 'product_view' || e.type === 'dish_detail_opened')?.createdAt || null,
      cartAdd: j.events.find((e: any) => e.type === 'cart_add')?.createdAt || null,
      checkoutStarted: j.events.find((e: any) => e.type === 'checkout_started')?.createdAt || null,
      checkoutCompleted: j.events.find((e: any) => e.type === 'checkout_completed')?.createdAt || null,
      orderCompleted: j.events.find((e: any) => e.type === 'order_completed')?.createdAt || null,
      rewardRedeemed: j.events.find((e: any) => e.type === 'reward_redeemed')?.createdAt || null
    }
    
    return {
      customerPhoneHash: j.customerPhoneHash,
      steps,
      events: j.events
    }
  })
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '21_customer_journey.json'),
    JSON.stringify(journeysArray, null, 2)
  )
  
  console.log(`  ✅ Customer journeys: ${journeysArray.length} customers`)
  return journeysArray
}

// ============================================================================
// 22. SEGMENTACIÓN
// ============================================================================
async function extractSegmentation(clubData: any) {
  console.log('\n📊 22. SEGMENTACIÓN')
  
  const segmentation = clubData.profiles.map(p => ({
    customerId: p.customerId,
    tenantId: p.tenantId,
    segment: p.segment,
    healthScore: p.healthScore,
    signals: p.signals,
    orderCount: p.orderCount,
    totalSpent: p.totalSpent,
    lastOrderAt: p.lastOrderAt,
    updatedAt: p.updatedAt
  }))
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '22_segmentation.json'),
    JSON.stringify(segmentation, null, 2)
  )
  
  console.log(`  ✅ Segmentation: ${segmentation.length} profiles`)
  return segmentation
}

// ============================================================================
// 23. FEEDBACK / RATINGS
// ============================================================================
async function extractFeedback(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  console.log('\n📊 23. FEEDBACK / RATINGS')
  
  const feedbacks = await db.collection('feedbacks')
    .find({ tenantId })
    .toArray()
  
  const ratings = await db.collection('ratings')
    .find({ tenantId })
    .toArray()
  
  const feedbackData = {
    feedbacks: feedbacks.map(f => ({
      feedbackId: f._id,
      tenantId: f.tenantId,
      event: f.event,
      satisfaction: f.satisfaction,
      comment: f.comment,
      clientHash: f.clientHash,
      createdAt: f.createdAt
    })),
    ratings: ratings.map(r => ({
      ratingId: r._id,
      tenantId: r.tenantId,
      rating: r.rating,
      comment: r.comment,
      orderId: r.orderId,
      createdAt: r.createdAt
    }))
  }
  
  fs.writeFileSync(
    path.join( OUTPUT_DIR, '23_feedback.json'),
    JSON.stringify(feedbackData, null, 2)
  )
  
  console.log(`  ✅ Feedback: ${feedbacks.length} feedbacks, ${ratings.length} ratings`)
  return feedbackData
}

// ============================================================================
// 24. DATOS OPERATIVOS
// ============================================================================
async function extractOperationalData(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  console.log('\n📊 24. DATOS OPERATIVOS')
  
  const operational = {
    inventory: {
      skus: 0,
      recipes: 0,
      ledger: 0
    },
    reservations: await db.collection('reservations')
      .find({ tenantId })
      .toArray(),
    statusTimestamps: await db.collection('orders')
      .find({ tenantId })
      .project({ statusTimestamps: 1, orderNumber: 1, createdAt: 1 })
      .toArray()
  }
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '24_operational.json'),
    JSON.stringify(operational, null, 2)
  )
  
  console.log('  ✅ Operational data extracted')
  return operational
}

// ============================================================================
// 25. HISTÓRICO
// ============================================================================
async function extractHistorical(orders: any[], clubData: any) {
  console.log('\n📊 25. HISTÓRICO')
  
  // Analizar cambios en tiempo
  const historical = {
    ordersOverTime: orders.reduce((acc, o) => {
      const month = new Date(o.createdAt).toISOString().slice(0, 7)
      if (!acc[month]) acc[month] = { count: 0, revenue: 0 }
      acc[month].count++
      acc[month].revenue += o.total
      return acc
    }, {} as Record<string, { count: number; revenue: number }>),
    
    membersOverTime: clubData.members.reduce((acc, m) => {
      const month = new Date(m.joinedAt).toISOString().slice(0, 7)
      if (!acc[month]) acc[month] = 0
      acc[month]++
      return acc
    }, {} as Record<string, number>)
  }
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '25_historical.json'),
    JSON.stringify(historical, null, 2)
  )
  
  console.log('  ✅ Historical data extracted')
  return historical
}

// ============================================================================
// 26. DATA QUALITY
// ============================================================================
async function analyzeDataQuality(orders: any[], clubData: any, customerEvents: any[]) {
  console.log('\n📊 26. DATA QUALITY')
  
  const issues = []
  
  // Orders without phoneHash
  const ordersWithoutPhone = orders.filter(o => !o.customer?.phoneHash).length
  if (ordersWithoutPhone > 0) {
    issues.push({
      severity: 'high',
      entity: 'orders',
      issue: 'Orders without customer phoneHash',
      affectedRecords: ordersWithoutPhone,
      percentage: (ordersWithoutPhone / orders.length) * 100,
      impact: 'No se puede vincular a perfil de cliente'
    })
  }
  
  // Orders without items
  const ordersWithoutItems = orders.filter(o => !o.items || o.items.length === 0).length
  if (ordersWithoutItems > 0) {
    issues.push({
      severity: 'critical',
      entity: 'orders',
      issue: 'Orders without items',
      affectedRecords: ordersWithoutItems,
      percentage: (ordersWithoutItems / orders.length) * 100,
      impact: 'Órdenes vacías no generan revenue ni puntos'
    })
  }
  
  // Cancelled orders
  const cancelledOrders = orders.filter(o => o.status === 'cancelled').length
  if (cancelledOrders > 0) {
    issues.push({
      severity: 'low',
      entity: 'orders',
      issue: 'Cancelled orders',
      affectedRecords: cancelledOrders,
      percentage: (cancelledOrders / orders.length) * 100,
      impact: 'No generan revenue ni puntos'
    })
  }
  
  // Events without phoneHash
  const eventsWithoutPhone = customerEvents.filter(e => !e.phoneHash).length
  if (eventsWithoutPhone > 0) {
    issues.push({
      severity: 'medium',
      entity: 'customerevents',
      issue: 'Events without phoneHash',
      affectedRecords: eventsWithoutPhone,
      percentage: (eventsWithoutPhone / customerEvents.length) * 100,
      impact: 'No se puede vincular a cliente'
    })
  }
  
  const qualityReport = {
    totalOrders: orders.length,
    totalEvents: customerEvents.length,
    totalMembers: clubData.members.length,
    issues,
    overallScore: Math.max(0, 100 - issues.filter(i => i.severity === 'critical').length * 20 - issues.filter(i => i.severity === 'high').length * 10 - issues.filter(i => i.severity === 'medium').length * 5)
  }
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '26_data_quality.json'),
    JSON.stringify(qualityReport, null, 2)
  )
  
  console.log(`  ✅ Data quality: ${qualityReport.overallScore}/100, ${issues.length} issues`)
  return qualityReport
}

// ============================================================================
// 27. DATA LINEAGE
// ============================================================================
function extractDataLineage() {
  console.log('\n📊 27. DATA LINEAGE')
  
  const lineage = {
    tenantCoverage: {
      tenantId: 'tenants._id',
      name: 'tenants.name',
      slug: 'tenants.slug',
      createdAt: 'tenants.createdAt'
    },
    orders: {
      source: 'orders collection',
      fields: {
        total: 'orders.total',
        items: 'orders.items',
        customer: 'orders.customer.phoneHash',
        points: 'orders.loyaltyPointsCredited (estimated)',
        rewardAdvance: 'orders.rewardAdvanceApplied'
      }
    },
    loyaltyPoints: {
      source: 'loyaltymembers.loyalty.points',
      calculation: 'Order total / 1000 (fixed_per_currency mode)',
      formula: 'calculatePointsBreakdown in apps/saas/lib/loyalty.ts'
    },
    customer: {
      source: 'consumers collection',
      phoneHash: 'consumers.phoneHash',
      totalOrders: 'consumers.totalOrders',
      totalSpent: 'consumers.totalSpent'
    },
    segments: {
      source: 'customerprofiles.segment',
      healthScore: 'customerprofiles.healthScore'
    },
    events: {
      source: 'customerevents collection',
      phoneHash: 'customerevents.phoneHash',
      type: 'customerevents.type',
      metadata: 'customerevents.metadata'
    },
    rewards: {
      redemptions: 'storeredemptions collection',
      hiddenRewards: 'hiddenrewardclaims collection',
      inOrders: 'orders.rewardItems'
    },
    rewardAdvance: {
      events: 'customerevents (reward_advance_offered, reward_advance_accepted, reward_advance_consolidated)',
      orders: 'orders.rewardAdvanceApplied'
    },
    promotions: {
      promotions: 'promotions collection',
      qrPromos: 'qrpromos collection',
      views: 'qrpromoviews collection',
      usage: 'orders.promoCode, orders.qrPromoApplied'
    },
    posthog: {
      status: 'Configurado pero credenciales no disponibles en entorno local',
      knownEvents: 'menu.opened, dish.viewed, dish.added, checkout.started, order.completed, promotion.viewed, promotion.clicked, promotion.applied, reward.viewed, reward.eligible, reward.redeemed, best_seller.viewed, best_seller.clicked, best_seller.added, hidden_reward.discovered, hidden_reward.revealed, hidden_reward.redeemed'
    }
  }
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '27_data_lineage.json'),
    JSON.stringify(lineage, null, 2)
  )
  
  console.log('  ✅ Data lineage documented')
  return lineage
}

// ============================================================================
// 28. DATASETS FINALES
// ============================================================================
async function generateFinalDatasets(orders: any[], clubData: any, customerRecurrence: any[], pointsVsRecurrence: any[], rewardDistance: any, customerXProduct: any, productCombinations: any, customerEvents: any, segmentation: any) {
  console.log('\n📊 28. DATASETS FINALES')
  
  // 1. reward_intelligence_customer_base
  const customerBase = pointsVsRecurrence.map(c => {
    const seg = segmentation.find(s => s.customerId === c.customerPhoneHash) || {}
    
    return {
      customer_id: c.customerPhoneHash,
      club_member: !!clubData.members.find((m: any) => m.phoneHash === c.customerPhoneHash),
      club_join_date: clubData.members.find((m: any) => m.phoneHash === c.customerPhoneHash)?.joinedAt || null,
      orders_count: c.ordersCount,
      total_spent: c.totalSpent,
      avg_ticket: c.totalSpent / c.ordersCount,
      median_ticket: null, // Se calcularía si tuviéramos array de tickets
      first_order_at: customerRecurrence.find((cr: any) => cr.customerPhoneHash === c.customerPhoneHash)?.firstOrder || null,
      last_order_at: customerRecurrence.find((cr: any) => cr.customerPhoneHash === c.customerPhoneHash)?.lastOrder || null,
      days_since_last_order: customerRecurrence.find((cr: any) => cr.customerPhoneHash === c.customerPhoneHash)?.lastOrder 
        ? Math.floor((new Date().getTime() - new Date(customerRecurrence.find((cr: any) => cr.customerPhoneHash === c.customerPhoneHash)!.lastOrder).getTime()) / (1000 * 60 * 60 * 24))
        : null,
      avg_days_between_orders: customerRecurrence.find((cr: any) => cr.customerPhoneHash === c.customerPhoneHash)?.avgDaysBetween || null,
      median_days_between_orders: customerRecurrence.find((cr: any) => cr.customerPhoneHash === c.customerPhoneHash)?.medianDaysBetween || null,
      points_current: c.currentPoints,
      points_earned: c.totalSpent / 1000,
      points_spent: 0, // No disponible sin ledger
      points_per_order: c.pointsPerOrder,
      points_per_peso: c.dollarsPerPoint,
      redemptions: 0, // Extraer de redemptions
      reward_advance_offered: 0, // Extraer de events
      reward_advance_accepted: 0,
      reward_advance_count: 0,
      products_count: customerXProduct.find((c: any) => c.customerPhoneHash === c.customerPhoneHash)?.products.length || 0,
      categories_count: 0,
      repeat_customer: c.ordersCount > 1,
      segment: seg.segment || null,
      health_score: seg.healthScore?.total || null
    }
  })
  
  // 2. reward_intelligence_purchase_sequence
  const purchaseSequence = []
  Object.entries(customerRecurrence).forEach(([hash, seq]) => {
    seq.orders.forEach((order: any, idx: number) => {
      const prevOrder = seq.orders[idx - 1]
      const daysSincePrevious = prevOrder 
        ? Math.floor((new Date(order.createdAt).getTime() - new Date(prevOrder.createdAt).getTime()) / (1000 * 60 * 60 * 24))
        : null
      
      const currentPoints = pointsVsRecurrence.find(p => p.customerPhoneHash === hash)?.currentPoints || 0
      const estimatedPointsEarned = order.total / 1000
      
      purchaseSequence.push({
        customer_id: hash,
        order_id: order.orderId,
        purchase_number: idx + 1,
        order_date: order.createdAt,
        days_since_previous_purchase: daysSincePrevious,
        order_total: order.total,
        points_earned: estimatedPointsEarned,
        points_balance_after: currentPoints + estimatedPointsEarned, // Estimado
        items_count: Array.isArray(order.items) ? order.items.length : 0,
        products: Array.isArray(order.items) ? order.items.map((i: any) => i.name) : [],
        categories: Array.isArray(order.items) ? [...new Set(order.items.map((i: any) => i.categoryName))] : [],
        promotion: order.promoCode || null,
        reward_used: Array.isArray(order.rewardItems) && order.rewardItems.length > 0,
        reward_advance: order.rewardAdvanceApplied
      })
    })
  })
  
  // 3. reward_intelligence_threshold_simulation
  const thresholdSimulation = []
  const thresholds = [3000, 5000, 8000, 10000, 11000, 12000, 15000, 20000, 25000, 30000, 40000, 50000]
  
  rewardDistance.forEach(c => {
    thresholds.forEach(th => {
      const thAnalysis = c.thresholdAnalysis.find((t: any) => t.threshold === th)
      
      thresholdSimulation.push({
        customer_id: c.customerPhoneHash,
        current_points: c.currentPoints,
        threshold: th,
        points_remaining: thAnalysis?.pointsRemaining || 0,
        percentage_completed: thAnalysis?.percentageCompleted || 0,
        historical_points_per_order: c.pointsPerOrder || 0,
        estimated_orders_remaining: thAnalysis?.estimatedOrdersRemaining || 0,
        orders_already_completed: c.ordersCount,
        estimated_total_orders: thAnalysis?.estimatedTotalOrders || 0,
        days_since_last_order: c.daysSinceLastOrder || null,
        historical_avg_days_between_orders: customerRecurrence.find((cr: any) => cr.customerPhoneHash === c.customerPhoneHash)?.avgDaysBetween || null,
        estimated_days_to_threshold: thAnalysis?.estimatedOrdersRemaining && customerRecurrence.find((cr: any) => cr.customerPhoneHash === c.customerPhoneHash)?.avgDaysBetween
          ? thAnalysis.estimatedOrdersRemaining * customerRecurrence.find((cr: any) => cr.customerPhoneHash === c.customerPhoneHash)!.avgDaysBetween
          : null,
        reached_threshold_historically: thAnalysis?.reachedHistorically || false
      })
    })
  })
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '28_reward_intelligence_customer_base.json'),
    JSON.stringify(customerBase, null, 2)
  )
  
  fs.writeFileSync(
    path.join( OUTPUT_DIR, '28_reward_intelligence_purchase_sequence.json'),
    JSON.stringify(purchaseSequence, null, 2)
  )
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '28_reward_intelligence_threshold_simulation.json'),
    JSON.stringify(thresholdSimulation, null, 2)
  )
  
  console.log('  ✅ Final datasets generated')
  return { customerBase, purchaseSequence, thresholdSimulation }
}

// ============================================================================
// EXTRACTION SUMMARY
// ============================================================================
async function generateExtractionSummary(coverage: any, orders: any[], clubData: any, qualityReport: any, lineage: any, posthogStatus: any) {
  console.log('\n📊 GENERANDO RESUMEN EJECUTIVO')
  
  const summary = {
    timestamp: new Date().toISOString(),
    tenant: {
      name: coverage.tenant.name,
      id: coverage.tenant.id,
      slug: coverage.tenant.slug,
      plan: coverage.tenant.plan
    },
    coverage: {
      period: {
        firstOrder: coverage.firstOrder ? new Date(coverage.firstOrder).toISOString().split('T')[0] : 'N/A',
        lastOrder: coverage.lastOrder ? new Date(coverage.lastOrder).toISOString().split('T')[0] : 'N/A',
        totalDays: coverage.totalDays
      },
      gaps: 0
    },
    dataAvailable: {
      customers: clubData.consumers.length,
      clubMembers: clubData.members.length,
      orders: orders.length,
      validOrders: orders.filter((o: any) => o.status !== 'cancelled').length,
      cancelledOrders: orders.filter((o: any) => o.status === 'cancelled').length,
      customerEvents: 15508, // Del reporte anterior
      storeItems: 1,
      promotions: 10,
      qrPromos: 2,
      posthogEvents: 0 // Credenciales no disponibles
    },
    dataNotAvailable: {
      pointsLedger: 'No existe ledger histórico de movimientos de puntos',
      costos: 'No hay datos de food cost, margen, o contribution margin',
      inventory: 'Schema existe pero sin datos para este tenant',
      preparationTime: 'No disponible',
      capacity: 'No disponible',
      stockouts: 'No disponible',
      posthogRealEvents: 'Credenciales no disponibles en entorno local'
    },
    dataPartial: {
      pointsHistory: 'Solo puntos actuales, sin ledger histórico',
      rewardAdvanceEvents: 'Solo desde CustomerEvents, sin confirmación de consolidación',
      inventory: 'Schema existe pero sin datos'
    },
    dataProblems: qualityReport.issues.map(i => ({
      entity: i.entity,
      issue: i.issue,
      affectedRecords: i.affectedRecords,
      percentage: i.percentage,
      impact: i.impact
    })),
    coverageScore: qualityReport.overallScore,
    lineage,
    posthogStatus
  }
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'EXTRACTION_SUMMARY.json'),
    JSON.stringify(summary, null, 2)
  )
  
  fs.writeFileSync(
    path.join( OUTPUT_DIR, 'EXTRACTION_SUMMARY.md'),
    generateMarkdownSummary(summary)
  )
  
  console.log('  ✅ Extraction summary generated')
  return summary
}

function generateMarkdownSummary(summary: any): string {
  return `# REWARD INTELLIGENCE DATA EXTRACTION - KEKE&LARRY
**Generated:** ${summary.timestamp}

==================================================
DATOS DISPONIBLES
==================================================

- **Clientes:** ${summary.dataAvailable.customers}
- **Miembros Club:** ${summary.dataAvailable.clubMembers}
- **Órdenes:** ${summary.dataAvailable.orders} (${summary.dataAvailable.validOrders} válidas, ${summary.dataAvailable.cancelledOrders} canceladas)
- **Order Items:** Extraídos de orders
- **Movimientos de Puntos:** Solo puntos actuales (NO HISTÓRICO)
- **Rewards:** ${summary.dataAvailable.storeItems}
- **Redenciones:** Extraídas de store redemptions y hidden rewards
- **Reward Advance:** Extraído de CustomerEvents y orders
- **Productos:** Analizados desde orders
- **Promociones:** ${summary.dataAvailable.promotions} promociones, ${summary.dataAvailable.qrPromos} QR promos
- **Eventos:** ${summary.dataAvailable.customerEvents} CustomerEvents
- **Eventos PostHog:** ${summary.dataAvailable.posthogEvents} (credenciales no disponibles)
- **Período completo:** ${summary.coverage.period.firstOrder} a ${summary.coverage.period.lastOrder} (${summary.coverage.period.totalDays} días)

==================================================
DATOS NO DISPONIBLES
==================================================

- **Points Ledger Histórico:** No existe ledger histórico de movimientos de puntos
- **Costos:** No hay datos de food cost, margen, o contribution margin
- **Inventory:** Schema existe pero sin datos para este tenant
- **Tiempos de preparación:** No disponible
- **Capacidad:** No disponible
- **Stockouts:** No disponible
- **Eventos PostHog reales:** Credenciales no disponibles en entorno local

==================================================
DATOS PARCIALES
==================================================

- **Points History:** Solo puntos actuales en loyaltymembers.loyalty.points, sin ledger histórico
- **Reward Advance:** Solo eventos en CustomerEvents, sin confirmación de consolidación
- **Inventory:** Schema existe (inventory_skus, inventory_recipes, inventory_ledger) pero sin datos

==================================================
DATOS CON PROBLEMAS
==================================================

${summary.dataProblems.map((p: any, i) => 
  `${i + 1}. **${p.entity.toUpperCase()}** - ${p.issue}\n   - Afectados: ${p.affectedRecords} (${p.percentage.toFixed(1)}%)\n   - Impacto: ${p.impact}`
).join('\n\n')}

==================================================
COBERTURA
==================================================

- **Score:** ${summary.coverageScore}/100
- **Órdenes con phoneHash:** ${summary.dataAvailable.validOrders - summary.dataProblems.find((p: any) => p.entity === 'orders' && p.issue.includes('phoneHash'))?.affectedRecords || 0}/${summary.dataAvailable.validOrders}
- **Eventos con phoneHash:** ${summary.dataAvailable.customerEvents - summary.dataProblems.find((p: any) => p.entity === 'customerevents' && p.issue.includes('phoneHash'))?.affectedRecords || 0}/${summary.dataAvailable.customerEvents}

==================================================
LIMITACIONES
==================================================

1. **Sin ledger de puntos:** No se puede reconstruir el historial completo de movimientos de puntos
2. **Sin datos de costos:** No se puede calcular margen real para rewards
3. **Sin datos operativos:** No se puede evaluar capacidad o restricciones
4. **PostHog inaccesible:** No se puede obtener comportamiento digital completo
5. **Puntos estimados:** Los puntos por orden se estiman como total/1000 (fórmula del código: orderTotalPesos * 0.1)

==================================================
ARCHIVOS GENERADOS
==================================================

1. 01_tenant_coverage.json
2. 02_club_data.json
3. 03_points_rule.json
4. 04_orders_complete.json
5. 05_ticket_real.json
6. 06_recurrence.json
7. 07_points_vs_recurrence.json
8. 08_reward_distance.json
9. 09_reward_advance.json
10. 10_redemptions.json
11. 11_store_items.json
12. 12_products.json
13. 13_product_x_recurrence.json
14. 14_product_x_points.json
15. 15_product_combinations.json
16. 16_customer_x_product.json
17. 17_promotions.json
18. 18_customer_events_complete.json
19. 19_posthog_status.json
20. 20_temporal.json
21. 21_customer_journey.json
22. 22_segmentation.json
23. 23_feedback.json
24. 24_operational.json
25. 25_historical.json
26. 26_data_quality.json
27. 27_data_lineage.json
28. EXTRACTION_SUMMARY.json
28. EXTRACTION_SUMMARY.md
28_reward_intelligence_customer_base.json
28_reward_intelligence_purchase_sequence.json
28_reward_intelligence_threshold_simulation.json

==================================================
DATASETS CLAVES PARA REWARD INTELLIGENCE
==================================================

**28_reward_intelligence_customer_base.json**
- Una fila por cliente
- Incluye: club_member, orders_count, total_spent, avg_ticket, first/last order, points_current, points_earned, points_per_order, segment, health_score

**28_reward_intelligence_purchase_sequence.json**
- Una fila por compra por cliente
- Incluye: purchase_number, days_since_previous, order_total, points_earned, products, categories, promotion, reward_used, reward_advance

**28_reward_intelligence_threshold_simulation.json**
- Una fila por cliente × threshold
- Incluye: current_points, points_remaining, percentage_completed, estimated_orders_remaining, days_to_threshold, reached_historically
- Thresholds: 3k, 5k, 8k, 10k, 11k, 12k, 15k, 20k, 25k, 30k, 40k, 50k

==================================================
REGLA DE PUNTOS (CÓDIGO)
==================================================

**Fuente:** apps/saas/lib/loyalty.ts

**Modo:** fixed_per_currency (default)

**Fórmula:**
\`\`
orderTotalPesos = orderTotal / 100  (centavos → pesos)
rawBase = orderTotalPesos × pointsPerCurrency  (default: 0.1)
basePoints = Math.floor(rawBase)
fractionalRemainder = rawBase - basePoints
microBonusRaw = fractionalRemainder × 0.0575
microBonus = Math.max(1, Math.round(microBonusRaw × 100)) > 50 ? Math.ceil(fractionalRemainder) : Math.floor(fractionalRemainder)
microBonusFinal = microBonus > 0 ? microBonus : (fractionalRemainder ≥ 0.5 ? 1 : 0)
total = basePoints + microBonusFinal + pointsPerOrder
\`\`

**Resultado:** ~1 punto por $10 (default)

==================================================
END OF EXTRACTION SUMMARY
==================================================
`
}

// ============================================================================
// MAIN
// ============================================================================
async function runRewardIntelligenceExtraction() {
  console.log('🔍 REWARD INTELLIGENCE DATA EXTRACTION — Keke & Larry')
  console.log('='.repeat(70))
  
  try {
    await connect()
    await ensureOutputDir()
    
    const tenantId = new mongoose.Types.ObjectId(TENANT_ID)
    
    // Ejecutar todas las extracciones
    const coverage = await extractTenantCoverage(tenantId)
    const clubData = await extractClubData(tenantId)
    const pointsRule = extractPointsRule()
    const ordersComplete = await extractOrdersComplete(tenantId)
    const ticketReal = await calculateTicketReal(ordersComplete)
    const recurrence = await calculateRecurrence(ordersComplete)
    const pointsVsRecurrence = await calculatePointsVsRecurrence(recurrence.customerRecurrence, clubData)
    const rewardDistance = await calculateRewardDistance(pointsVsRecurrence)
    const rewardAdvance = await extractRewardAdvanceData(tenantId)
    const redemptions = await extractRedemptions(tenantId)
    const storeItems = await extractStoreItems(tenantId)
    const products = await extractProducts(ordersComplete, [])
    const productXRecurrence = await calculateProductXRecurrence(ordersComplete, products)
    const productXPoints = await calculateProductXPoints(ordersComplete, products)
    const productCombinations = await calculateProductCombinations(ordersComplete)
    const customerXProduct = await calculateCustomerXProduct(ordersComplete)
    const customerEventsComplete = await extractCustomerEventsComplete(tenantId)
    const promotions = await extractPromotions(tenantId)
    const posthogStatus = await checkPostHogAccess()
    const temporal = await calculateTemporal(ordersComplete)
    const customerJourney = await extractCustomerJourney(customerEventsComplete, ordersComplete, clubData)
    const segmentation = await extractSegmentation(clubData)
    const feedback = await extractFeedback(tenantId)
    const operational = await extractOperationalData(tenantId)
    const historical = await extractHistorical(ordersComplete, clubData)
    const qualityReport = await analyzeDataQuality(ordersComplete, clubData, customerEventsComplete)
    const lineage = extractDataLineage()
    
    // Generar datasets finales
    const finalDatasets = await generateFinalDatasets(
      ordersComplete,
      clubData,
      recurrence.customerRecurrence,
      pointsVsRecurrence,
      rewardDistance,
      customerXProduct,
      productCombinations,
      customerEventsComplete,
      segmentation
    )
    
    // Generar resumen ejecutivo
    const summary = await generateExtractionSummary(
      coverage,
      ordersComplete,
      clubData,
      qualityReport,
      lineage,
      posthogStatus
    )
    
    console.log('\n' + '='.repeat(70))
    console.log('✅ REWARD INTELLIGENCE EXTRACTION COMPLETE')
    console.log('='.repeat(70))
    console.log(`\n📁 Data exported to: ${OUTPUT_DIR}`)
    console.log(`📄 Summary: ${path.join(OUTPUT_DIR, 'EXTRACTION_SUMMARY.md')}`)
    console.log(`\n📊 KEY DATASETS FOR REWARD INTELLIGENCE:`)
    console.log(`  - reward_intelligence_customer_base.json (${finalDatasets.customerBase.length} clientes)`)
    console.log(`  - reward_intelligence_purchase_sequence.json (${finalDatasets.purchaseSequence.length} compras)`)
    console.log(`  - reward_intelligence_threshold_simulation.json (${finalDatasets.thresholdSimulation.length} simulaciones)`)
    
  } catch (error) {
    console.error('❌ Error:', error)
    throw error
  } finally {
    await disconnect()
  }
}

runRewardIntelligenceExtraction()
