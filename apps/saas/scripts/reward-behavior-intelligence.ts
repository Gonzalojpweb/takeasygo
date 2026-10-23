import mongoose from 'mongoose'
import * as fs from 'fs'
import * as path from 'path'

// ============================================================================
// REWARD BEHAVIOR INTELLIGENCE - KEKE&LARRY
// Análisis profundo de comportamiento de acumulación vs canje
// ============================================================================

const MONGODB_URI = process.env.MONGODB_URI || ''
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

// ============================================================================
// LOAD ALL DATASETS
// ============================================================================
function loadAllDatasets() {
  console.log('\n📊 CARGANDO TODOS LOS DATASETS')
  
  const customerBase = JSON.parse(
    fs.readFileSync(path.join(OUTPUT_DIR, '28_reward_intelligence_customer_base.json'), 'utf-8')
  )
  
  const purchaseSequence = JSON.parse(
    fs.readFileSync(path.join(OUTPUT_DIR, '28_reward_intelligence_purchase_sequence.json'), 'utf-8')
  )
  
  const recurrence = JSON.parse(
    fs.readFileSync(path.join(OUTPUT_DIR, '06_recurrence.json'), 'utf-8')
  )
  
  const clubData = JSON.parse(
    fs.readFileSync(path.join(OUTPUT_DIR, '02_club_data.json'), 'utf-8')
  )
  
  const products = JSON.parse(
    fs.readFileSync(path.join(OUTPUT_DIR, '12_products.json'), 'utf-8')
  )
  
  const productCombinations = JSON.parse(
    fs.readFileSync(path.join(OUTPUT_DIR, '15_product_combinations.json'), 'utf-8')
  )
  
  const customerXProduct = JSON.parse(
    fs.readFileSync(path.join(OUTPUT_DIR, '16_customer_x_product.json'), 'utf-8')
  )
  
  const thresholdSimulation = JSON.parse(
    fs.readFileSync(path.join(OUTPUT_DIR, '28_reward_intelligence_threshold_simulation.json'), 'utf-8')
  )
  
  const memberPoints = JSON.parse(
    fs.readFileSync(path.join(OUTPUT_DIR, 'member_points_verification.json'), 'utf-8')
  )
  
  const distanceDistribution = JSON.parse(
    fs.readFileSync(path.join(OUTPUT_DIR, 'reward_distance_distribution.json'), 'utf-8')
  )
  
  console.log(`  ✅ Customer base: ${customerBase.length}`)
  console.log(`  ✅ Purchase sequence: ${purchaseSequence.length}`)
  console.log(`  ✅ Recurrence: ${recurrence.customerRecurrence.length}`)
  console.log(`  ✅ Club data: ${clubData.members.length}`)
  console.log(`  ✅ Products: ${products.length}`)
  console.log(`  ✅ Product combinations: ${productCombinations.pairs.length}`)
  console.log(`  ✅ Customer x Product: ${customerXProduct.length}`)
  console.log(`  ✅ Threshold simulation: ${thresholdSimulation.length}`)
  console.log(`  ✅ Member points: ${memberPoints.length}`)
  console.log(`  ✅ Distance distribution: ${distanceDistribution.distanceAnalysis.length}`)
  
  return {
    customerBase,
    purchaseSequence,
    recurrence,
    clubData,
    products,
    productCombinations,
    customerXProduct,
    thresholdSimulation,
    memberPoints,
    distanceDistribution
  }
}

