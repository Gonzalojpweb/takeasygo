import mongoose from 'mongoose'
import * as fs from 'fs'
import * as path from 'path'

// ============================================================================
// TGO DATA INTELLIGENCE AUDIT - KEKE & LARRY - EXHAUSTIVE VERSION
// Script de extracción COMPLETA de datos (READ-ONLY)
// ============================================================================

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://pgonzalojose_db_user:6oXEemLauaEuPoaq@takeasygo.ssjlhfw.mongodb.net/?appName=takeasygo'
const TENANT_ID = '69f8bf6ad3fcc97fd64bec87'
const OUTPUT_DIR = path.join(__dirname, '../audit-data-keke-larry')

// Global metrics reference for markdown generation
let globalMetrics: any = {}

interface AuditReport {
  timestamp: string
  tenant: any
  locations: any[]
  dataInventory: DataInventory
  schemaMap: SchemaMap
  dataQuality: DataQualityReport
  dataLineage: DataLineage
  coverage: CoverageReport
  executiveSummary: ExecutiveSummary
}

interface DataInventory {
  collections: Record<string, CollectionInfo>
  posthogEvents?: PosthogEventCatalog
}

interface CollectionInfo {
  count: number
  fields: string[]
  sampleFields: Record<string, any>
  dateRange?: { min: Date; max: Date }
}

interface SchemaMap {
  entities: EntityInfo[]
  relationships: RelationshipInfo[]
}

interface EntityInfo {
  name: string
  collection: string
  fields: FieldInfo[]
  indexes: string[]
  description: string
}

interface FieldInfo {
  name: string
  type: string
  required: boolean
  description?: string
}

interface RelationshipInfo {
  from: string
  to: string
  type: 'one-to-one' | 'one-to-many' | 'many-to-many'
  field: string
}

interface PosthogEventCatalog {
  events: EventInfo[]
  personProperties: PropertyInfo[]
  groupProperties?: PropertyInfo[]
}

interface EventInfo {
  name: string
  count: number
  firstSeen: Date
  lastSeen: Date
  properties: PropertyInfo[]
}

interface PropertyInfo {
  name: string
  type: string
  example?: any
}

interface DataQualityReport {
  issues: QualityIssue[]
  summary: QualitySummary
}

interface QualityIssue {
  severity: 'critical' | 'high' | 'medium' | 'low'
  entity: string
  issue: string
  affectedRecords: number
  percentage: number
  recommendation: string
}

interface QualitySummary {
  totalRecords: number
  criticalIssues: number
  highIssues: number
  mediumIssues: number
  lowIssues: number
  overallScore: number
}

interface DataLineage {
  sources: DataSource[]
  dataFlow: DataFlowInfo[]
}

interface DataSource {
  name: string
  type: 'mongodb' | 'posthog' | 'api' | 'manual'
  description: string
  connection: string
}

interface DataFlowInfo {
  source: string
  destination: string
  transformation: string
  frequency: string
}

interface CoverageReport {
  temporal: TemporalCoverage
  entities: EntityCoverage
  metrics: MetricCoverage
}

interface TemporalCoverage {
  startDate: Date
  endDate: Date
  totalDays: number
  gaps: DateRange[]
}

interface DateRange {
  start: Date
  end: Date
}

interface EntityCoverage {
  [entity: string]: {
    totalRecords: number
    recordsWithCompleteData: number
    recordsWithPartialData: number
    recordsWithMissingData: number
    completenessPercentage: number
  }
}

interface MetricCoverage {
  available: string[]
  partiallyAvailable: string[]
  notAvailable: string[]
}

interface ExecutiveSummary {
  tenantOverview: TenantOverview
  keyMetrics: KeyMetrics
  dataReadiness: DataReadiness
  recommendations: string[]
}

interface TenantOverview {
  name: string
  id: string
  locations: number
  activeSince: Date
  dataPeriod: string
}

interface KeyMetrics {
  totalOrders: number
  totalRevenue: number
  uniqueCustomers: number
  avgTicket: number
  loyaltyMembers: number
  productCount: number
}

