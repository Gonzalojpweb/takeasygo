import mongoose from 'mongoose'
import * as fs from 'fs'
import * as path from 'path'

// ============================================================================
// ANÁLISIS DE DISCREPANCIA UI - KEKE&LARRY
// Investigar por qué los ejemplos de UI no coinciden con el cálculo
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

function calculatePointsBreakdownFromCode(orderTotalCents: number, pointsConfig: any) {
  if (!pointsConfig) {
    pointsConfig = {
      enabled: true,
      mode: 'fixed_per_currency',
      pointsPerCurrency: 0.1,
      pointsPercentage: 10,
      pointsPerOrder: 0,
      minOrderForPoints: 0,
    }
  }
  
  const isEnabled = pointsConfig?.enabled === true || pointsConfig?.enabled === 'true'
  if (!isEnabled) return { basePoints: 0, microBonus: 0, total: 0 }
  
  const orderTotalPesos = orderTotalCents / 100
  
  if (orderTotalPesos < (pointsConfig.minOrderForPoints || 0)) {
    return { basePoints: 0, microBonus: 0, total: 0 }
  }
  
  const mode = pointsConfig.mode || 'fixed_per_currency'
  const pointsPerCurrency = pointsConfig.pointsPerCurrency ?? 0.1
  const pointsPercentage = pointsConfig.pointsPercentage ?? 10
  
  let rawBase = 0
  if (mode === 'fixed_per_currency') {
    rawBase = orderTotalPesos * pointsPerCurrency
  } else if (mode === 'percentage') {
    rawBase = orderTotalPesos * pointsPercentage / 100
  } else if (mode === 'hybrid') {
    rawBase = (orderTotalPesos * pointsPerCurrency) + (orderTotalPesos * pointsPercentage / 100)
  }
  
  const basePoints = Math.floor(rawBase)
  const fractionalRemainder = rawBase - basePoints
  
  const microBonusRaw = fractionalRemainder * 0.0575
  const microBonus = Math.max(1, Math.round(microBonusRaw * 100)) > 50 ? Math.ceil(fractionalRemainder) : Math.floor(fractionalRemainder)
  const microBonusFinal = microBonus > 0 ? microBonus : (fractionalRemainder >= 0.5 ? 1 : 0)
  
  const fixedPoints = pointsConfig.pointsPerOrder || 0
  const total = basePoints + microBonusFinal + fixedPoints
  
  return {
    basePoints,
    microBonus: microBonusFinal,
    total: Math.max(0, total)
  }
}

async function analyzeUIDiscrepancy() {
  console.log('\n🔍 ANÁLISIS DE DISCREPANCIA UI - KEKE&LARRY')
  console.log('='.repeat(70))
  
  await connect()
  
  const db = mongoose.connection.db!
  
  // Get tenant config
  const tenant = await db.collection('tenants').findOne(
    { _id: new mongoose.Types.ObjectId(TENANT_ID) },
    { projection: { pointsConfig: 1 } }
  )
  
  console.log('\nConfig:', JSON.stringify(tenant?.pointsConfig, null, 2))
  
  // The UI examples from the prompt
  const uiExamples = [
    { total: 49958.75, points: 2817 },
    { total: 44159.40, points: 2371 },
    { total: 58879.20, points: 3320 },
    { total: 21285, points: 1193 },
    { total: 150352.23, points: 8150 }
  ]
  
  console.log('\n📊 ANALIZANDO EJEMPLOS DE UI')
  
  const analysis = uiExamples.map(ex => {
    const totalCents = Math.round(ex.total * 100)
    const calculation = calculatePointsBreakdownFromCode(totalCents, tenant?.pointsConfig)
    const simple575 = Math.floor(ex.total * 5.75 / 100)
    const exact575 = ex.total * 5.75 / 100
    
    const actualPercentage = calculation.total > 0 ? (calculation.total / ex.total) * 100 : 0
    const uiPercentage = ex.points > 0 ? (ex.points / ex.total) * 100 : 0
    
    return {
      total: ex.total,
      totalCents,
      uiPoints: ex.points,
      calculatedPoints: calculation.total,
      expectedSimple: simple575,
      expectedExact: exact575,
      breakdown: calculation,
      uiPercentage,
      calculatedPercentage: actualPercentage,
      differenceFromUI: calculation.total - ex.points,
      differenceFromExpected: calculation.total - simple575,
      differenceFromExpectedExact: calculation.total - exact575
    }
  })
  
  console.log('\nResultados:')
  analysis.forEach(a => {
    console.log(`\n$${a.total.toFixed(2)}`)
    console.log(`  UI: ${a.uiPoints} pts (${a.uiPercentage.toFixed(2)}%)`)
    console.log(`  Calculado: ${a.calculatedPoints} pts (${a.calculatedPercentage.toFixed(2)}%)`)
    console.log(`  Esperado (5.75%): ${a.expectedSimple} pts`)
    console.log(`  Diferencia UI vs Calculado: ${a.differenceFromUI}`)
    console.log(`  Diferencia UI vs Esperado: ${a.uiPoints - a.expectedSimple}`)
  })
  
  // Now check if UI might be showing total balance instead of order points
  console.log('\n📊 VERIFICANDO SI UI MUESTRA SALDO TOTAL VS PUNTOS DE ORDEN')
  
  // Find orders with similar totals
  const orders = await db.collection('orders')
    .find({
      tenantId: new mongoose.Types.ObjectId(TENANT_ID),
      status: { $nin: ['cancelled'] }
    })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray()
  
  const similarOrders = orders.filter((o: any) => {
    const total = o.total / 100
    return uiExamples.some(ex => Math.abs(total - ex.total) < 1000)
  })
  
  console.log(`\nFound ${similarOrders.length} orders with similar totals to UI examples`)
  
  const orderAnalysis = similarOrders.map((o: any) => {
    const total = o.total / 100
    const saleItemsTotal = o.items
      ?.filter((i: any) => i.itemType !== 'reward')
      ?.reduce((sum: number, i: any) => sum + (i.subtotal || 0), 0) / 100 || 0
    
    const calculation = calculatePointsBreakdownFromCode(o.total, tenant?.pointsConfig)
    
    return {
      orderNumber: o.orderNumber,
      total,
      saleItemsTotal,
      deliveryCost: o.deliveryCost / 100,
      calculatedPoints: calculation.total,
      createdAt: o.createdAt
    }
  })
  
  // Save analysis
  const report = {
    timestamp: new Date().toISOString(),
    tenantConfig: tenant?.pointsConfig,
    uiExamplesAnalysis: analysis,
    similarOrders: orderAnalysis,
    findings: {
      uiShowsTotalBalance: analysis.every(a => a.uiPoints > a.calculatedPoints),
      uiShowsOrderPoints: analysis.every(a => a.uiPoints === a.calculatedPoints),
      uiShowsDifferentCalculation: analysis.some(a => a.uiPoints !== a.calculatedPoints),
      possibleExplanation: 'UI may be showing customer total balance, not order-specific points'
    }
  }
  
  const outputPath = path.join(OUTPUT_DIR, 'LOYALTY_575_UI_DISCREPANCY_ANALYSIS.json')
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2))
  
  console.log(`\n✅ Reporte guardado en: ${outputPath}`)
  
  await disconnect()
}

analyzeUIDiscrepancy().catch(console.error)