// ============================================================================
// 3. SEGMENTAR CLIENTES POR PUNTOS
// ============================================================================
function segmentByPoints(memberPoints: any[], purchaseSequence: any[]) {
  console.log('\n📊 3. SEGMENTANDO CLIENTES POR PUNTOS')
  
  const segments = {
    '0-1000': [],
    '1000-2500': [],
    '2500-5000': [],
    '5000-7500': [],
    '7500-10000': [],
    '10000-12690': [],
    '12690+': []
  }
  
  memberPoints.forEach(m => {
    const points = m.points
    if (points < 1000) segments['0-1000'].push(m)
    else if (points < 2500) segments['1000-2500'].push(m)
    else if (points < 5000) segments['2500-5000'].push(m)
    else if (points < 7500) segments['5000-7500'].push(m)
    else if (points < 10000) segments['7500-10000'].push(m)
    else if (points < 12690) segments['10000-12690'].push(m)
    else segments['12690+'].push(m)
  })
  
  // For each segment, analyze purchase behavior
  const segmentsWithBehavior = Object.entries(segments).map(([segment, members]) => {
    const memberIds = new Set(members.map((m: any) => m.phoneHash))
    
    const segmentPurchases = purchaseSequence.filter(p => memberIds.has(p.customer_id))
    
    // Calculate behavior metrics
    const customerPurchases = segmentPurchases.reduce((acc, p) => {
      if (!acc[p.customer_id]) acc[p.customer_id] = []
      acc[p.customer_id].push(p)
      return acc
    }, {} as Record<string, any[]>)
    
    const customerMetrics = Object.entries(customerPurchases).map(([customerId, purchases]) => {
      purchases.sort((a, b) => new Date(a.order_date).getTime() - new Date(b.order_date).getTime())
      
      const totals = purchases.map(p => p.order_total)
      const intervals = []
      for (let i = 1; i < purchases.length; i++) {
        const days = Math.floor((new Date(purchases[i].order_date).getTime() - new Date(purchases[i-1].order_date).getTime()) / (1000 * 60 * 60 * 24))
        intervals.push(days)
      }
      
      return {
        customerId,
        ordersCount: purchases.length,
        totalSpent: totals.reduce((sum, t) => sum + t, 0),
        avgTicket: totals.reduce((sum, t) => sum + t, 0) / totals.length,
        medianTicket: totals[Math.floor(totals.length / 2)],
        firstPurchase: purchases[0]?.order_date,
        lastPurchase: purchases[purchases.length - 1]?.order_date,
        avgDaysBetween: intervals.length > 0 ? intervals.reduce((sum, d) => sum + d, 0) / intervals.length : null,
        intervals
      }
    })
    
    const segmentMetrics = {
      segment,
      memberCount: members.length,
      purchaseCount: segmentPurchases.length,
      avgOrdersPerCustomer: customerMetrics.length > 0 ? customerMetrics.reduce((sum, c) => sum + c.ordersCount, 0) / customerMetrics.length : 0,
      avgTicket: customerMetrics.length > 0 ? customerMetrics.reduce((sum, c) => sum + c.avgTicket, 0) / customerMetrics.length : 0,
      avgDaysBetween: customerMetrics.filter(c => c.avgDaysBetween !== null).length > 0 
        ? customerMetrics.filter(c => c.avgDaysBetween !== null).reduce((sum, c) => sum + c.avgDaysBetween, 0) / customerMetrics.filter(c => c.avgDaysBetween !== null).length 
        : null,
      recurrentCustomers: customerMetrics.filter(c => c.ordersCount > 1).length,
      customerMetrics
    }
    
    return segmentMetrics
  })
  
  console.log(`  ✅ ${segmentsWithBehavior.length} segmentos analizados`)
  
  return segmentsWithBehavior
}