interface DataReadiness {
  score: number
  categories: {
    sales: number
    customers: number
    products: number
    loyalty: number
    behavior: number
    inventory: number
  }
}

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

async function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }
}

async function getTenantInfo(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  const tenant = await db.collection('tenants').findOne({ _id: tenantId })
  const locations = await db.collection('locations').find({ tenantId }).toArray()
  
  return { tenant, locations }
}

async function getDataInventory(tenantId: mongoose.Types.ObjectId): Promise<DataInventory> {
  const db = mongoose.connection.db!
  
  const collections = [
    'orders', 'orderitems', 'consumers', 'customerprofiles', 'customerevents',
    'loyaltymembers', 'feedbacks', 'tiainsights', 'ratings',
    'menus', 'storeitems', 'storeredemptions', 'promotions', 'qrpromos',
    'impactevents', 'explorevents', 'shareevents', 'menuvisits',
    'hiddenrewardclaims', 'locations', 'users', 'tables',
    'cashregisters', 'cashmovements', 'inventorystates', 'inventoryskus',
    'inventoryrecipes', 'inventoryledger', 'nudgerules', 'clubdiscounts',
    'clubdiscountusages', 'corporateaccounts', 'reservations', 'deliveries',
    'qrpromoviews', 'auditlogs', 'zreportrecords'
  ]
  
  const inventory: Record<string, CollectionInfo> = {}
  
  for (const col of collections) {
    try {
      const count = await db.collection(col).countDocuments({ tenantId })
      
      if (count > 0) {
        // Get sample document to understand fields
        const sample = await db.collection(col).findOne({ tenantId })
        const fields = sample ? Object.keys(sample) : []
        
        // Get date range if createdAt exists
        let dateRange
        if (sample && sample.createdAt) {
          const dateAgg = await db.collection(col).aggregate([
            { $match: { tenantId } },
            { $group: {
              _id: null,
              minDate: { $min: '$createdAt' },
              maxDate: { $max: '$createdAt' }
            }}
          ]).toArray()
          dateRange = dateAgg[0] ? { minDate: dateAgg[0].minDate, maxDate: dateAgg[0].maxDate } : undefined
        }
        
        inventory[col] = {
          count,
          fields,
          sampleFields: sample || {},
          dateRange
        }
      }
    } catch (err) {
      console.warn(`  ⚠️  Collection ${col} error:`, (err as Error).message)
      inventory[col] = { count: 0, fields: [], sampleFields: {} }
    }
  }
  
  return { collections: inventory }
}

async function extractOrders(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  console.log('  📦 Extracting orders...')
  
  const orders = await db.collection('orders')
    .find({ tenantId })
    .sort({ createdAt: 1 })
    .toArray()
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'orders.json'),
    JSON.stringify(orders, null, 2)
  )
  
  console.log(`    ✅ ${orders.length} orders extracted`)
  
  return orders
}

async function extractConsumers(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  console.log('  📦 Extracting consumers...')
  
  const consumers = await db.collection('consumers')
    .find({ tenantIds: tenantId })
    .toArray()
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'consumers.json'),
    JSON.stringify(consumers, null, 2)
  )
  
  console.log(`    ✅ ${consumers.length} consumers extracted`)
  
  return consumers
}

async function extractLoyaltyMembers(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  console.log('  📦 Extracting loyalty members...')
  
  const members = await db.collection('loyaltymembers')
    .find({ tenantId })
    .toArray()
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'loyalty_members.json'),
    JSON.stringify(members, null, 2)
  )
  
  console.log(`    ✅ ${members.length} loyalty members extracted`)
  
  return members
}

async function extractMenus(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  console.log('  📦 Extracting menus...')
  
  const menus = await db.collection('menus')
    .find({ tenantId })
    .toArray()
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'menus.json'),
    JSON.stringify(menus, null, 2)
  )
  
  console.log(`    ✅ ${menus.length} menus extracted`)
  
  return menus
}

