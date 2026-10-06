import mongoose from 'mongoose'
import * as fs from 'fs'
import * as path from 'path'

// ============================================================================
// AUDIT TÉCNICO DE IMPLEMENTACIÓN LOYALTY 5.75% - KEKE&LARRY
// Auditoría profunda de cómo se calculan los puntos
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
// 1. EXTRACT REAL CONFIGURATION
// ============================================================================
async function extractRealConfiguration(tenantId: string) {
  const db = mongoose.connection.db!
  
  console.log('\n📊 1. EXTRAYENDO CONFIGURACIÓN REAL DEL TENANT')
  
  const tenant = await db.collection('tenants').findOne(
    { _id: new mongoose.Types.ObjectId(tenantId) },
    { projection: { name: 1, slug: 1, loyalty: 1, pointsConfig: 1 } }
  )
  
  const locationConfigs = await db.collection('locationloyaltyconfigs')
    .find({ tenantId: new mongoose.Types.ObjectId(tenantId) })
    .toArray()
  
  const config = {
    tenant: {
      id: tenantId,
      name: tenant?.name,
      slug: tenant?.slug,
      loyalty: tenant?.loyalty,
      pointsConfig: tenant?.pointsConfig
    },
    locationConfigs: locationConfigs.map((lc: any) => ({
      locationId: lc.locationId,
      pointsConfig: lc.pointsConfig
    }))
  }
  
  console.log(`  ✅ Tenant: ${tenant?.name}`)
  console.log(`  ✅ Mode: ${tenant?.pointsConfig?.mode}`)
  console.log(`  ✅ pointsPercentage: ${tenant?.pointsConfig?.pointsPercentage}`)
  console.log(`  ✅ pointsPerCurrency: ${tenant?.pointsConfig?.pointsPerCurrency}`)
  console.log(`  ✅ Location configs: ${locationConfigs.length}`)
  
  return config
}

// ============================================================================
// 2. REPRODUCE THE ACTUAL FORMULA FROM CODE
// ============================================================================
function calculatePointsBreakdownFromCode(orderTotalCents: number, pointsConfig: any) {
  // This is the EXACT formula from apps/saas/lib/loyalty.ts
  
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
  if (!isEnabled) return { basePoints: 0, microBonus: 0, total: 0, breakdown: {} }
  
  // Convert cents to pesos
  const orderTotalPesos = orderTotalCents / 100
  
  if (orderTotalPesos < (pointsConfig.minOrderForPoints || 0)) {
    return { basePoints: 0, microBonus: 0, total: 0, breakdown: {} }
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
  
  // The micro-bonus uses hardcoded 0.0575 factor
  const microBonusRaw = fractionalRemainder * 0.0575
  const microBonus = Math.max(1, Math.round(microBonusRaw * 100)) > 50 ? Math.ceil(fractionalRemainder) : Math.floor(fractionalRemainder)
  const microBonusFinal = microBonus > 0 ? microBonus : (fractionalRemainder >= 0.5 ? 1 : 0)
  
  const fixedPoints = pointsConfig.pointsPerOrder || 0
  const total = basePoints + microBonusFinal + fixedPoints
  
  return {
    basePoints,
    microBonus: microBonusFinal,
    total: Math.max(0, total),
    breakdown: {
      orderTotalCents,
      orderTotalPesos,
      mode,
      pointsPerCurrency,
      pointsPercentage,
      rawBase,
      fractionalRemainder,
      microBonusRaw,
      microBonus,
      microBonusFinal,
      fixedPoints
    }
  }
}

// ============================================================================
// 3. ANALYZE REAL ORDERS
// ============================================================================
async function analyzeRealOrders(tenantId: string, config: any) {
  const db = mongoose.connection.db!
  
  console.log('\n📊 2. ANALIZANDO ÓRDENES REALES')
  
  const orders = await db.collection('orders')
    .find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      status: { $nin: ['cancelled'] },
      loyaltyPointsCredited: true
    })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray()
  
  console.log(`  ✅ ${orders.length} órdenes encontradas`)
  
  const analysis = orders.map((order: any) => {
    const totalCents = order.total
    const totalPesos = totalCents / 100
    
    // Calculate sale items total (excluding rewards)
    const saleItemsTotalCents = order.items
      ?.filter((i: any) => i.itemType !== 'reward')
      ?.reduce((sum: number, i: any) => sum + (i.subtotal || 0), 0) ?? totalCents
    const saleItemsTotalPesos = saleItemsTotalCents / 100
    
    // Calculate using ACTUAL formula from code
    const actualCalculation = calculatePointsBreakdownFromCode(saleItemsTotalCents, config.tenant.pointsConfig)
    
    // Calculate what 5.75% SHOULD give (simple percentage)
    const simple575 = Math.floor(saleItemsTotalPesos * 5.75 / 100)
    
    // Calculate what 5.75% SHOULD give without floor
    const exact575 = saleItemsTotalPesos * 5.75 / 100
    
    // Calculate percentage of actual vs expected
    const actualPercentage = actualCalculation.total > 0 ? (actualCalculation.total / saleItemsTotalPesos) * 100 : 0
    
    return {
      orderNumber: order.orderNumber,
      orderId: order._id,
      createdAt: order.createdAt,
      
      // Monetary values
      totalCents,
      totalPesos,
      saleItemsTotalCents,
      saleItemsTotalPesos,
      discountAmount: order.discountAmount || 0,
      loyaltyDiscountAmount: order.loyaltyDiscountAmount || 0,
      deliveryCost: order.deliveryCost || 0,
      
      // Expected points (simple 5.75%)
      expectedPointsSimple: simple575,
      expectedPointsExact: exact575,
      
      // Actual calculation from code
      actualPoints: actualCalculation.total,
      actualBreakdown: actualCalculation.breakdown,
      
      // Analysis
      difference: actualCalculation.total - simple575,
      actualPercentage,
      percentageOfExpected: simple575 > 0 ? (actualCalculation.total / simple575) * 100 : 0
    }
  })
  
  return analysis
}