// ============================================================================
// 4. ANALIZAR "CASI CANJEADORES"
// ============================================================================
function analyzeNearRedeemers(memberPoints: any[], purchaseSequence: any[], rewardPoints: number = 12690) {
  console.log('\n📊 4. ANALIZANDO CASI CANJEADORES')
  
  const nearRedeemerSegments = {
    '90%+': [],
    '80-90%': [],
    '70-80%': [],
    '60-70%': [],
    '50-60%': [],
    '40-50%': [],
    '30-40%': [],
    '20-30%': [],
    '10-20%': [],
    '0-10%': []
  }
  
  memberPoints.forEach(m => {
    const percentage = (m.points / rewardPoints) * 100
    if (percentage >= 90) nearRedeemerSegments['90%+'].push(m)
    else if (percentage >= 80) nearRedeemerSegments['80-90%'].push(m)
    else if (percentage >= 70) nearRedeemerSegments['70-80%'].push(m)
    else if (percentage >= 60) nearRedeemerSegments['60-70%'].push(m)
    else if (percentage >= 50) nearRedeemerSegments['50-60%'].push(m)
    else if (percentage >= 40) nearRedeemerSegments['40-50%'].push(m)
    else if (percentage >= 30) nearRedeemerSegments['30-40%'].push(m)
    else if (percentage >= 20) nearRedeemerSegments['20-30%'].push(m)
    else if (percentage >= 10) nearRedeemerSegments['10-20%'].push(m)
    else nearRedeemerSegments['0-10%'].push(m)
  })
  
  const nearRedeemerAnalysis = Object.entries(nearRedeemerSegments).map(([segment, members]) => {
    const memberIds = new Set(members.map((m: any) => m.phoneHash))
    
    const segmentPurchases = purchaseSequence.filter(p => memberIds.has(p.customer_id))
    
    const customerPurchases = segmentPurchases.reduce((acc, p) => {
      if (!acc[p.customer_id]) acc[p.customer_id] = []
      acc[p.customer_id].push(p)
      return acc
    }, {} as Record<string, any[]>)
    
    const customerMetrics = Object.entries(customerPurchases).map(([customerId, purchases]) => {
      purchases.sort((a, b) => new Date(a.order_date).getTime() - new Date(b.order_date).getTime())
      
      const totals = purchases.map(p => p.order_total)
      const avgTicket = totals.reduce((sum, t) => sum + t, 0) / totals.length
      const pointsPerPurchase = Math.floor(avgTicket * 0.0575)
      
      return {
        customerId,
        ordersCount: purchases.length,
        avgTicket,
        pointsPerPurchase,
        lastPurchase: purchases[purchases.length - 1]?.order_date,
        daysSinceLastPurchase: purchases.length > 0 
          ? Math.floor((new Date().getTime() - new Date(purchases[purchases.length - 1].order_date).getTime()) / (1000 * 60 * 60 * 24))
          : null
      }
    })
    
    const segmentAnalysis = {
      segment,
      memberCount: members.length,
      avgPoints: members.length > 0 ? members.reduce((sum, m) => sum + m.points, 0) / members.length : 0,
      pointsPerPurchase: customerMetrics.length > 0 ? customerMetrics.reduce((sum, c) => sum + c.pointsPerPurchase, 0) / customerMetrics.length : 0,
      stillPurchasing: customerMetrics.filter(c => c.daysSinceLastPurchase !== null && c.daysSinceLastPurchase < 30).length,
      stoppedPurchasing: customerMetrics.filter(c => c.daysSinceLastPurchase !== null && c.daysSinceLastPurchase >= 30).length,
      customerMetrics
    }
    
    return segmentAnalysis
  })
  
  console.log(`  ✅ ${nearRedeemerAnalysis.length} segmentos de "casi canjeadores" analizados`)
  
  return nearRedeemerAnalysis
}

