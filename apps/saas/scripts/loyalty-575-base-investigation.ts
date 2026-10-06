import mongoose from 'mongoose'
import * as fs from 'fs'
import * as path from 'path'

// ============================================================================
// INVESTIGACIÓN DE BASE MONETARIA - KEKE&LARRY
// Determinar qué base usa la UI para calcular puntos
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

async function investigateBase() {
  console.log('\n🔍 INVESTIGACIÓN DE BASE MONETARIA - KEKE&LARRY')
  console.log('='.repeat(70))
  
  await connect()
  
  const db = mongoose.connection.db!
  
  // Get tenant config
  const tenant = await db.collection('tenants').findOne(
    { _id: new mongoose.Types.ObjectId(TENANT_ID) },
    { projection: { pointsConfig: 1 } }
  )
  
  // UI examples
  const uiExamples = [
    { total: 49958.75, points: 2817 },
    { total: 44159.40, points: 2371 },
    { total: 58879.20, points: 3320 },
    { total: 21285, points: 1193 },
    { total: 150352.23, points: 8150 }
  ]
  
  console.log('\n📊 CALCULANDO BASE MONETARIA DESDE PUNTOS UI')
  
  const baseInvestigation = uiExamples.map(ex => {
    // Reverse calculate: what base would give these points at 5.75%?
    const baseAt575 = ex.points / 0.0575
    
    // Reverse calculate: what base would give these points at 5.64% (actual UI %)?
    const actualPercentage = (ex.points / ex.total) * 100
    const baseAtActual = ex.points / (actualPercentage / 100)
    
    return {
      total: ex.total,
      uiPoints: ex.points,
      actualPercentage: actualPercentage.toFixed(2),
      baseAt575: baseAt575,
      baseAtActual: baseAtActual,
      differenceFromTotal: ex.total - baseAt575,
      // If base is saleItems (excluding delivery), delivery would be:
      estimatedDelivery: ex.total - baseAt575
    }
  })
  
  console.log('\nResultados:')
  baseInvestigation.forEach(b => {
    console.log(`\n$${b.total.toFixed(2)} → ${b.uiPoints} pts (${b.actualPercentage}%)`)
    console.log(`  Base calculada a 5.75%: $${b.baseAt575.toFixed(2)}`)
    console.log(`  Diferencia del total: $${b.differenceFromTotal.toFixed(2)}`)
    console.log(`  Delivery estimado: $${b.estimatedDelivery.toFixed(2)}`)
  })
  
  // Now find actual orders and check their structure
  console.log('\n📊 BUSCANDO ÓRDENES CON ESTOS TOTALES')
  
  const orders = await db.collection('orders')
    .find({
      tenantId: new mongoose.Types.ObjectId(TENANT_ID),
      status: { $nin: ['cancelled'] }
    })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray()
  
  const orderStructures = orders.map((o: any) => {
    const total = o.total / 100
    const subtotal = o.subtotal / 100
    const discount = o.discountAmount / 100
    const loyaltyDiscount = o.loyaltyDiscountAmount / 100
    const delivery = o.deliveryCost / 100
    const platformFee = o.platformFeeAmount / 100
    const surcharge = o.surchargeAmount / 100
    
    const saleItemsTotal = o.items
      ?.filter((i: any) => i.itemType !== 'reward')
      ?.reduce((sum: number, i: any) => sum + (i.subtotal || 0), 0) / 100 || 0
    
    return {
      orderNumber: o.orderNumber,
      total,
      subtotal,
      discount,
      loyaltyDiscount,
      delivery,
      platformFee,
      surcharge,
      saleItemsTotal,
      totalMinusDelivery: total - delivery,
      totalMinusAllFees: total - delivery - platformFee - surcharge,
      createdAt: o.createdAt
    }
  })
  
  // Find orders that match UI examples
  const matchingOrders = orderStructures.filter(o => 
    uiExamples.some(ex => Math.abs(o.total - ex.total) < 500)
  )
  
  console.log(`\nFound ${matchingOrders.length} orders matching UI totals`)
  
  const analysis = {
    timestamp: new Date().toISOString(),
    baseInvestigation,
    orderStructures: matchingOrders.slice(0, 10),
    findings: {
      consistentDelivery: baseInvestigation.every(b => b.estimatedDelivery > 0),
      estimatedDeliveryAvg: baseInvestigation.reduce((sum, b) => sum + b.estimatedDelivery, 0) / baseInvestigation.length,
      hypothesis: 'UI is calculating points on saleItemsTotal (excluding delivery), not on total'
    }
  }
  
  const outputPath = path.join(OUTPUT_DIR, 'LOYALTY_575_BASE_INVESTIGATION.json')
  fs.writeFileSync(outputPath, JSON.stringify(analysis, null, 2))
  
  console.log(`\n✅ Reporte guardado en: ${outputPath}`)
  
  await disconnect()
}

investigateBase().catch(console.error)