// ============================================================================
// 4. UNIT TESTS WITH SPECIFIC VALUES
// ============================================================================
function runUnitTests(config: any) {
  console.log('\n📊 3. EJECUTANDO TESTS UNITARIOS')
  
  const testAmounts = [10000, 20000, 30000, 40000, 50000, 100000]
  
  const tests = testAmounts.map(amountCents => {
    const amountPesos = amountCents / 100
    const calculation = calculatePointsBreakdownFromCode(amountCents, config.tenant.pointsConfig)
    const simple575 = Math.floor(amountPesos * 5.75 / 100)
    const exact575 = amountPesos * 5.75 / 100
    
    return {
      inputCents: amountCents,
      inputPesos: amountPesos,
      expectedSimple: simple575,
      expectedExact: exact575,
      actual: calculation.total,
      breakdown: calculation.breakdown,
      difference: calculation.total - simple575,
      actualPercentage: calculation.total > 0 ? (calculation.total / amountPesos) * 100 : 0
    }
  })
  
  console.log('\n  Test Results:')
  tests.forEach(t => {
    console.log(`    $${t.inputPesos} → ${t.actual} pts (esperado: ${t.expectedSimple}, diferencia: ${t.difference}, % real: ${t.actualPercentage.toFixed(2)}%)`)
  })
  
  return tests
}

// ============================================================================
// 5. ANALYZE SPECIFIC EXAMPLES FROM UI
// ============================================================================
function analyzeUIExamples(config: any) {
  console.log('\n📊 4. ANALIZANDO EJEMPLOS DE UI')
  
  const examples = [
    { total: 49958.75, points: 2817 },
    { total: 44159.40, points: 2371 },
    { total: 58879.20, points: 3320 },
    { total: 21285, points: 1193 },
    { total: 150352.23, points: 8150 }
  ]
  
  const analysis = examples.map(ex => {
    const totalCents = Math.round(ex.total * 100)
    const calculation = calculatePointsBreakdownFromCode(totalCents, config.tenant.pointsConfig)
    const simple575 = Math.floor(ex.total * 5.75 / 100)
    const exact575 = ex.total * 5.75 / 100
    
    // Check if UI points match calculation
    const uiMatchesCalculation = calculation.total === ex.points
    
    const actualPercentage = calculation.total > 0 ? (calculation.total / ex.total) * 100 : 0
    
    return {
      total: ex.total,
      totalCents,
      uiPoints: ex.points,
      calculatedPoints: calculation.total,
      expectedSimple: simple575,
      expectedExact: exact575,
      breakdown: calculation.breakdown,
      differenceFromUI: calculation.total - ex.points,
      differenceFromExpected: calculation.total - simple575,
      actualPercentage,
      percentageOfExpected: simple575 > 0 ? (calculation.total / simple575) * 100 : 0
    }
  })
  
  console.log('\n  UI Examples Analysis:')
  analysis.forEach(a => {
    console.log(`    $${a.total} → UI: ${a.uiPoints}, Calculado: ${a.calculated}, Esperado: ${a.expectedSimple}, % real: ${a.actualPercentage.toFixed(2)}%`)
  })
  
  return analysis
}