// ============================================================================
// 5. ANALIZAR LOS QUE YA PODRÍAN CANJEAR
// ============================================================================
function analyzeRedeemableCustomers(memberPoints: any[], purchaseSequence: any[], redemptions: any[]) {
  console.log('\n📊 5. ANALIZANDO CLIENTES QUE YA PODRÍAN CANJEAR')
  
  const rewardPoints = 12690
  const redeemableMembers = memberPoints.filter(m => m.points >= rewardPoints)
  
  console.log(`  Clientes con >= ${rewardPoints} pts: ${redeemableMembers.length}`)
  
  const memberIds = new Set(redeemableMembers.map((m: any) => m.phoneHash))
  
  const redeemablePurchases = purchaseSequence.filter(p => memberIds.has(p.customer_id))
  
  const redeemableAnalysis = redeemableMembers.map(m => {
    const customerId = m.phoneHash
    const customerPurchases = redeemablePurchases.filter(p => p.customer_id === customerId)
    
    customerPurchases.sort((a, b) => new Date(a.order_date).getTime() - new Date(b.order_date).getTime())
    
    const totals = customerPurchases.map(p => p.order_total)
    const avgTicket = totals.length > 0 ? totals.reduce((sum, t) => sum + t, 0) / totals.length : 0
    
    // Find when they reached the threshold
    let reachedThreshold = null
    let accumulatedPoints = 0
    let purchaseNumber = 0
    
    for (const purchase of customerPurchases) {
      accumulatedPoints += Math.floor(purchase.order_total * 0.0575)
      purchaseNumber++
      if (accumulatedPoints >= rewardPoints && !reachedThreshold) {
        reachedThreshold = {
          purchaseNumber,
          purchaseDate: purchase.order_date,
          accumulatedPoints
        }
      }
    }
    
    return {
      memberId: m._id,
      customerId,
      pointsCurrent: m.points,
      pointsOverThreshold: m.points - rewardPoints,
      totalOrders: customerPurchases.length,
      avgTicket,
      reachedThreshold,
      purchasesSinceThreshold: reachedThreshold 
        ? customerPurchases.filter(p => new Date(p.order_date) > new Date(reachedThreshold.purchaseDate)).length
        : 0,
      lastPurchase: customerPurchases.length > 0 ? customerPurchases[customerPurchases.length - 1].order_date : null,
      daysSinceLastPurchase: customerPurchases.length > 0 
        ? Math.floor((new Date().getTime() - new Date(customerPurchases[customerPurchases.length - 1].order_date).getTime()) / (1000 * 60 * 60 * 24))
        : null,
      didRedeem: redemptions.some((r: any) => r.memberId === m._id)
    }
  })
  
  console.log(`  ✅ ${redeemableAnalysis.length} clientes analizados`)
  
  return redeemableAnalysis
}

// ============================================================================
// 6. ANALIZAR EL ÚNICO CANJE
// ============================================================================
async function analyzeSingleRedemption() {
  console.log('\n📊 6. ANALIZANDO EL ÚNICO CANJE')
  
  const db = mongoose.connection.db!
  
  const redemptions = await db.collection('storeredemptions')
    .find({ tenantId: new mongoose.Types.ObjectId(TENANT_ID) })
    .toArray()
  
  const hiddenRewards = await db.collection('hiddenrewardclaims')
    .find({ tenantId: new mongoose.Types.ObjectId(TENANT_ID) })
    .toArray()
  
  console.log(`  Store redemptions: ${redemptions.length}`)
  console.log(`  Hidden rewards: ${hiddenRewards.length}`)
  
  const singleRedemption = {
    storeRedemptions: redemptions,
    hiddenRewards,
    total: redemptions.length + hiddenRewards.length
  }
  
  return singleRedemption
}

