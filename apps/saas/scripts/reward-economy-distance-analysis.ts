import mongoose from 'mongoose'
import * as fs from 'fs'
import * as path from 'path'

// ============================================================================
// REWARD ECONOMY & DISTANCE ANALYSIS - KEKE&LARRY
// Análisis de economía de recurrencia y distancia hacia rewards
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

// ============================================================================
// 1. EXTRACT REWARDS CONFIGURATION
// ============================================================================
async function extractRewards(tenantId: string) {
  const db = mongoose.connection.db!
  
  console.log('\n📊 1. EXTRAYENDO REWARDS CONFIGURADOS')
  
  const storeItems = await db.collection('storeitems')
    .find({
      $or: [{ tenantId: new mongoose.Types.ObjectId(tenantId) }, { targetTenants: tenantId }]
    })
    .toArray()
  
  const rewards = storeItems.map((r: any) => ({
    rewardId: r._id,
    name: r.name,
    description: r.description,
    pointsCost: r.pointsCost,
    cashValue: r.cashValue,
    isActive: r.isActive,
    stock: r.stock,
    maxPerMember: r.maxPerMember,
    tierRequirement: r.tierRequirement,
    linkedMenuItemIds: r.linkedMenuItemIds,
    minItemPurchases: r.minItemPurchases,
    category: r.category,
    tags: r.tags,
    sortOrder: r.sortOrder,
    isFeatured: r.isFeatured,
    totalRedemptions: r.totalRedemptions,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  }))
  
  console.log(`  ✅ ${rewards.length} rewards encontrados`)
  
  return rewards
}

// ============================================================================
// 2. CALCULATE POINTS PER TICKET
// ============================================================================
function calculatePointsPerTicket(ticketPesos: number, pointsPercentage: number = 5.75) {
  return Math.floor(ticketPesos * pointsPercentage / 100)
}

// ============================================================================
// 3. LOAD EXISTING DATASETS
// ============================================================================
function loadExistingDatasets() {
  console.log('\n📊 2. CARGANDO DATASETS EXISTENTES')
  
  const customerBase = JSON.parse(
    fs.readFileSync(path.join(OUTPUT_DIR, '28_reward_intelligence_customer_base.json'), 'utf-8')
  )
  
  const purchaseSequence = JSON.parse(
    fs.readFileSync(path.join(OUTPUT_DIR, '28_reward_intelligence_purchase_sequence.json'), 'utf-8')
  )
  
  const thresholdSimulation = JSON.parse(
    fs.readFileSync(path.join(OUTPUT_DIR, '28_reward_intelligence_threshold_simulation.json'), 'utf-8')
  )
  
  const recurrence = JSON.parse(
    fs.readFileSync(path.join(OUTPUT_DIR, '06_recurrence.json'), 'utf-8')
  )
  
  const clubData = JSON.parse(
    fs.readFileSync(path.join(OUTPUT_DIR, '02_club_data.json'), 'utf-8')
  )
  
  console.log(`  ✅ Customer base: ${customerBase.length} clientes`)
  console.log(`  ✅ Purchase sequence: ${purchaseSequence.length} compras`)
  console.log(`  ✅ Threshold simulation: ${thresholdSimulation.length} simulaciones`)
  console.log(`  ✅ Recurrence: ${recurrence.customerRecurrence.length} clientes`)
  console.log(`  ✅ Club data: ${clubData.members.length} miembros`)
  
  return { customerBase, purchaseSequence, thresholdSimulation, recurrence, clubData }
}