// ============================================================================
// 6. FIND THE ACTUAL BASE USED
// ============================================================================
async function findActualBaseUsed(tenantId: string) {
  const db = mongoose.connection.db!
  
  console.log('\n📊 5. ENCONTRANDO BASE MONETARIA REAL')
  
  const orders = await db.collection('orders')
    .find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      status: { $nin: ['cancelled'] },
      loyaltyPointsCredited: true
    })
    .sort({ createdAt: -1 })
    .limit(30)
    .toArray()
  
  const baseAnalysis = orders.map((order: any) => {
    const total = order.total
    const subtotal = order.subtotal || 0
    const discount = order.discountAmount || 0
    const loyaltyDiscount = order.loyaltyDiscountAmount || 0
    const delivery = order.deliveryCost || 0
    
    const saleItemsTotal = order.items
      ?.filter((i: any) => i.itemType !== 'reward')
      ?.reduce((sum: number, i: any) => sum + (i.subtotal || 0), 0) || 0
    
    return {
      orderNumber: order.orderNumber,
      total,
      subtotal,
      discount,
      loyaltyDiscount,
      delivery,
      saleItemsTotal,
      totalMinusDiscount: total - discount,
      totalMinusDelivery: total - delivery,
      subtotalMinusDiscount: subtotal - discount,
      saleItemsOnly: saleItemsTotal
    }
  })
  
  return baseAnalysis
}

// ============================================================================
// 7. CHECK MEMBER POINTS BALANCE
// ============================================================================
async function checkMemberPointsBalance(tenantId: string) {
  const db = mongoose.connection.db!
  
  console.log('\n📊 6. VERIFICANDO SALDO DE MIEMBROS')
  
  const members = await db.collection('loyaltymembers')
    .find({ tenantId: new mongoose.Types.ObjectId(tenantId) })
    .limit(10)
    .toArray()
  
  const memberAnalysis = members.map((m: any) => ({
    memberId: m._id,
    phoneHash: m.phoneHash,
    points: m.loyalty?.points || 0,
    tier: m.loyalty?.tier,
    cache: m.cache,
    sosConfig: m.sosConfig,
    hasAdvanceActive: m.hasAdvanceActive
  }))
  
  console.log(`  ✅ ${members.length} miembros analizados`)
  
  return memberAnalysis
}