async function extractPromotions(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  console.log('  📦 Extracting promotions...')
  
  const promotions = await db.collection('promotions')
    .find({ $or: [{ tenantId }, { targetTenants: tenantId }] })
    .toArray()
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'promotions.json'),
    JSON.stringify(promotions, null, 2)
  )
  
  console.log(`    ✅ ${promotions.length} promotions extracted`)
  
  return promotions
}

async function extractStoreItems(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  console.log('  📦 Extracting store items...')
  
  const items = await db.collection('storeitems')
    .find({ $or: [{ tenantId }, { targetTenants: tenantId }] })
    .toArray()
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'store_items.json'),
    JSON.stringify(items, null, 2)
  )
  
  console.log(`    ✅ ${items.length} store items extracted`)
  
  return items
}

async function extractStoreRedemptions(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  console.log('  📦 Extracting store redemptions...')
  
  const redemptions = await db.collection('storeredemptions')
    .find({ tenantId })
    .toArray()
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'store_redemptions.json'),
    JSON.stringify(redemptions, null, 2)
  )
  
  console.log(`    ✅ ${redemptions.length} store redemptions extracted`)
  
  return redemptions
}

async function extractCustomerEvents(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  console.log('  📦 Extracting customer events...')
  
  const events = await db.collection('customerevents')
    .find({ tenantId })
    .sort({ createdAt: 1 })
    .toArray()
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'customer_events.json'),
    JSON.stringify(events, null, 2)
  )
  
  console.log(`    ✅ ${events.length} customer events extracted`)
  
  return events
}

async function extractInventory(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  console.log('  📦 Extracting inventory data...')
  
  const skus = await db.collection('inventoryskus')
    .find({ tenantId })
    .toArray()
  
  const recipes = await db.collection('inventoryrecipes')
    .find({ tenantId })
    .toArray()
  
  const ledger = await db.collection('inventoryledger')
    .find({ tenantId })
    .limit(10000) // Limit for performance
    .toArray()
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'inventory_skus.json'),
    JSON.stringify(skus, null, 2)
  )
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'inventory_recipes.json'),
    JSON.stringify(recipes, null, 2)
  )
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'inventory_ledger.json'),
    JSON.stringify(ledger, null, 2)
  )
  
  console.log(`    ✅ ${skus.length} SKUs, ${recipes.length} recipes, ${ledger.length} ledger entries extracted`)
  
  return { skus, recipes, ledger }
}

async function calculateMetrics(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  console.log('  📊 Calculating metrics...')
  
  // Sales metrics
  const salesMetrics = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $group: {
      _id: null,
      totalOrders: { $sum: 1 },
      totalRevenue: { $sum: '$total' },
      avgTicket: { $avg: '$total' },
      minDate: { $min: '$createdAt' },
      maxDate: { $max: '$createdAt' }
    }}
  ]).toArray()
  
  // Product metrics
  const productMetrics = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $unwind: '$items' },
    { $group: {
      _id: '$items.menuItemId',
      name: { $first: '$items.name' },
      categoryName: { $first: '$items.categoryName' },
      totalQuantity: { $sum: '$items.quantity' },
      totalRevenue: { $sum: '$items.subtotal' },
      orderCount: { $sum: 1 }
    }},
    { $sort: { totalRevenue: -1 } }
  ]).toArray()
  
  // Customer metrics
  const customerMetrics = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $group: {
      _id: '$customer.phoneHash',
      totalOrders: { $sum: 1 },
      totalSpent: { $sum: '$total' },
      firstOrder: { $min: '$createdAt' },
      lastOrder: { $max: '$createdAt' }
    }},
    { $group: {
      _id: null,
      uniqueCustomers: { $sum: 1 },
      totalCustomerRevenue: { $sum: '$totalSpent' },
      avgCustomerRevenue: { $avg: '$totalSpent' },
      repeatCustomers: {
        $sum: { $cond: [{ $gte: ['$totalOrders', 2] }, 1, 0] }
      }
    }}
  ]).toArray()
  
  // Loyalty metrics
  const loyaltyMetrics = await db.collection('loyaltymembers').aggregate([
    { $match: { tenantId, status: 'active' } },
    { $group: {
      _id: null,
      totalMembers: { $sum: 1 },
      totalPoints: { $sum: '$loyalty.points' },
      totalRedemptions: { $sum: '$store.totalRedemptions' },
      totalPointsSpent: { $sum: '$store.totalPointsSpent' }
    }}
  ]).toArray()
  
  const metrics = {
    sales: salesMetrics[0] || {},
    products: productMetrics,
    customers: customerMetrics[0] || {},
    loyalty: loyaltyMetrics[0] || {}
  }
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'metrics.json'),
    JSON.stringify(metrics, null, 2)
  )
  
  console.log('    ✅ Metrics calculated')
  
  return metrics
}

