import mongoose from 'mongoose'
import * as fs from 'fs'
import * as path from 'path'

// ============================================================================
// VERIFICACIÓN FINAL - UI MUESTRA SALDO VS PUNTOS DE ORDEN
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

async function finalVerification() {
  console.log('\n🔍 VERIFICACIÓN FINAL - KEKE&LARRY')
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
  
  console.log('\n📊 OBTENIENDO ÓRDENES ESPECÍFICAS Y SUS CLIENTES')
  
  const orders = await db.collection('orders')
    .find({
      tenantId: new mongoose.Types.ObjectId(TENANT_ID),
      status: { $nin: ['cancelled'] }
    })
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray()
  
  // Find orders matching UI examples
  const matchingOrders = orders.filter((o: any) => {
    const total = o.total / 100
    return uiExamples.some(ex => Math.abs(total - ex.total) < 100)
  })
  
  console.log(`Found ${matchingOrders.length} matching orders`)
  
  const verification = matchingOrders.map((o: any) => {
    const total = o.total / 100
    const subtotal = o.subtotal / 100
    const delivery = o.deliveryCost / 100
    const saleItemsTotal = o.items
      ?.filter((i: any) => i.itemType !== 'reward')
      ?.reduce((sum: number, i: any) => sum + (i.subtotal || 0), 0) / 100 || 0
    
    // Calculate points on different bases
    const pointsOnTotal = calculatePointsBreakdownFromCode(o.total, tenant?.pointsConfig)
    const pointsOnSaleItems = calculatePointsBreakdownFromCode(saleItemsTotal * 100, tenant?.pointsConfig)
    const pointsOnSubtotal = calculatePointsBreakdownFromCode(subtotal * 100, tenant?.pointsConfig)
    
    // Find UI example for this order
    const uiExample = uiExamples.find(ex => Math.abs(total - ex.total) < 100)
    
    // Get member points balance
    const member = db.collection('loyaltymembers').findOne({
      tenantId: new mongoose.Types.ObjectId(TENANT_ID),
      phoneHash: o.customer.phoneHash
    })
    
    return {
      orderNumber: o.orderNumber,
      customerPhoneHash: o.customer.phoneHash,
      total,
      subtotal,
      delivery,
      saleItemsTotal,
      uiPoints: uiExample?.points || null,
      pointsOnTotal: pointsOnTotal.total,
      pointsOnSaleItems: pointsOnSaleItems.total,
      pointsOnSubtotal: pointsOnSubtotal.total,
      memberPoints: member ? member.loyalty?.points : null
    }
  })
  
  console.log('\n📊 RESULTADOS DE VERIFICACIÓN')
  verification.forEach(v => {
    console.log(`\nOrden: ${v.orderNumber}`)
    console.log(`  Total: $${v.total.toFixed(2)}`)
    console.log(`  Subtotal: $${v.subtotal.toFixed(2)}`)
    console.log(`  Delivery: $${v.delivery.toFixed(2)}`)
    console.log(`  SaleItems: $${v.saleItemsTotal.toFixed(2)}`)
    console.log(`  UI Points: ${v.uiPoints}`)
    console.log(`  Points on Total: ${v.pointsOnTotal}`)
    console.log(`  Points on SaleItems: ${v.pointsOnSaleItems}`)
    console.log(`  Points on Subtotal: ${v.pointsOnSubtotal}`)
    console.log(`  Member Balance: ${v.memberPoints}`)
    
    if (v.uiPoints === v.memberPoints) {
      console.log(`  ✅ UI MATCHES MEMBER BALANCE`)
    }
    if (v.uiPoints === v.pointsOnTotal) {
      console.log(`  ✅ UI MATCHES POINTS ON TOTAL`)
    }
    if (v.uiPoints === v.pointsOnSaleItems) {
      console.log(`  ✅ UI MATCHES POINTS ON SALEITEMS`)
    }
  })
  
  const report = {
    timestamp: new Date().toISOString(),
    verification,
    conclusion: verification.every(v => v.uiPoints === v.memberPoints) 
      ? 'UI is showing member total balance, not order-specific points'
      : 'UI is not showing member balance'
  }
  
  const outputPath = path.join(OUTPUT_DIR, 'LOYALTY_575_FINAL_VERIFICATION.json')
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2))
  
  console.log(`\n✅ Reporte guardado en: ${outputPath}`)
  
  await disconnect()
}

finalVerification().catch(console.error)