// ============================================================================
// 4. CALCULATE REWARD DISTANCE
// ============================================================================
function calculateRewardDistance(rewards: any[], customerBase: any[], purchaseSequence: any[]) {
  console.log('\n📊 3. CALCULANDO DISTANCIA A REWARDS')
  
  // Build ticket average per customer
  const customerTickets = purchaseSequence.reduce((acc, ps) => {
    if (!acc[ps.customer_id]) {
      acc[ps.customer_id] = []
    }
    acc[ps.customer_id].push(ps.order_total)
    return acc
  }, {} as Record<string, number[]>)
  
  const customerAvgTicket = Object.entries(customerTickets).reduce((acc, [customerId, tickets]) => {
    tickets.sort((a, b) => a - b)
    acc[customerId] = {
      avg: tickets.reduce((sum, t) => sum + t, 0) / tickets.length,
      median: tickets[Math.floor(tickets.length / 2)],
      count: tickets.length
    }
    return acc
  }, {} as Record<string, { avg: number; median: number; count: number }>)
  
  const rewardDistance = customerBase.map(customer => {
    const ticketInfo = customerAvgTicket[customer.customer_id] || { avg: 0, median: 0, count: 0 }
    const pointsPerPurchase = calculatePointsPerTicket(ticketInfo.avg)
    
    const rewardsWithDistance = rewards.map(reward => {
      const pointsRemaining = Math.max(0, reward.pointsCost - customer.points_current)
      const percentageCompleted = customer.points_current > 0 ? (customer.points_current / reward.pointsCost) * 100 : 0
      const purchasesRemaining = pointsPerPurchase > 0 ? Math.ceil(pointsRemaining / pointsPerPurchase) : null
      const spendRemaining = purchasesRemaining !== null ? purchasesRemaining * ticketInfo.avg : null
      
      return {
        rewardId: reward.rewardId,
        rewardName: reward.name,
        pointsCost: reward.pointsCost,
        pointsRemaining,
        percentageCompleted,
        purchasesRemaining,
        spendRemaining,
        isReachable: purchasesRemaining !== null && purchasesRemaining <= 10
      }
    }).sort((a, b) => a.pointsRemaining - b.pointsRemaining)
    
    return {
      customerId: customer.customer_id,
      pointsCurrent: customer.points_current,
      avgTicket: ticketInfo.avg,
      medianTicket: ticketInfo.median,
      ordersCount: ticketInfo.count,
      pointsPerPurchase,
      nearestReward: rewardsWithDistance[0] || null,
      secondNearestReward: rewardsWithDistance[1] || null,
      allRewards: rewardsWithDistance
    }
  })
  
  console.log(`  ✅ Distancia calculada para ${rewardDistance.length} clientes`)
  
  return rewardDistance
}

// ============================================================================
// 5. CLUB DISTRIBUTION
// ============================================================================
function calculateClubDistribution(customerBase: any[], rewards: any[]) {
  console.log('\n📊 4. CALCULANDO DISTRIBUCIÓN DEL CLUB')
  
  const points = customerBase.map(c => c.points_current).filter(p => p > 0)
  points.sort((a, b) => a - b)
  
  const distribution = {
    totalMembers: customerBase.length,
    membersWithZeroPoints: customerBase.filter(c => c.points_current === 0).length,
    membersWithPoints: points.length,
    pointsStats: {
      min: points[0] || 0,
      max: points[points.length - 1] || 0,
      mean: points.length > 0 ? points.reduce((sum, p) => sum + p, 0) / points.length : 0,
      median: points[Math.floor(points.length / 2)] || 0,
      p25: points[Math.floor(points.length * 0.25)] || 0,
      p50: points[Math.floor(points.length * 0.5)] || 0,
      p75: points[Math.floor(points.length * 0.75)] || 0,
      p90: points[Math.floor(points.length * 0.9)] || 0,
      p95: points[Math.floor(points.length * 0.95)] || 0
    }
  }
  
  // For each reward, calculate reachability
  const rewardReachability = rewards.map(reward => {
    const membersReached = customerBase.filter(c => c.points_current >= reward.pointsCost).length
    const membersWithin1Purchase = customerBase.filter(c => {
      const pointsPerPurchase = calculatePointsPerTicket(c.avg_ticket || 0)
      const pointsRemaining = reward.pointsCost - c.points_current
      return pointsRemaining > 0 && pointsRemaining <= pointsPerPurchase
    }).length
    const membersWithin2Purchases = customerBase.filter(c => {
      const pointsPerPurchase = calculatePointsPerTicket(c.avg_ticket || 0)
      const pointsRemaining = reward.pointsCost - c.points_current
      return pointsRemaining > 0 && pointsRemaining <= pointsPerPurchase * 2
    }).length
    const membersWithin3Purchases = customerBase.filter(c => {
      const pointsPerPurchase = calculatePointsPerTicket(c.avg_ticket || 0)
      const pointsRemaining = reward.pointsCost - c.points_current
      return pointsRemaining > 0 && pointsRemaining <= pointsPerPurchase * 3
    }).length
    
    return {
      rewardId: reward.rewardId,
      rewardName: reward.name,
      pointsCost: reward.pointsCost,
      membersReached,
      membersWithin1Purchase,
      membersWithin2Purchases,
      membersWithin3Purchases,
      membersWithin4Purchases: customerBase.filter(c => {
        const pointsPerPurchase = calculatePointsPerTicket(c.avg_ticket || 0)
        const pointsRemaining = reward.pointsCost - c.points_current
        return pointsRemaining > 0 && pointsRemaining <= pointsPerPurchase * 4
      }).length,
      membersWithin5Purchases: customerBase.filter(c => {
        const pointsPerPurchase = calculatePointsPerTicket(c.avg_ticket || 0)
        const pointsRemaining = reward.pointsCost - c.points_current
        return pointsRemaining > 0 && pointsRemaining <= pointsPerPurchase * 5
      }).length
    }
  })
  
  console.log(`  ✅ Distribución calculada`)
  console.log(`  - Total miembros: ${distribution.totalMembers}`)
  console.log(`  - Con puntos: ${distribution.membersWithPoints}`)
  console.log(`  - Sin puntos: ${distribution.membersWithZeroPoints}`)
  
  return { distribution, rewardReachability }
}

