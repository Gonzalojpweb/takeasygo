import mongoose from 'mongoose'
import * as fs from 'fs'
import * as path from 'path'

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT DE CONFIGURACIÓN LOYALTY 5.75% - KEKE&LARRY
// Script para extraer la configuración exacta del tenant
// ─────────────────────────────────────────────────────────────────────────────

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://pgonzalojose_db_user:6oXEemLauaEuPoaq@takeasygo.ssjlhfw.mongodb.net/?appName=takeasygo'

const TENANT_ID = '69f8bf6ad3fcc97fd64bec87'

async function connect() {
  await mongoose.connect(MONGODB_URI, {
    bufferCommands: false,
    maxPoolSize: 5,
  })
  console.log('✅ Connected to MongoDB')
}

async function disconnect() {
  await mongoose.disconnect()
  console.log('✅ Disconnected from MongoDB')
}

async function getTenantLoyaltyConfig(tenantId: string) {
  const db = mongoose.connection.db!

  // Get tenant config
  const tenant = await db.collection('tenants').findOne(
    { _id: new mongoose.Types.ObjectId(tenantId) },
    { projection: { name: 1, slug: 1, loyalty: 1, pointsConfig: 1 } }
  )

  // Get location loyalty configs
  const locationConfigs = await db.collection('locationloyaltyconfigs').find(
    { tenantId: new mongoose.Types.ObjectId(tenantId) }
  ).toArray()

  return { tenant, locationConfigs }
}

async function getOrdersWithPoints(tenantId: string, limit: number = 50) {
  const db = mongoose.connection.db!

  const orders = await db.collection('orders').find(
    {
      tenantId: new mongoose.Types.ObjectId(tenantId),
      status: { $nin: ['cancelled'] },
      loyaltyPointsCredited: true
    },
    {
      projection: {
        orderNumber: 1,
        total: 1,
        subtotal: 1,
        items: 1,
        loyaltyPointsCredited: 1,
        loyaltyPointsUsed: 1,
        createdAt: 1
      },
      sort: { createdAt: -1 },
      limit
    }
  ).toArray()

  return orders
}

async function main() {
  await connect()

  console.log('\n=== AUDIT LOYALTY 5.75% - KEKE&LARRY ===\n')

  // 1. Get tenant loyalty config
  console.log('1. Extrayendo configuración del tenant...')
  const { tenant, locationConfigs } = await getTenantLoyaltyConfig(TENANT_ID)

  const auditData: any = {
    tenant: {
      id: TENANT_ID,
      name: tenant?.name,
      slug: tenant?.slug,
      loyalty: tenant?.loyalty,
      pointsConfig: tenant?.pointsConfig
    },
    locationConfigs: locationConfigs.map((lc: any) => ({
      locationId: lc.locationId,
      pointsConfig: lc.pointsConfig
    })),
    extractedAt: new Date().toISOString()
  }

  // 2. Get orders with points
  console.log('2. Extrayendo órdenes con puntos...')
  const orders = await getOrdersWithPoints(TENANT_ID, 100)

  // 3. Calculate expected points for each order
  console.log('3. Calculando puntos esperados...')
  const ordersWithCalculation = orders.map((order: any) => {
    const totalPesos = order.total / 100
    const saleItemsTotal = order.items
      ?.filter((i: any) => i.itemType !== 'reward')
      ?.reduce((sum: number, i: any) => sum + (i.subtotal || 0), 0) ?? order.total ?? 0
    const saleItemsTotalPesos = saleItemsTotal / 100

    // Calculate with current config (fixed_per_currency, 0.1)
    const pointsFixed = Math.floor(saleItemsTotalPesos * 0.1)

    // Calculate with percentage mode (5.75%)
    const pointsPercentage = Math.floor(saleItemsTotalPesos * 5.75 / 100)

    // Calculate with percentage mode (0.0575 if stored incorrectly)
    const pointsPercentageWrong = Math.floor(saleItemsTotalPesos * 0.0575 / 100)

    return {
      orderNumber: order.orderNumber,
      totalCents: order.total,
      totalPesos: totalPesos,
      saleItemsTotalCents: saleItemsTotal,
      saleItemsTotalPesos: saleItemsTotalPesos,
      pointsFixedExpected: pointsFixed,
      pointsPercentageExpected: pointsPercentage,
      pointsPercentageWrong: pointsPercentageWrong,
      createdAt: order.createdAt
    }
  })

  auditData.ordersAnalysis = ordersWithCalculation

  // 4. Save results
  const outputPath = path.join(__dirname, '../reward-intelligence-data-keke-larry/loyalty_575_config_audit.json')
  fs.writeFileSync(outputPath, JSON.stringify(auditData, null, 2))
  console.log(`\n✅ Datos guardados en: ${outputPath}`)

  // 5. Print summary
  console.log('\n=== RESUMEN ===\n')
  console.log('Tenant:', tenant?.name)
  console.log('Config pointsConfig:', JSON.stringify(tenant?.pointsConfig, null, 2))
  console.log('Config loyalty:', JSON.stringify(tenant?.loyalty, null, 2))
  console.log('\nLocation configs:', locationConfigs.length)
  locationConfigs.forEach((lc: any, i: number) => {
    console.log(`  Location ${i + 1}:`, lc.locationId, JSON.stringify(lc.pointsConfig))
  })

  console.log('\n=== ANÁLISIS DE ÓRDENES (primeras 10) ===\n')
  ordersWithCalculation.slice(0, 10).forEach((order: any) => {
    console.log(`\nOrden: ${order.orderNumber}`)
    console.log(`  Total: $${order.totalPesos.toFixed(2)} (${order.totalCents} centavos)`)
    console.log(`  Sale Items Total: $${order.saleItemsTotalPesos.toFixed(2)} (${order.saleItemsTotalCents} centavos)`)
    console.log(`  Puntos (fixed 0.1): ${order.pointsFixedExpected}`)
    console.log(`  Puntos (5.75%): ${order.pointsPercentageExpected}`)
    console.log(`  Puntos (0.0575% - incorrecto): ${order.pointsPercentageWrong}`)
  })

  await disconnect()
}

main().catch(console.error)