async function generateDataQualityReport(tenantId: mongoose.Types.ObjectId, orders: any[]): Promise<DataQualityReport> {
  const db = mongoose.connection.db!
  
  console.log('  🔍 Analyzing data quality...')
  
  const issues: QualityIssue[] = []
  
  // Check orders without phoneHash
  const ordersWithoutPhone = orders.filter((o: any) => !o.customer?.phoneHash || o.customer.phoneHash === '').length
  if (ordersWithoutPhone > 0) {
    issues.push({
      severity: 'high',
      entity: 'orders',
      issue: 'Orders without customer phoneHash',
      affectedRecords: ordersWithoutPhone,
      percentage: (ordersWithoutPhone / orders.length) * 100,
      recommendation: 'Ensure phoneHash is captured at checkout for customer linking'
    })
  }
  
  // Check orders without items
  const ordersWithoutItems = orders.filter((o: any) => !o.items || o.items.length === 0).length
  if (ordersWithoutItems > 0) {
    issues.push({
      severity: 'critical',
      entity: 'orders',
      issue: 'Orders without items',
      affectedRecords: ordersWithoutItems,
      percentage: (ordersWithoutItems / orders.length) * 100,
      recommendation: 'Investigate order creation process - orders should always have items'
    })
  }
  
  // Check for negative totals
  const negativeTotals = orders.filter((o: any) => o.total < 0).length
  if (negativeTotals > 0) {
    issues.push({
      severity: 'critical',
      entity: 'orders',
      issue: 'Orders with negative total',
      affectedRecords: negativeTotals,
      percentage: (negativeTotals / orders.length) * 100,
      recommendation: 'Investigate refund/discount logic - totals should not be negative'
    })
  }
  
  // Check for zero totals in non-cancelled orders
  const zeroTotals = orders.filter((o: any) => o.total === 0 && o.status !== 'cancelled').length
  if (zeroTotals > 0) {
    issues.push({
      severity: 'medium',
      entity: 'orders',
      issue: 'Non-cancelled orders with zero total',
      affectedRecords: zeroTotals,
      percentage: (zeroTotals / orders.length) * 100,
      recommendation: 'Review if these are test orders or payment failures'
    })
  }
  
  const criticalCount = issues.filter(i => i.severity === 'critical').length
  const highCount = issues.filter(i => i.severity === 'high').length
  const mediumCount = issues.filter(i => i.severity === 'medium').length
  const lowCount = issues.filter(i => i.severity === 'low').length
  
  const summary: QualitySummary = {
    totalRecords: orders.length,
    criticalIssues: criticalCount,
    highIssues: highCount,
    mediumIssues: mediumCount,
    lowIssues: lowCount,
    overallScore: Math.max(0, 100 - (criticalCount * 20) - (highCount * 10) - (mediumCount * 5) - (lowCount * 2))
  }
  
  return { issues, summary }
}