// ============================================================================
// 6. REWARD ECONOMY MATRIX
// ============================================================================
function calculateRewardEconomyMatrix(rewards: any[]) {
  console.log('\n📊 5. CALCULANDO MATRIZ DE ECONOMÍA DE REWARDS')
  
  const ticketLevels = [20000, 30000, 40000, 50000, 60000]
  
  const matrix = rewards.map(reward => {
    const row: any = {
      rewardId: reward.rewardId,
      rewardName: reward.name,
      pointsCost: reward.pointsCost
    }
    
    ticketLevels.forEach(ticket => {
      const pointsPerPurchase = calculatePointsPerTicket(ticket)
      const purchasesNeeded = Math.ceil(reward.pointsCost / pointsPerPurchase)
      row[`ticket_${ticket}`] = {
        pointsPerPurchase,
        purchasesNeeded,
        totalSpend: purchasesNeeded * ticket
      }
    })
    
    return row
  })
  
  console.log(`  ✅ Matriz calculada para ${matrix.length} rewards`)
  
  return matrix
}

// ============================================================================
// 7. CUSTOMER REWARD MATRIX
// ============================================================================
function calculateCustomerRewardMatrix(rewardDistance: any[], rewards: any[]) {
  console.log('\n📊 6. CALCULANDO MATRIZ CLIENTE-REWARD')
  
  const matrix = rewardDistance.map(customer => {
    const nearest = customer.nearestReward
    const secondNearest = customer.secondNearestReward
    
    return {
      customerId: customer.customerId,
      pointsCurrent: customer.pointsCurrent,
      avgTicket: customer.avgTicket,
      medianTicket: customer.medianTicket,
      ordersCount: customer.ordersCount,
      pointsPerPurchase: customer.pointsPerPurchase,
      nearestReward: nearest ? {
        rewardName: nearest.rewardName,
        pointsCost: nearest.pointsCost,
        pointsRemaining: nearest.pointsRemaining,
        percentageCompleted: nearest.percentageCompleted,
        purchasesRemaining: nearest.purchasesRemaining,
        spendRemaining: nearest.spendRemaining
      } : null,
      secondNearestReward: secondNearest ? {
        rewardName: secondNearest.rewardName,
        pointsCost: secondNearest.pointsCost,
        pointsRemaining: secondNearest.pointsRemaining,
        percentageCompleted: secondNearest.percentageCompleted,
        purchasesRemaining: secondNearest.purchasesRemaining,
        spendRemaining: secondNearest.spendRemaining
      } : null
    }
  })
  
  console.log(`  ✅ Matriz calculada para ${matrix.length} clientes`)
  
  return matrix
}