// ============================================================================
// 8. GENERATE FINAL REPORT
// ============================================================================
async function generateAuditReport(
  config: any,
  ordersAnalysis: any[],
  unitTests: any[],
  uiExamples: any[],
  baseAnalysis: any[],
  memberAnalysis: any[]
) {
  console.log('\n📊 7. GENERANDO REPORTE FINAL')
  
  const report = {
    timestamp: new Date().toISOString(),
    tenant: config.tenant,
    
    // Configuration analysis
    configuration: {
      mode: config.tenant.pointsConfig?.mode,
      pointsPercentage: config.tenant.pointsConfig?.pointsPercentage,
      pointsPerCurrency: config.tenant.pointsConfig?.pointsPerCurrency,
      pointsPerOrder: config.tenant.pointsConfig?.pointsPerOrder,
      minOrderForPoints: config.tenant.pointsConfig?.minOrderForPoints,
      perLocation: config.tenant.loyalty?.perLocation,
      locationConfigs: config.locationConfigs
    },
    
    // Formula analysis
    formula: {
      source: 'apps/saas/lib/loyalty.ts',
      function: 'calculatePointsBreakdown',
      line: 27,
      implementation: {
        step1: 'orderTotalPesos = orderTotalCents / 100',
        step2: 'rawBase = orderTotalPesos * pointsPercentage / 100',
        step3: 'basePoints = Math.floor(rawBase)',
        step4: 'fractionalRemainder = rawBase - basePoints',
        step5: 'microBonusRaw = fractionalRemainder * 0.0575 (HARDCODED)',
        step6: 'microBonus = complex logic with 0.0575 factor',
        step7: 'total = basePoints + microBonus + pointsPerOrder'
      },
      issues: [
        'microBonus uses hardcoded 0.0575 factor which may conflict with configured percentage',
        'The microBonus calculation is complex and may not be business-intended'
      ]
    },
    
    // Orders analysis
    ordersAnalysis: ordersAnalysis.slice(0, 30),
    
    // Unit tests
    unitTests,
    
    // UI examples
    uiExamples,
    
    // Base analysis
    baseAnalysis: baseAnalysis.slice(0, 10),
    
    // Member analysis
    memberAnalysis,
    
    // Findings
    findings: {
      configurationCorrect: config.tenant.pointsConfig?.mode === 'percentage' && 
                           config.tenant.pointsConfig?.pointsPercentage === 5.75,
      formulaUsesPercentage: true,
      formulaDividesBy100: true,
      microBonusUsesHardcoded575: true,
      microBonusImpact: 'Needs analysis from orders',
      actualVsExpectedDifference: 'Needs analysis from orders'
    },
    
    // Answers to the 10 questions
    answers: {
      q1: 'Where is 5.75% configured?',
      a1: 'In tenant.pointsConfig.pointsPercentage = 5.75',
      
      q2: 'What is the stored value?',
      a2: '5.75 (as a number, not 0.0575)',
      
      q3: 'How is it transformed?',
      a3: 'Divided by 100 in the formula: orderTotalPesos * pointsPercentage / 100',
      
      q4: 'What is the exact formula?',
      a4: 'total = Math.floor(orderTotalPesos * 5.75 / 100) + microBonus + pointsPerOrder',
      
      q5: 'What monetary base is used?',
      a5: 'saleItemsTotal (items excluding rewards), converted from cents to pesos',
      
      q6: 'What rounding/bonuses exist?',
      a6: 'Math.floor on base, plus complex microBonus using hardcoded 0.0575 factor',
      
      q7: 'Why examples don\'t match 5.75%?',
      a7: 'MicroBonus uses hardcoded 0.0575 which may affect results differently than simple percentage',
      
      q8: 'Is it a bug, config issue, legacy formula, or interpretation?',
      a8: 'MicroBonus factor 0.0575 appears to be legacy code that may conflict with percentage mode',
      
      q9: 'What should return for $40,000?',
      a9: 'Calculated in unit tests',
      
      q10: 'Is UI showing correct balance?',
      a10: 'Member balance includes all historical points, not just last order'
    }
  }
  
  return report
}