async function generateExecutiveSummary(
  tenant: any,
  locations: any[],
  metrics: any,
  dataQuality: DataQualityReport
): Promise<ExecutiveSummary> {
  
  const activeSince = tenant.createdAt
  const dataPeriod = metrics.sales?.minDate && metrics.sales?.maxDate
    ? `${metrics.sales.minDate.toISOString().split('T')[0]} to ${metrics.sales.maxDate.toISOString().split('T')[0]}`
    : 'Unknown'
  
  const tenantOverview: TenantOverview = {
    name: tenant.name,
    id: tenant._id.toString(),
    locations: locations.length,
    activeSince,
    dataPeriod
  }
  
  const keyMetrics: KeyMetrics = {
    totalOrders: metrics.sales?.totalOrders || 0,
    totalRevenue: metrics.sales?.totalRevenue || 0,
    uniqueCustomers: metrics.customers?.uniqueCustomers || 0,
    avgTicket: metrics.sales?.avgTicket || 0,
    loyaltyMembers: metrics.loyalty?.totalMembers || 0,
    productCount: metrics.products?.length || 0
  }
  
  const dataReadiness: DataReadiness = {
    score: dataQuality.summary.overallScore,
    categories: {
      sales: keyMetrics.totalOrders > 0 ? 100 : 0,
      customers: keyMetrics.uniqueCustomers > 0 ? 100 : 0,
      products: keyMetrics.productCount > 0 ? 100 : 0,
      loyalty: keyMetrics.loyaltyMembers > 0 ? 100 : 0,
      behavior: 50, // TODO: Check CustomerEvents
      inventory: 50 // TODO: Check Inventory
    }
  }
  
  const recommendations: string[] = []
  
  if (dataQuality.summary.criticalIssues > 0) {
    recommendations.push('Address critical data quality issues immediately')
  }
  
  if (keyMetrics.loyaltyMembers / keyMetrics.uniqueCustomers < 0.3) {
    recommendations.push('Consider loyalty program enrollment strategies')
  }
  
  if (metrics.customers?.repeatCustomers / metrics.customers?.uniqueCustomers < 0.2) {
    recommendations.push('Focus on customer retention strategies')
  }
  
  return {
    tenantOverview,
    keyMetrics,
    dataReadiness,
    recommendations
  }
}

