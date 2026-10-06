import mongoose from 'mongoose'
import * as fs from 'fs'
import * as path from 'path'

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

async function analyzeDistanceDistribution() {
  console.log('\n🔍 ANÁLISIS ADICIONAL DE DISTRIBUCIÓN DE DISTANCIA')
  console.log('='.repeat(70))
  
  await connect()
  
  const db = mongoose.connection.db!
  
  const members = await db.collection('loyaltymembers')
    .find({ tenantId: new mongoose.Types.ObjectId(TENANT_ID) })
    .toArray()
  
  const purchaseSequence = JSON.parse(
    fs.readFileSync(path.join(OUTPUT_DIR, '28_reward_intelligence_purchase_sequence.json'), 'utf-8')
  )
  
  const rewardPoints = 12690 // "Las más pedidas de KEKE & Larry"
  
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
  
  const distanceAnalysis = members.map(member => {
    const pointsCurrent = member.loyalty?.points || 0
    const phoneHash = member.phoneHash
    const ticketInfo = customerAvgTicket[phoneHash] || { avg: 0, median: 0, count: 0 }
    const pointsPerPurchase = Math.floor(ticketInfo.avg * 0.0575)
    
    const pointsRemaining = Math.max(0, rewardPoints - pointsCurrent)
    const percentageCompleted = pointsCurrent > 0 ? (pointsCurrent / rewardPoints) * 100 : 0
    const purchasesRemaining = pointsPerPurchase > 0 ? Math.ceil(pointsRemaining / pointsPerPurchase) : null
    const spendRemaining = purchasesRemaining !== null ? purchasesRemaining * ticketInfo.avg : null
    
    return {
      memberId: member._id,
      customerId: phoneHash,
      pointsCurrent,
      pointsRemaining,
      percentageCompleted,
      purchasesRemaining,
      spendRemaining,
      avgTicket: ticketInfo.avg,
      ordersCount: ticketInfo.count
    }
  })
  
  // Group by distance buckets
  const distanceBuckets = {
    '0-25%': distanceAnalysis.filter(d => d.percentageCompleted < 25).length,
    '25-50%': distanceAnalysis.filter(d => d.percentageCompleted >= 25 && d.percentageCompleted < 50).length,
    '50-75%': distanceAnalysis.filter(d => d.percentageCompleted >= 50 && d.percentageCompleted < 75).length,
    '75-100%': distanceAnalysis.filter(d => d.percentageCompleted >= 75 && d.percentageCompleted < 100).length,
    '100%+': distanceAnalysis.filter(d => d.percentageCompleted >= 100).length
  }
  
  // Group by purchases remaining
  const purchasesBuckets = {
    '0 compras': distanceAnalysis.filter(d => d.purchasesRemaining === 0).length,
    '1-2 compras': distanceAnalysis.filter(d => d.purchasesRemaining >= 1 && d.purchasesRemaining <= 2).length,
    '3-5 compras': distanceAnalysis.filter(d => d.purchasesRemaining >= 3 && d.purchasesRemaining <= 5).length,
    '6-10 compras': distanceAnalysis.filter(d => d.purchasesRemaining >= 6 && d.purchasesRemaining <= 10).length,
    '11+ compras': distanceAnalysis.filter(d => d.purchasesRemaining > 10).length
  }
  
  const report = {
    timestamp: new Date().toISOString(),
    rewardPoints,
    distanceAnalysis,
    distanceBuckets,
    purchasesBuckets,
    insights: {
      averagePoints: distanceAnalysis.reduce((sum, d) => sum + d.pointsCurrent, 0) / distanceAnalysis.length,
      medianPoints: distanceAnalysis.sort((a, b) => a.pointsCurrent - b.pointsCurrent)[Math.floor(distanceAnalysis.length / 2)].pointsCurrent,
      avgPurchasesRemaining: distanceAnalysis.filter(d => d.purchasesRemaining !== null).reduce((sum, d) => sum + d.purchasesRemaining, 0) / distanceAnalysis.filter(d => d.purchasesRemaining !== null).length,
      membersWithin3Purchases: distanceAnalysis.filter(d => d.purchasesRemaining !== null && d.purchasesRemaining <= 3).length,
      membersWithin5Purchases: distanceAnalysis.filter(d => d.purchasesRemaining !== null && d.purchasesRemaining <= 5).length,
      membersWithin10Purchases: distanceAnalysis.filter(d => d.purchasesRemaining !== null && d.purchasesRemaining <= 10).length
    }
  }
  
  const outputPath = path.join(OUTPUT_DIR, 'reward_distance_distribution.json')
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2))
  
  console.log('\n📊 DISTRIBUCIÓN DE DISTANCIA')
  console.log(`  Porcentaje completado:`)
  Object.entries(distanceBuckets).forEach(([bucket, count]) => {
    console.log(`    ${bucket}: ${count} miembros (${(count / members.length * 100).toFixed(1)}%)`)
  })
  
  console.log(`\n  Compras restantes:`)
  Object.entries(purchasesBuckets).forEach(([bucket, count]) => {
    console.log(`    ${bucket}: ${count} miembros (${(count / members.length * 100).toFixed(1)}%)`)
  })
  
  console.log(`\n  Insights:`)
  console.log(`    Promedio puntos: ${report.insights.averagePoints.toFixed(0)}`)
  console.log(`    Mediana puntos: ${report.insights.medianPoints}`)
  console.log(`    Promedio compras restantes: ${report.insights.avgPurchasesRemaining.toFixed(1)}`)
  console.log(`    A 3 compras: ${report.insights.membersWithin3Purchases} (${(report.insights.membersWithin3Purchases / members.length * 100).toFixed(1)}%)`)
  console.log(`    A 5 compras: ${report.insights.membersWithin5Purchases} (${(report.insights.membersWithin5Purchases / members.length * 100).toFixed(1)}%)`)
  console.log(`    A 10 compras: ${report.insights.membersWithin10Purchases} (${(report.insights.membersWithin10Purchases / members.length * 100).toFixed(1)}%)`)
  
  console.log(`\n✅ Reporte guardado en: ${outputPath}`)
  
  await disconnect()
}

analyzeDistanceDistribution().catch(console.error)