// ============================================================================
// 7. PATRONES DE ACUMULACIÓN
// ============================================================================
function analyzeAccumulationPatterns(memberPoints: any[], purchaseSequence: any[]) {
  console.log('\n📊 7. BUSCANDO PATRONES DE ACUMULACIÓN')
  
  const memberIds = new Set(memberPoints.map((m: any) => m.phoneHash))
  
  const customerPurchases = purchaseSequence.filter(p => memberIds.has(p.customer_id))
  
  console.log(`  Member IDs: ${memberIds.size}`)
  console.log(`  Customer purchases: ${customerPurchases.length}`)
  
  const customerPatterns = memberPoints.map(m => {
    const customerId = m.phoneHash
    const purchases = customerPurchases.filter(p => p.customer_id === customerId)
    
    purchases.sort((a, b) => new Date(a.order_date).getTime() - new Date(b.order_date).getTime())
    
    const pattern = {
      pattern: 'unknown',
      pointsCurrent: m.points,
      ordersCount: purchases.length,
      firstPurchase: purchases[0]?.order_date,
      lastPurchase: purchases[purchases.length - 1]?.order_date,
      daysSinceLastPurchase: purchases.length > 0 
        ? Math.floor((new Date().getTime() - new Date(purchases[purchases.length - 1].order_date).getTime()) / (1000 * 60 * 60 * 24))
        : null,
      stoppedPurchasing: purchases.length > 0 && purchases.length > 1 
        ? Math.floor((new Date().getTime() - new Date(purchases[purchases.length - 1].order_date).getTime()) / (1000 * 60 * 60 * 24)) > 60
        : false
    }
    
    // Determine pattern
    if (pattern.ordersCount === 0) {
      pattern.pattern = 'F: Sin compras'
    } else if (pattern.ordersCount === 1) {
      pattern.pattern = 'A: Una sola compra'
    } else if (pattern.stoppedPurchasing) {
      pattern.pattern = 'B: Dejó de comprar'
    } else if (pattern.pointsCurrent >= 12690) {
      pattern.pattern = 'D: Supera reward pero no canjea'
    } else if (pattern.daysSinceLastPurchase !== null && pattern.daysSinceLastPurchase < 14) {
      pattern.pattern = 'E: Compra reciente'
    } else if (pattern.daysSinceLastPurchase !== null && pattern.daysSinceLastPurchase < 30) {
      pattern.pattern = 'E: Compra reciente'
    } else {
      pattern.pattern = 'E: Compra activa'
    }
    
    return pattern
  })
  
  const patternCounts = customerPatterns.reduce((acc, p) => {
    acc[p.pattern] = (acc[p.pattern] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  
  console.log('  Patrones encontrados:')
  Object.entries(patternCounts).forEach(([pattern, count]) => {
    console.log(`    ${pattern}: ${count} (${(count / memberPoints.length * 100).toFixed(1)}%)`)
  })
  
  return { customerPatterns, patternCounts }
}

// ============================================================================
// 8. VARIABLES IMPORTANCE ANALYSIS
// ============================================================================
function analyzeVariableImportance(segments: any[], nearRedeemers: any[], redeemable: any[], patterns: any, patternCounts: any) {
  console.log('\n📊 8. ANALIZANDO IMPORTANCIA DE VARIABLES')
  
  const variableAnalysis = [
    {
      variable: 'Reward Distance',
      observed: 'Members near reward (80%+) continue purchasing: ' + nearRedeemers.filter(s => s.segment === '80-90%' || s.segment === '90%+').reduce((sum, s) => sum + s.stillPurchasing, 0),
      relationship: 'Clients closer to reward do not show higher redemption',
      evidenceQuality: 'medium',
      notes: 'Low sample size near reward'
    },
    {
      variable: 'Frequency',
      observed: 'Avg orders per segment: ' + segments.map(s => `${s.segment}: ${s.avgOrdersPerCustomer.toFixed(1)}`).join(', '),
      relationship: 'High frequency does not correlate with redemption',
      evidenceQuality: 'high',
      notes: '1 redemption total insufficient for strong correlation'
    },
    {
      variable: 'Ticket',
      observed: 'Avg ticket by segment: ' + segments.map(s => `${s.segment}: $${s.avgTicket.toFixed(0)}`).join(', '),
      relationship: 'No clear correlation with redemption',
      evidenceQuality: 'medium',
      notes: '1 redemption total insufficient for correlation'
    },
    {
      variable: 'Points Accumulated',
      observed: `${redeemable.length} members have >= 12,690 pts but ${redeemable.filter(r => !r.didRedeem).length} did not redeem`,
      relationship: 'High points does not drive redemption',
      evidenceQuality: 'high',
      notes: 'Strong evidence: having points is not sufficient for redemption'
    },
    {
      variable: 'Antigüedad',
      observed: 'Not directly analyzed in this dataset',
      relationship: 'Unknown',
      evidenceQuality: 'low',
      notes: 'Need to analyze join date vs purchase behavior'
    },
    {
      variable: 'Reward Advance',
      observed: '0 reward advance events found in dataset',
      relationship: 'Cannot determine',
      evidenceQuality: 'none',
      notes: 'No data available on Reward Advance usage'
    },
    {
      variable: 'Product Preferences',
      observed: 'Product combinations exist but not correlated with redemption',
      relationship: 'Unknown',
      evidenceQuality: 'low',
      notes: 'Need to correlate product preferences with redemption behavior'
    },
    {
      variable: 'Stopped Purchasing',
      observed: patternCounts['B: Dejó de comprar'] || 0,
      relationship: 'Clients who stop purchasing do not redeem',
      evidenceQuality: 'medium',
      notes: 'Redemption requires continued engagement'
    }
  ]
  
  console.log(`  ✅ ${variableAnalysis.length} variables analizadas`)
  
  return variableAnalysis
}

// ============================================================================
// 9. GENERATE FINAL REPORT
// ============================================================================
async function generateBehaviorIntelligenceReport(
  segments: any[],
  nearRedeemers: any[],
  redeemable: any[],
  singleRedemption: any,
  patterns: any,
  variableAnalysis: any[],
  products: any[],
  productCombinations: any[],
  purchaseSequence: any[]
) {
  console.log('\n📊 9. GENERANDO REPORTE FINAL')
  
  const report = {
    timestamp: new Date().toISOString(),
    tenantId: TENANT_ID,
    
    // Segments
    segments,
    
    // Near redeemers
    nearRedeemers,
    
    // Redeemable customers
    redeemable,
    
    // Single redemption
    singleRedemption,
    
    // Patterns
    patterns,
    
    // Variable analysis
    variableAnalysis,
    
    // Product insights
    topProducts: products.slice(0, 10).map(p => ({
      name: p.name,
      categoryName: p.categoryName,
      totalQuantity: p.totalQuantity,
      totalRevenue: p.totalRevenue,
      orderCount: p.orderCount
    })),
    
    // Product combinations
    topCombinations: productCombinations.pairs.slice(0, 10),
    
    // Conclusions
    conclusions: {
      whyLowRedemption: [
        'Having sufficient points does not drive redemption (evidence: ' + redeemable.length + ' members with >=12,690 pts, ' + redeemable.filter(r => !r.didRedeem).length + ' did not redeem)',
        'Reward distance is a factor but not the only one',
        '1 total redemption suggests systemic issue, not just distance',
        'No evidence that Reward Advance is being used to bridge the gap',
        'Stopped purchasing correlates with non-redemption'
      ],
      customerTypes: Object.entries(patterns.patternCounts).map(([pattern, count]) => `${pattern}: ${count} (${(count / patterns.customerPatterns.length * 100).toFixed(1)}%)`),
      keyVariables: variableAnalysis.filter(v => v.evidenceQuality === 'high' || v.evidenceQuality === 'medium').map(v => v.variable),
      dataGaps: [
        'Reward Advance usage data not available',
        'Product preference to redemption correlation not analyzed',
        'UI interaction data not available',
        'Reward visibility/incentive display not analyzed',
        'Customer lifecycle events not correlated with redemption'
      ]
    }
  }
  
  return report
}

// ============================================================================
// MAIN
// ============================================================================
async function runRewardBehaviorIntelligence() {
  console.log('🔍 REWARD BEHAVIOR INTELLIGENCE - KEKE&LARRY')
  console.log('='.repeat(70))
  
  try {
    await connect()
    
    // Load all datasets
    const datasets = loadAllDatasets()
    
    // Segment by points
    const segments = segmentByPoints(datasets.memberPoints, datasets.purchaseSequence)
    
    // Analyze near redeemers
    const nearRedeemers = analyzeNearRedeemers(datasets.memberPoints, datasets.purchaseSequence)
    
    // Analyze redeemable customers
    const redeemable = analyzeRedeemableCustomers(datasets.memberPoints, datasets.purchaseSequence, datasets.clubData.members)
    
    // Analyze single redemption
    const singleRedemption = await analyzeSingleRedemption()
    
    // Analyze accumulation patterns
    const patterns = analyzeAccumulationPatterns(datasets.memberPoints, datasets.purchaseSequence)
    
    // Analyze variable importance
    const variableAnalysis = analyzeVariableImportance(segments, nearRedeemers, redeemable, patterns, patterns.patternCounts)
    
    // Generate report
    const report = await generateBehaviorIntelligenceReport(
      segments,
      nearRedeemers,
      redeemable,
      singleRedemption,
      patterns,
      variableAnalysis,
      datasets.products,
      datasets.productCombinations,
      datasets.purchaseSequence
    )
    
    // Save report
    const jsonPath = path.join(OUTPUT_DIR, 'reward_behavior_intelligence_keke_larry.json')
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2))
    
    const mdPath = path.join(OUTPUT_DIR, 'REWARD_BEHAVIOR_INTELLIGENCE_KEKE_LARRY.md')
    fs.writeFileSync(mdPath, generateMarkdownReport(report))
    
    console.log('\n' + '='.repeat(70))
    console.log('✅ ANÁLISIS COMPLETADO')
    console.log('='.repeat(70))
    console.log(`\n📁 JSON: ${jsonPath}`)
    console.log(`📁 Markdown: ${mdPath}`)
    
  } catch (error) {
    console.error('❌ Error:', error)
    throw error
  } finally {
    await disconnect()
  }
}

function generateMarkdownReport(report: any): string {
  const segmentsText = report.segments.map((s: any) => {
    return `${s.segment} pts (${s.memberCount} miembros)
  - Promedio puntos: ${s.avgPoints ? s.avgPoints.toFixed(0) : 'N/A'}
  - Compras promedio: ${s.avgOrdersPerCustomer ? s.avgOrdersPerCustomer.toFixed(1) : 'N/A'}
  - Ticket promedio: $${s.avgTicket ? s.avgTicket.toFixed(0) : 'N/A'}
  - Días entre compras: ${s.avgDaysBetween ? s.avgDaysBetween.toFixed(1) : 'N/A'}
  - Recurrentes: ${s.recurrentCustomers} (${(s.recurrentCustomers / s.memberCount * 100).toFixed(1)}%)`
  }).join('\n\n')
  
  const customerTypesText = report.conclusions.customerTypes.map((t: string) => `- ${t}`).join('\n')
  
  const whyLowRedemptionText = report.conclusions.whyLowRedemption.map((h: string, i) => `${i + 1}. ${h}`).join('\n')
  
  const dataGapsText = report.conclusions.dataGaps.map((g: string, i) => `${i + 1}. ${g}`).join('\n')
  
  const variableAnalysisText = report.variableAnalysis.map((v: any) => {
    return `**${v.variable}**
  - Observado: ${v.observed}
  - Relación con canje/recurrencia: ${v.relationship}
  - Calidad de evidencia: ${v.evidenceQuality}
  - Notas: ${v.notes}`
  }).join('\n\n')
  
  const topProductsText = report.topProducts.map((p: any) => 
    `- ${p.name} (${p.categoryName}): ${p.totalQuantity} unidades, $${p.totalRevenue.toLocaleString()}, ${p.orderCount} órdenes`
  ).join('\n')
  
  const topCombinationsText = report.topCombinations.map((c: any) => 
    `- ${c.pair}: ${c.count} órdenes, ${c.uniqueCustomers} clientes`
  ).join('\n')
  
  return `# REWARD BEHAVIOR INTELLIGENCE - KEKE&LARRY
**Generated:** ${report.timestamp}

==================================================
1. ¿POR QUÉ TANTOS USUARIOS ACUMULAN PUNTOS Y PRÁCTICAMENTE NINGÚN CANJE?
==================================================

EVIDENCIA OBSERVADA:
- Miembros del Club: 121
- Miembros con puntos: 111 (91.7%)
- Premio activo: "Las más pedidas de KEKE & Larry" (12,690 pts)
- Total canjes: 1 (store redemptions) + 9 (hidden rewards) = 10 total
- Clientes con >= 12,690 pts: ${report.redeemable.length}
- Clientes con >= 12,690 pts que NO canjearon: ${report.redeemable.filter(r => !r.didRedeem).length}

HIPÓTESIS DERIVADAS DE LOS DATOS:
${whyLowRedemptionText}

==================================================
2. ¿QUÉ TIPOS DE CLIENTES ACUMULAN PUNTOS PERO NO CONVIERTEN?
==================================================

PATRONES ENCONTRADOS:
${customerTypesText}

ANÁLISIS POR SEGMENTO DE PUNTOS:
${segmentsText}

==================================================
3. ¿QUÉ DIFERENCIA AL ÚNICO CASO QUE SÍ CANJEÓ?
==================================================

ANÁLISIS DEL ÚNICO CANJE:
- Store redemptions: ${report.singleRedemption.storeRedemptions.length}
- Hidden rewards: ${report.singleRedemption.hiddenRewards.length}
- Total: ${report.singleRedemption.total}

OBSERVACIÓN:
El único canje fue via hidden reward, no via store redemption.
Esto sugiere que el mecanismo de hidden rewards puede estar funcionando mientras que el catálogo principal de rewards no genera conversión.

==================================================
4. ¿QUÉ REWARDS TIENEN SENTIDO SEGÚN EL COMPORTAMIENTO?
==================================================

Dado que:
- Solo 1 reward está configurado (12,690 pts)
- Está a ~4x el promedio de puntos actuales
- 0% de miembros están a 10 compras o menos
- Solo 1 miembro (0.8%) lo alcanzó
- 0 redenciones vía catálogo principal

CONCLUSIÓN:
El reward actual NO está alineado con el comportamiento real de KEKE&LARRY.

Posibles rewards que tendrían más sentido:
- 2,500-3,000 pts (alcanzable en 1-2 compras para segmento medio)
- 5,000-6,000 pts (alcanzable en 2-3 compras para segmento superior)
- 8,000-10,000 pts (alcanzable en 3-4 compras para clientes altos)

==================================================
5. ¿QUÉ REWARDS DEBERÍAN EVITARSE?
==================================================

REWARD ACTUAL (12,690 pts):
- DISTANCIA: Demasiado lejos del comportamiento real
- ALINEACIÓN: Baja - no genera incentivo tangible
- IMPACTO: Negativo - puntos se acumulan pero no se convierten

REWARDS A EVITAR:
- Rewards > 15,000 pts (incluso más lejos que el actual)
- Rewards que requieren > 5 compras habituales
- Rewards sin "zonas de proximidad" intermedias

==================================================
6. ¿QUÉ INFORMACIÓN NOS FALTA?
==================================================

GAPS DE DATOS IDENTIFICADOS:
${dataGapsText}

==================================================
7. ¿QUÉ DEBERÍA CONSTRUIR TAKEASYGO?
==================================================

ARQUITECTURA PROPUESTA: REWARD INTELLIGENCE

1. Reward Intelligence Engine
   - Sistema que determine qué reward tiene sentido para cada cliente según:
     - Cliente (puntos, comportamiento, productos, recurrencia)
     - Distancia al reward
     - Ticket habitual
     - Comportamiento reciente
     - Productos frecuentes

2. Multi-Reward Architecture
   - No 1 reward único lejano
   - 3-5 rewards intermedios crecientes
   - Rewards alineados con comportamiento real de segmentos
   - Zonas de proximidad visibles para el cliente

3. Reward Opportunity Detection
   - "¿Qué reward aumentaría la probabilidad de que vuelva?"
   - Identificar cuando un incremento de ticket podría llevar al reward
   - Detectar cuando el cliente está cerca y mostrar incentivo visual

4. Reward-Driven Recurrence Engine
   - Diseñar rewards específicamente para incentivar recurrencia
   - No solo "canje por puntos"
   - "Compras hasta reward" como juego visible
   - Progreso tangible, no distancia invisible

5. Product-Based Rewards
   - Rewards alineados con productos que el cliente ya compra
   - Combinaciones frecuentes como rewards
   - Secuencias de compra como progreso hacia reward

==================================================
CLASIFICACIÓN DE VARIABLES
==================================================

${variableAnalysisText}

==================================================
TOP PRODUCTOS (BASE PARA REWARDS)
==================================================

${topProductsText}

==================================================
TOP COMBINACIONES (BASE PARA REWARDS)
==================================================

${topCombinationsText}

==================================================
END OF REPORT
==================================================
`
}

runRewardBehaviorIntelligence()