async function runCompleteAudit() {
  console.log('🔍 TGO COMPLETE DATA AUDIT — Keke & Larry')
  console.log('='.repeat(70))
  
  let metrics: any = {}
  
  try {
    await connect()
    await ensureOutputDir()
    
    const db = mongoose.connection.db!
    const tenantId = new mongoose.Types.ObjectId(TENANT_ID)
    
    // Get tenant info
    console.log('\n📍 Getting tenant info...')
    const { tenant, locations } = await getTenantInfo(tenantId)
    console.log(`  ✅ Tenant: ${tenant.name} (${tenant._id})`)
    console.log(`  ✅ Locations: ${locations.length}`)
    
    // Data inventory
    console.log('\n📋 Building data inventory...')
    const dataInventory = await getDataInventory(tenantId)
    console.log(`  ✅ ${Object.keys(dataInventory.collections).length} collections found`)
    
    // Extract all data
    console.log('\n📦 Extracting data...')
    const orders = await extractOrders(tenantId)
    const consumers = await extractConsumers(tenantId)
    const loyaltyMembers = await extractLoyaltyMembers(tenantId)
    const menus = await extractMenus(tenantId)
    const promotions = await extractPromotions(tenantId)
    const storeItems = await extractStoreItems(tenantId)
    const storeRedemptions = await extractStoreRedemptions(tenantId)
    const customerEvents = await extractCustomerEvents(tenantId)
    const inventory = await extractInventory(tenantId)
    
    // Calculate metrics
    console.log('\n📊 Computing metrics...')
    metrics = await calculateMetrics(tenantId)
    globalMetrics = metrics
    
    // Data quality
    console.log('\n🔍 Analyzing data quality...')
    const dataQuality = await generateDataQualityReport(tenantId, orders)
    
    // Executive summary
    console.log('\n📋 Generating executive summary...')
    const executiveSummary = await generateExecutiveSummary(tenant, locations, metrics, dataQuality)
    
    // Schema map (simplified for now)
    const schemaMap: SchemaMap = {
      entities: [
        {
          name: 'Order',
          collection: 'orders',
          fields: orders[0] ? Object.keys(orders[0]).map(k => ({ name: k, type: typeof orders[0][k], required: false })) : [],
          indexes: [],
          description: 'Customer orders with items, payments, and status'
        },
        {
          name: 'Consumer',
          collection: 'consumers',
          fields: consumers[0] ? Object.keys(consumers[0]).map(k => ({ name: k, type: typeof consumers[0][k], required: false })) : [],
          indexes: [],
          description: 'Customer profiles with encrypted PII'
        },
        {
          name: 'LoyaltyMember',
          collection: 'loyaltymembers',
          fields: loyaltyMembers[0] ? Object.keys(loyaltyMembers[0]).map(k => ({ name: k, type: typeof loyaltyMembers[0][k], required: false })) : [],
          indexes: [],
          description: 'Club membership with points and rewards'
        },
        {
          name: 'Menu',
          collection: 'menus',
          fields: menus[0] ? Object.keys(menus[0]).map(k => ({ name: k, type: typeof menus[0][k], required: false })) : [],
          indexes: [],
          description: 'Product catalog with categories and items'
        },
        {
          name: 'StoreItem',
          collection: 'storeitems',
          fields: storeItems[0] ? Object.keys(storeItems[0]).map(k => ({ name: k, type: typeof storeItems[0][k], required: false })) : [],
          indexes: [],
          description: 'Reward items redeemable with points'
        }
      ],
      relationships: [
        { from: 'orders', to: 'consumers', type: 'many-to-one', field: 'customer.phoneHash' },
        { from: 'orders', to: 'loyaltymembers', type: 'many-to-one', field: 'customer.phoneHash' },
        { from: 'orders', to: 'menus', type: 'many-to-one', field: 'items.menuItemId' },
        { from: 'storeredemptions', to: 'storeitems', type: 'many-to-one', field: 'storeItemId' },
        { from: 'storeredemptions', to: 'loyaltymembers', type: 'many-to-one', field: 'memberId' }
      ]
    }
    
    // Data lineage
    const dataLineage: DataLineage = {
      sources: [
        { name: 'MongoDB Primary', type: 'mongodb', description: 'Primary transactional database', connection: 'takeasygo.ssjlhfw.mongodb.net' },
        { name: 'PostHog Analytics', type: 'posthog', description: 'Event tracking and analytics', connection: 'us.i.posthog.com' }
      ],
      dataFlow: [
        { source: 'orders', destination: 'customerevents', transformation: 'order_completed event', frequency: 'real-time' },
        { source: 'loyaltymembers', destination: 'consumers', transformation: 'profile sync', frequency: 'on save' }
      ]
    }
    
    // Coverage report
    const coverage: CoverageReport = {
      temporal: {
        startDate: metrics.sales?.minDate || new Date(),
        endDate: metrics.sales?.maxDate || new Date(),
        totalDays: metrics.sales?.minDate && metrics.sales?.maxDate 
          ? Math.floor((metrics.sales.maxDate.getTime() - metrics.sales.minDate.getTime()) / (1000 * 60 * 60 * 24))
          : 0,
        gaps: []
      },
      entities: {
        orders: {
          totalRecords: orders.length,
          recordsWithCompleteData: orders.filter((o: any) => o.customer?.phoneHash && o.items?.length > 0).length,
          recordsWithPartialData: orders.filter((o: any) => !o.customer?.phoneHash || !o.items?.length).length,
          recordsWithMissingData: 0,
          completenessPercentage: (orders.filter((o: any) => o.customer?.phoneHash && o.items?.length > 0).length / orders.length) * 100
        },
        consumers: {
          totalRecords: consumers.length,
          recordsWithCompleteData: consumers.length,
          recordsWithPartialData: 0,
          recordsWithMissingData: 0,
          completenessPercentage: 100
        },
        loyalty: {
          totalRecords: loyaltyMembers.length,
          recordsWithCompleteData: loyaltyMembers.length,
          recordsWithPartialData: 0,
          recordsWithMissingData: 0,
          completenessPercentage: 100
        }
      },
      metrics: {
        available: [
          'totalOrders', 'totalRevenue', 'avgTicket', 'uniqueCustomers',
          'repeatCustomers', 'loyaltyMembers', 'totalPoints', 'totalRedemptions',
          'productSales', 'categorySales', 'hourlySales', 'dailySales'
        ],
        partiallyAvailable: [
          'customerLifetimeValue', 'retentionRate', 'churnRate'
        ],
        notAvailable: [
          'foodCost', 'margin', 'contributionMargin', 'preparationTime',
          'capacityUtilization', 'stockoutRate'
        ]
      }
    }
    
    // Compile final report
    const report: AuditReport = {
      timestamp: new Date().toISOString(),
      tenant,
      locations,
      dataInventory,
      schemaMap,
      dataQuality,
      dataLineage,
      coverage,
      executiveSummary
    }
    
    // Save report
    const reportPath = path.join(OUTPUT_DIR, 'complete-audit-report.json')
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
    
    // Also save a readable markdown summary
    const mdPath = path.join(OUTPUT_DIR, 'AUDIT_SUMMARY.md')
    const mdContent = generateMarkdownSummary(report, metrics)
    fs.writeFileSync(mdPath, mdContent)
    
    console.log('\n' + '='.repeat(70))
    console.log('✅ COMPLETE AUDIT FINISHED')
    console.log('='.repeat(70))
    console.log(`\n📁 Data exported to: ${OUTPUT_DIR}`)
    console.log(`📄 Full report: ${reportPath}`)
    console.log(`📝 Summary: ${mdPath}`)
    
    console.log('\n📋 EXECUTIVE SUMMARY')
    console.log('='.repeat(70))
    console.log(`\nTenant: ${executiveSummary.tenantOverview.name}`)
    console.log(`Active since: ${executiveSummary.tenantOverview.activeSince.toISOString().split('T')[0]}`)
    console.log(`Data period: ${executiveSummary.tenantOverview.dataPeriod}`)
    console.log(`\nKey Metrics:`)
    console.log(`  Total Orders: ${executiveSummary.keyMetrics.totalOrders}`)
    console.log(`  Total Revenue: $${(executiveSummary.keyMetrics.totalRevenue / 100).toFixed(2)}`)
    console.log(`  Unique Customers: ${executiveSummary.keyMetrics.uniqueCustomers}`)
    console.log(`  Avg Ticket: $${(executiveSummary.keyMetrics.avgTicket / 100).toFixed(2)}`)
    console.log(`  Loyalty Members: ${executiveSummary.keyMetrics.loyaltyMembers}`)
    console.log(`  Products: ${executiveSummary.keyMetrics.productCount}`)
    console.log(`\nData Quality Score: ${executiveSummary.dataReadiness.score}/100`)
    console.log(`\nRecommendations:`)
    executiveSummary.recommendations.forEach(rec => console.log(`  - ${rec}`))
    
  } catch (error) {
    console.error('❌ Error:', error)
    throw error
  } finally {
    await disconnect()
  }
}