// ============================================================================
// 8. REWARD DISTANCE × BEHAVIOR ANALYSIS
// ============================================================================
function analyzeRewardDistanceBehavior(rewardDistance: any[], purchaseSequence: any[]) {
  console.log('\n📊 7. ANALIZANDO DISTANCIA × COMPORTAMIENTO')
  
  // Customers within 1 purchase of any reward
  const nearRewardCustomers = rewardDistance.filter(r => 
    r.nearestReward && r.nearestReward.purchasesRemaining === 1
  )
  
  console.log(`  ✅ ${nearRewardCustomers.length} clientes a 1 compra de un reward`)
  
  const behaviorAnalysis = nearRewardCustomers.map(customer => {
    const customerPurchases = purchaseSequence.filter(p => p.customer_id === customer.customerId)
    
    return {
      customerId: customer.customerId,
      pointsCurrent: customer.pointsCurrent,
      avgTicket: customer.avgTicket,
      ordersCount: customer.ordersCount,
      nearestReward: customer.nearestReward,
      lastPurchaseDate: customerPurchases.length > 0 ? customerPurchases[customerPurchases.length - 1].order_date : null,
      daysSinceLastPurchase: customerPurchases.length > 0 
        ? Math.floor((new Date().getTime() - new Date(customerPurchases[customerPurchases.length - 1].order_date).getTime()) / (1000 * 60 * 60 * 24))
        : null
    }
  })
  
  return behaviorAnalysis
}

// ============================================================================
// 9. GENERATE FINAL REPORT
// ============================================================================
async function generateRewardEconomyReport(
  rewards: any[],
  rewardDistance: any[],
  clubDistribution: any,
  rewardEconomyMatrix: any[],
  customerRewardMatrix: any[],
  behaviorAnalysis: any[]
) {
  console.log('\n📊 8. GENERANDO REPORTE FINAL')
  
  const report = {
    timestamp: new Date().toISOString(),
    tenantId: TENANT_ID,
    
    // Rewards configured
    rewards,
    
    // Club distribution
    clubDistribution,
    
    // Reward economy matrix
    rewardEconomyMatrix,
    
    // Customer reward matrix
    customerRewardMatrix,
    
    // Behavior analysis
    behaviorAnalysis,
    
    // Conclusions
    conclusions: {
      rewardsCount: rewards.length,
      totalMembers: clubDistribution.distribution.totalMembers,
      membersWithPoints: clubDistribution.distribution.membersWithPoints,
      membersWithZeroPoints: clubDistribution.distribution.membersWithZeroPoints,
      
      // Most reachable reward
      mostReachableReward: clubDistribution.rewardReachability.length > 0
        ? clubDistribution.rewardReachability.sort((a, b) => (a.membersWithin1Purchase + a.membersWithin2Purchases) - (b.membersWithin1Purchase + b.membersWithin2Purchases))[0]
        : null,
      
      // Least reachable reward
      leastReachableReward: clubDistribution.rewardReachability.length > 0
        ? clubDistribution.rewardReachability.sort((a, b) => (b.membersWithin1Purchase + b.membersWithin2Purchases) - (a.membersWithin1Purchase + a.membersWithin2Purchases))[0]
        : null,
      
      // Percentage near rewards
      percentageNearReward: clubDistribution.distribution.totalMembers > 0
        ? (behaviorAnalysis.length / clubDistribution.distribution.totalMembers) * 100
        : 0
    }
  }
  
  return report
}