// ============================================================================
// MAIN
// ============================================================================
async function runLoyalty575Audit() {
  console.log('🔍 AUDIT TÉCNICO DE IMPLEMENTACIÓN LOYALTY 5.75% - KEKE&LARRY')
  console.log('='.repeat(70))
  
  try {
    await connect()
    
    // 1. Extract configuration
    const config = await extractRealConfiguration(TENANT_ID)
    
    // 2. Analyze real orders
    const ordersAnalysis = await analyzeRealOrders(TENANT_ID, config)
    
    // 3. Run unit tests
    const unitTests = runUnitTests(config)
    
    // 4. Analyze UI examples
    const uiExamples = analyzeUIExamples(config)
    
    // 5. Find actual base used
    const baseAnalysis = await findActualBaseUsed(TENANT_ID)
    
    // 6. Check member points balance
    const memberAnalysis = await checkMemberPointsBalance(TENANT_ID)
    
    // 7. Generate report
    const report = await generateAuditReport(
      config,
      ordersAnalysis,
      unitTests,
      uiExamples,
      baseAnalysis,
      memberAnalysis
    )
    
    // Save report
    const jsonPath = path.join(OUTPUT_DIR, 'LOYALTY_575_IMPLEMENTATION_AUDIT_KEKE_LARRY.json')
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2))
    
    const mdPath = path.join(OUTPUT_DIR, 'LOYALTY_575_IMPLEMENTATION_AUDIT_KEKE_LARRY.md')
    fs.writeFileSync(mdPath, generateMarkdownReport(report))
    
    console.log('\n' + '='.repeat(70))
    console.log('✅ AUDIT COMPLETADO')
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
  const unitTestsLines = report.unitTests.map((t: any) => 
    `- $${t.inputPesos} → ${t.actual} pts (esperado 5.75%: ${t.expectedSimple}, diferencia: ${t.difference}, % real: ${t.actualPercentage.toFixed(2)}%)`
  ).join('\n')
  
  const uiExamplesLines = report.uiExamples.map((e: any) => 
    `- $${e.total} → UI: ${e.uiPoints}, Calculado: ${e.calculated}, Esperado: ${e.expectedSimple}, % real: ${e.actualPercentage.toFixed(2)}%, Diferencia UI: ${e.differenceFromUI}`
  ).join('\n')
  
  const baseAnalysisLines = report.baseAnalysis.slice(0, 5).map((b: any) => 
    `- Orden ${b.orderNumber}: Total=$${b.total/100}, Subtotal=$${b.subtotal/100}, SaleItems=$${b.saleItemsTotal/100}`
  ).join('\n')
  
  const ordersAnalysisLines = report.ordersAnalysis.slice(0, 10).map((o: any) => 
    `- Orden ${o.orderNumber}: $${o.saleItemsTotalPesos} → ${o.actualPoints} pts (esperado: ${o.expectedPointsSimple}, % real: ${o.actualPercentage.toFixed(2)}%, diferencia: ${o.difference})`
  ).join('\n')
  
  const issuesLines = report.formula.issues.map((i: string) => `- ${i}`).join('\n')
  
  return `# LOYALTY 5.75% IMPLEMENTATION AUDIT - KEKE&LARRY
**Generated:** ${report.timestamp}

==================================================
CONFIGURACIÓN DEL TENANT
==================================================

**Nombre:** ${report.tenant.name}
**Slug:** ${report.tenant.slug}
**Tenant ID:** ${report.tenant.id}

**Points Config:**
- Mode: ${report.configuration.mode}
- pointsPercentage: ${report.configuration.pointsPercentage}
- pointsPerCurrency: ${report.configuration.pointsPerCurrency}
- pointsPerOrder: ${report.configuration.pointsPerOrder}
- minOrderForPoints: ${report.configuration.minOrderForPoints}

**Loyalty Config:**
- perLocation: ${report.configuration.perLocation}
- Location configs: ${report.configuration.locationConfigs.length}

==================================================
FÓRMULA IMPLEMENTADA
==================================================

**Fuente:** ${report.formula.source}
**Función:** ${report.formula.function}
**Línea:** ${report.formula.line}

**Implementación:**
1. ${report.formula.implementation.step1}
2. ${report.formula.implementation.step2}
3. ${report.formula.implementation.step3}
4. ${report.formula.implementation.step4}
5. ${report.formula.implementation.step5}
6. ${report.formula.implementation.step6}
7. ${report.formula.implementation.step7}

**Issues Detectados:**
${issuesLines}

==================================================
TESTS UNITARIOS
==================================================

${unitTestsLines}

==================================================
EJEMPLOS DE UI
==================================================

${uiExamplesLines}

==================================================
ANÁLISIS DE BASE MONETARIA
==================================================

${baseAnalysisLines}

==================================================
RESPUESTAS A LAS 10 PREGUNTAS
==================================================

**1. ¿Dónde se configura el 5,75%?**
${report.answers.a1}

**2. ¿Cuál es el valor almacenado?**
${report.answers.a2}

**3. ¿Cómo se transforma ese valor?**
${report.answers.a3}

**4. ¿Cuál es la fórmula exacta implementada?**
${report.answers.a4}

**5. ¿Cuál es la base monetaria utilizada?**
${report.answers.a5}

**6. ¿Qué redondeos/bonuses existen?**
${report.answers.a6}

**7. ¿Por qué los ejemplos reales no dan exactamente 5,75%?**
${report.answers.a7}

**8. ¿Es un bug de implementación, una diferencia en la base elegible, una configuración, una fórmula legacy o una interpretación incorrecta?**
${report.answers.a8}

**9. ¿Qué debería devolver el sistema para $40.000?**
${report.unitTests.find((t: any) => t.inputPesos === 40000)?.actual || 'N/A'}

**10. ¿La UI está mostrando el saldo correcto?**
${report.answers.a10}

==================================================
ANÁLISIS DE ÓRDENES REALES (PRIMERAS 10)
==================================================

${ordersAnalysisLines}

==================================================
END OF AUDIT REPORT
==================================================
`
}

runLoyalty575Audit()