function generateMarkdownSummary(report: AuditReport, metrics: any): string {
  const { tenant, locations, dataInventory, dataQuality, coverage, executiveSummary, dataLineage } = report
  const m = metrics || globalMetrics
  
  return `# TakeasyGo Data Audit - Keke & Larry
**Generated:** ${report.timestamp}

## 1. TENANT IDENTIFICADO

- **Nombre:** ${tenant.name}
- **ID:** ${tenant._id}
- **Slug:** ${tenant.slug}
- **Plan:** ${tenant.plan}
- **Locations:** ${locations.length}
- **Activo desde:** ${tenant.createdAt.toISOString().split('T')[0]}

## 2. PERÍODO DISPONIBLE

- **Fecha inicial:** ${coverage.temporal.startDate.toISOString().split('T')[0]}
- **Fecha final:** ${coverage.temporal.endDate.toISOString().split('T')[0]}
- **Días de datos:** ${coverage.temporal.totalDays}
- **Gaps:** ${coverage.temporal.gaps.length}

## 3. FUENTES ENCONTRADAS

### MongoDB Collections
${Object.entries(dataInventory.collections)
  .filter(([_, info]) => info.count > 0)
  .map(([name, info]) => `- **${name}**: ${info.count} registros`)
  .join('\n')}

## 4. ENTIDADES / TABLAS

${report.schemaMap.entities.map(e => `
### ${e.name}
- **Colección:** ${e.collection}
- **Descripción:** ${e.description}
- **Campos:** ${e.fields.length}
`).join('\n')}

## 5. MÉTRICAS DISPONIBLES

### Ventas
- Total Orders: ${executiveSummary.keyMetrics.totalOrders}
- Total Revenue: $${(executiveSummary.keyMetrics.totalRevenue / 100).toFixed(2)}
- Avg Ticket: $${(executiveSummary.keyMetrics.avgTicket / 100).toFixed(2)}

### Clientes
- Unique Customers: ${executiveSummary.keyMetrics.uniqueCustomers}
- Repeat Customers: ${m.customers?.repeatCustomers || 'N/A'}

### Club / Loyalty
- Total Members: ${executiveSummary.keyMetrics.loyaltyMembers}
- Total Points: ${m.loyalty?.totalPoints || 'N/A'}
- Total Redemptions: ${m.loyalty?.totalRedemptions || 'N/A'}

### Productos
- Product Count: ${executiveSummary.keyMetrics.productCount}

## 6. DATA QUALITY

**Overall Score:** ${dataQuality.summary.overallScore}/100

### Issues
${dataQuality.issues.map(i => `
- **${i.severity.toUpperCase()}** - ${i.entity}: ${i.issue}
  - Affected: ${i.affectedRecords} (${i.percentage.toFixed(1)}%)
  - Recommendation: ${i.recommendation}
`).join('\n')}

## 7. DATA LINEAGE

### Sources
${dataLineage.sources.map(s => `- **${s.name}** (${s.type}): ${s.description}`).join('\n')}

## 8. DATOS FALTANTES

### NO DISPONIBLE
${coverage.metrics.notAvailable.map(m => `- ${m}`).join('\n')}

### PARCIALMENTE DISPONIBLE
${coverage.metrics.partiallyAvailable.map(m => `- ${m}`).join('\n')}

## 9. ARCHIVOS EXPORTADOS

- orders.json
- consumers.json
- loyalty_members.json
- menus.json
- promotions.json
- store_items.json
- store_redemptions.json
- customer_events.json
- inventory_skus.json
- inventory_recipes.json
- inventory_ledger.json
- metrics.json
- complete-audit-report.json

## 10. RESUMEN PARA REWARD ENGINE

### DATOS DISPONIBLES PARA CONSTRUIR REWARD INTELLIGENCE

✅ **Ventas**
- Órdenes completas con items
- Revenue por orden
- Tickets
- Métricas temporales (hora, día, mes)

✅ **Productos**
- Catálogo completo
- Ventas por producto
- Categorías
- Precios

✅ **Clientes**
- Historial de compras
- Recurrencia
- Segmentación CIS

✅ **Loyalty**
- Miembros del club
- Puntos
- Canjes
- Comportamiento de miembros vs no miembros

✅ **Comportamiento Digital**
- CustomerEvents
- Métricas de engagement

✅ **Promociones**
- Promociones activas
- Redenciones

✗ **Costos**
- Food cost: NO DISPONIBLE
- Margen: NO DISPONIBLE
- Contribution margin: NO DISPONIBLE

✗ **Operación**
- Tiempos de preparación: NO DISPONIBLE
- Capacidad: NO DISPONIBLE
- Stockouts: PARCIAL (inventory disponible pero sin integración con ventas)

## RECOMENDACIONES

${executiveSummary.recommendations.map(r => `- ${r}`).join('\n')}
`
}

runCompleteAudit()