// ============================================================================
// MAIN
// ============================================================================
async function runRewardEconomyAnalysis() {
  console.log('🔍 REWARD ECONOMY & DISTANCE ANALYSIS - KEKE&LARRY')
  console.log('='.repeat(70))
  
  try {
    await connect()
    
    // 1. Extract rewards
    const rewards = await extractRewards(TENANT_ID)
    
    // 2. Load existing datasets
    const { customerBase, purchaseSequence, thresholdSimulation, recurrence, clubData } = loadExistingDatasets()
    
    // 3. Calculate reward distance
    const rewardDistance = calculateRewardDistance(rewards, customerBase, purchaseSequence)
    
    // 4. Calculate club distribution
    const clubDistribution = calculateClubDistribution(customerBase, rewards)
    
    // 5. Calculate reward economy matrix
    const rewardEconomyMatrix = calculateRewardEconomyMatrix(rewards)
    
    // 6. Calculate customer reward matrix
    const customerRewardMatrix = calculateCustomerRewardMatrix(rewardDistance, rewards)
    
    // 7. Analyze reward distance × behavior
    const behaviorAnalysis = analyzeRewardDistanceBehavior(rewardDistance, purchaseSequence)
    
    // 8. Generate report
    const report = await generateRewardEconomyReport(
      rewards,
      rewardDistance,
      clubDistribution,
      rewardEconomyMatrix,
      customerRewardMatrix,
      behaviorAnalysis
    )
    
    // Save report
    const jsonPath = path.join(OUTPUT_DIR, 'reward_economy_distance_keke_larry.json')
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2))
    
    const mdPath = path.join(OUTPUT_DIR, 'REWARD_ECONOMY_DISTANCE_KEKE_LARRY.md')
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
  const rewardsLines = report.rewards.map((r: any) => 
    `- ${r.name}: ${r.pointsCost} pts (Estado: ${r.isActive ? 'Activo' : 'Inactivo'}, Redenciones: ${r.totalRedemptions || 0})`
  ).join('\n')
  
  const reachabilityLines = report.clubDistribution.rewardReachability.map((r: any) => {
    const total = report.clubDistribution.distribution.totalMembers
    return `${r.rewardName} (${r.pointsCost} pts)
  - Ya alcanzado: ${r.membersReached} miembros (${(r.membersReached / total * 100).toFixed(1)}%)
  - A 1 compra: ${r.membersWithin1Purchase} (${(r.membersWithin1Purchase / total * 100).toFixed(1)}%)
  - A 2 compras: ${r.membersWithin2Purchases} (${(r.membersWithin2Purchases / total * 100).toFixed(1)}%)
  - A 3 compras: ${r.membersWithin3Purchases} (${(r.membersWithin3Purchases / total * 100).toFixed(1)}%)`
  }).join('\n\n')
  
  const matrixLines = report.rewardEconomyMatrix.map((r: any) => {
    return `${r.rewardName} (${r.pointsCost} pts)
  - Ticket $20k: ${r.ticket_20000.purchasesNeeded} compras ($${r.ticket_20000.totalSpend.toLocaleString()})
  - Ticket $30k: ${r.ticket_30000.purchasesNeeded} compras ($${r.ticket_30000.totalSpend.toLocaleString()})
  - Ticket $40k: ${r.ticket_40000.purchasesNeeded} compras ($${r.ticket_40000.totalSpend.toLocaleString()})
  - Ticket $50k: ${r.ticket_50000.purchasesNeeded} compras ($${r.ticket_50000.totalSpend.toLocaleString()})
  - Ticket $60k: ${r.ticket_60000.purchasesNeeded} compras ($${r.ticket_60000.totalSpend.toLocaleString()})`
  }).join('\n\n')
  
  const nearRewardLines = report.behaviorAnalysis.length > 0 
    ? `Total: ${report.behaviorAnalysis.length} clientes\n` + 
      report.behaviorAnalysis.slice(0, 10).map((b: any) => 
        `- Cliente ${b.customerId}: ${b.pointsCurrent} pts, a 1 compra de "${b.nearestReward?.rewardName}" (${b.nearestReward?.pointsRemaining} pts faltantes)`
      ).join('\n')
    : 'No hay clientes a 1 compra de un reward'
  
  const mostReachable = report.conclusions.mostReachableReward
    ? `- ${report.conclusions.mostReachableReward.rewardName} (${report.conclusions.mostReachableReward.pointsCost} pts)
  - A 1 compra: ${report.conclusions.mostReachableReward.membersWithin1Purchase} miembros
  - A 2 compras: ${report.conclusions.mostReachableReward.membersWithin2Purchases} miembros`
    : 'N/A'
  
  const leastReachable = report.conclusions.leastReachableReward
    ? `- ${report.conclusions.leastReachableReward.rewardName} (${report.conclusions.leastReachableReward.pointsCost} pts)
  - A 1 compra: ${report.conclusions.leastReachableReward.membersWithin1Purchase} miembros
  - A 2 compras: ${report.conclusions.leastReachableReward.membersWithin2Purchases} miembros`
    : 'N/A'
  
  return `# REWARD ECONOMY & DISTANCE ANALYSIS - KEKE&LARRY
**Generated:** ${report.timestamp}

==================================================
REWARDS CONFIGURADOS
==================================================

${rewardsLines}

==================================================
DISTRIBUCIÓN DEL CLUB
==================================================

- Total miembros: ${report.clubDistribution.distribution.totalMembers}
- Con puntos: ${report.clubDistribution.distribution.membersWithPoints} (${(report.clubDistribution.distribution.membersWithPoints / report.clubDistribution.distribution.totalMembers * 100).toFixed(1)}%)
- Sin puntos: ${report.clubDistribution.distribution.membersWithZeroPoints} (${(report.clubDistribution.distribution.membersWithZeroPoints / report.clubDistribution.distribution.totalMembers * 100).toFixed(1)}%)

Estadísticas de puntos:
- Minimo: ${report.clubDistribution.distribution.pointsStats.min}
- Maximo: ${report.clubDistribution.distribution.pointsStats.max}
- Promedio: ${report.clubDistribution.distribution.pointsStats.mean.toFixed(0)}
- Mediana: ${report.clubDistribution.distribution.pointsStats.median}
- P25: ${report.clubDistribution.distribution.pointsStats.p25}
- P50: ${report.clubDistribution.distribution.pointsStats.p50}
- P75: ${report.clubDistribution.distribution.pointsStats.p75}
- P90: ${report.clubDistribution.distribution.pointsStats.p90}
- P95: ${report.clubDistribution.distribution.pointsStats.p95}

==================================================
ALCANZABILIDAD DE REWARDS
==================================================

${reachabilityLines}

==================================================
MATRIZ DE ECONOMÍA DE REWARDS
==================================================

${matrixLines}

==================================================
CLIENTES CERCANOS A REWARDS (A 1 COMPRA)
==================================================

${nearRewardLines}

==================================================
CONCLUSIONES
==================================================

Rewards configurados: ${report.conclusions.rewardsCount}
Total miembros: ${report.conclusions.totalMembers}
Miembros con puntos: ${report.conclusions.membersWithPoints} (${(report.conclusions.membersWithPoints / report.conclusions.totalMembers * 100).toFixed(1)}%)
Miembros sin puntos: ${report.conclusions.membersWithZeroPoints} (${(report.conclusions.membersWithZeroPoints / report.conclusions.totalMembers * 100).toFixed(1)}%)

Reward mas alcanzable:
${mostReachable}

Reward menos alcanzable:
${leastReachable}

Porcentaje cerca de un reward: ${report.conclusions.percentageNearReward.toFixed(1)}%

==================================================
CLASIFICACION DE METRICAS
==================================================

OBSERVADO:
- Puntos actuales de miembros
- Rewards configurados
- Redenciones historicas
- Tickets historicos
- Ordenes

CALCULADO:
- Puntos estimados por ticket
- Distancia a rewards
- Compras restantes
- Gasto necesario
- Distribucion de puntos

INFERENCIA:
- Potencial de incentivo
- Rewards posiblemente demasiado lejanos/cercanos
- Oportunidades de upselling (requiere analisis adicional)

==================================================
END OF REPORT
==================================================
`
}

runRewardEconomyAnalysis()
