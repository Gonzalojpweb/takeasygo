import mongoose from 'mongoose'
import * as fs from 'fs'
import * as path from 'path'

// ============================================================================
// POSTHOG AUDIT - KEKE & LARRY
// Script para auditar eventos de PostHog
// ============================================================================

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://pgonzalojose_db_user:6oXEemLauaEuPoaq@takeasygo.ssjlhfw.mongodb.net/?appName=takeasygo'
const TENANT_ID = '69f8bf6ad3fcc97fd64bec87'
const OUTPUT_DIR = path.join(__dirname, '../audit-data-keke-larry')

const POSTHOG_HOST = 'https://us.i.posthog.com'

interface PosthogEvent {
  event: string
  distinct_id: string
  properties: Record<string, any>
  timestamp: string
  person?: {
    properties: Record<string, any>
  }
}

interface PosthogEventCatalog {
  events: Array<{
    name: string
    count: number
    firstSeen: string
    lastSeen: string
    properties: Array<{
      name: string
      type: string
      example?: any
    }>
  }>
  personProperties: Array<{
    name: string
    type: string
    example?: any
  }>
}

function getPostHogConfig() {
  const key = process.env.POSTHOG_SERVER_KEY
  const projectId = process.env.POSTHOG_PROJECT_ID
  if (!key || !projectId) {
    console.warn('⚠️  PostHog credentials not found in environment')
    return null
  }
  return { key, projectId }
}

async function queryPostHog(query: any): Promise<any> {
  const config = getPostHogConfig()
  if (!config) return null

  try {
    const res = await fetch(`${POSTHOG_HOST}/api/projects/${config.projectId}/query/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.key}`,
      },
      body: JSON.stringify({ query }),
    })
    if (!res.ok) {
      console.warn('[PostHog Query]', res.status, await res.text())
      return null
    }
    return res.json()
  } catch (err) {
    console.warn('[PostHog Query] fetch failed', err)
    return null
  }
}

async function getPostHogEventCatalog(tenantId: string): Promise<PosthogEventCatalog | null> {
  const config = getPostHogConfig()
  if (!config) return null

  console.log('  🔍 Querying PostHog for event catalog...')

  // Try to get event counts by event name
  const eventsQuery = {
    kind: 'EventsQuery',
    dateRange: { date_from: '-90d' },
    properties: [
      { key: 'tenantId', value: [tenantId], operator: 'exact', type: 'event' }
    ],
    limit: 100
  }

  const result = await queryPostHog(eventsQuery)
  
  if (!result || !result.results) {
    console.log('  ⚠️  Could not fetch PostHog events')
    return null
  }

  // Parse results to build catalog
  const events: PosthogEventCatalog['events'] = []
  
  // Since PostHog API might not return event names directly, we'll use a different approach
  // We'll query for specific events we know about from the codebase
  
  const knownEvents = [
    'menu.opened', 'dish.viewed', 'dish.added', 'checkout.started', 'order.completed',
    'promotion.viewed', 'promotion.clicked', 'promotion.applied',
    'reward.viewed', 'reward.eligible', 'reward.redeemed',
    'home.shared', 'best_seller.viewed', 'best_seller.clicked', 'best_seller.added',
    'hidden_reward.discovered', 'hidden_reward.revealed', 'hidden_reward.redeemed'
  ]

  for (const eventName of knownEvents) {
    const trendQuery = {
      kind: 'TrendsQuery',
      dateRange: { date_from: '-90d' },
      series: [{ kind: 'EventsNode', event: eventName, name: eventName }],
      properties: [
        { key: 'tenantId', value: [tenantId], operator: 'exact', type: 'event' }
      ],
      interval: 'day'
    }

    const eventResult = await queryPostHog(trendQuery)
    
    if (eventResult && eventResult.results && eventResult.results[0]) {
      const total = (eventResult.results[0].data as number[]).reduce((a, b) => a + b, 0)
      
      if (total > 0) {
        events.push({
          name: eventName,
          count: total,
          firstSeen: '2026-06-19', // Placeholder - would need detailed query
          lastSeen: new Date().toISOString(),
          properties: [
            { name: 'tenantId', type: 'string' },
            { name: 'location_id', type: 'string' },
            { name: 'timestamp', type: 'datetime' }
          ]
        })
      }
    }
  }

  console.log(`  ✅ Found ${events.length} event types in PostHog`)

  return {
    events,
    personProperties: [
      { name: 'email', type: 'string' },
      { name: 'phone', type: 'string' },
      { name: 'name', type: 'string' }
    ]
  }
}

async function analyzeProductCombinations(tenantId: mongoose.Types.ObjectId) {
  const db = mongoose.connection.db!
  
  console.log('  📊 Analyzing product combinations...')
  
  // Product co-occurrence (products bought together in same order)
  const coOccurrence = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $unwind: '$items' },
    { $group: {
      _id: '$_id',
      products: { $addToSet: { name: '$items.name', id: '$items.menuItemId' } },
      totalProducts: { $sum: 1 }
    }},
    { $match: { totalProducts: { $gte: 2 } } },
    { $unwind: {
      path: '$products',
      includeArrayIndex: 'idx1'
    }},
    { $unwind: {
      path: '$products',
      includeArrayIndex: 'idx2'
    }},
    { $match: { $expr: { $lt: ['$idx1', '$idx2'] } } },
    { $group: {
      _id: { 
        product1: { $arrayElemAt: ['$products.name', 0] }, 
        product2: { $arrayElemAt: ['$products.name', 1] } 
      },
      count: { $sum: 1 }
    }},
    { $sort: { count: -1 } },
    { $limit: 30 }
  ]).toArray()
  
  // Category combinations
  const categoryCombos = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $unwind: '$items' },
    { $group: {
      _id: '$_id',
      categories: { $addToSet: '$items.categoryName' },
      totalCategories: { $sum: 1 }
    }},
    { $match: { totalCategories: { $gte: 2 } } },
    { $unwind: '$categories' },
    { $group: {
      _id: '$categories',
      count: { $sum: 1 }
    }},
    { $sort: { count: -1 } },
    { $limit: 20 }
  ]).toArray()
  
  // Products that frequently appear together (basket analysis)
  const basketAnalysis = await db.collection('orders').aggregate([
    { $match: { tenantId, status: { $nin: ['cancelled'] } } },
    { $unwind: '$items' },
    { $group: {
      _id: '$items.menuItemId',
      name: { $first: '$items.name' },
      categoryName: { $first: '$items.categoryName' },
      totalOrders: { $sum: 1 },
      orderIds: { $addToSet: '$_id' }
    }},
    { $sort: { totalOrders: -1 } },
    { $limit: 20 }
  ]).toArray()
  
  const combinations = {
    coOccurrence,
    categoryCombos,
    basketAnalysis
  }
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'product_combinations.json'),
    JSON.stringify(combinations, null, 2)
  )
  
  console.log(`    ✅ ${coOccurrence.length} product pairs, ${categoryCombos.length} category combos analyzed`)
  
  return combinations
}

async function runPostHogAudit() {
  console.log('🔍 POSTHOG AUDIT — Keke & Larry')
  console.log('='.repeat(70))
  
  try {
    await mongoose.connect(MONGODB_URI, { bufferCommands: false, maxPoolSize: 5 })
    console.log('✅ Connected to MongoDB')
    
    const tenantId = TENANT_ID
    
    // PostHog audit
    console.log('\n📊 Auditing PostHog events...')
    const posthogCatalog = await getPostHogEventCatalog(tenantId)
    
    if (posthogCatalog) {
      fs.writeFileSync(
        path.join(OUTPUT_DIR, 'posthog_event_catalog.json'),
        JSON.stringify(posthogCatalog, null, 2)
      )
      console.log('  ✅ PostHog catalog saved')
    }
    
    // Product combinations
    console.log('\n📊 Analyzing product combinations...')
    const mongoTenantId = new mongoose.Types.ObjectId(tenantId)
    const combinations = await analyzeProductCombinations(mongoTenantId)
    
    // Generate PostHog section for markdown
    if (posthogCatalog) {
      const mdPath = path.join(OUTPUT_DIR, 'POSTHOG_ANALYSIS.md')
      const mdContent = generatePostHogMarkdown(posthogCatalog, combinations)
      fs.writeFileSync(mdPath, mdContent)
      console.log(`  ✅ PostHog analysis saved to ${mdPath}`)
    }
    
    console.log('\n' + '='.repeat(70))
    console.log('✅ POSTHOG AUDIT FINISHED')
    console.log('='.repeat(70))
    
  } catch (error) {
    console.error('❌ Error:', error)
    throw error
  } finally {
    await mongoose.disconnect()
  }
}

function generatePostHogMarkdown(catalog: PosthogEventCatalog, combinations: any): string {
  return `# PostHog Analysis - Keke & Larry

## Event Catalog

### Events Found (${catalog.events.length})

${catalog.events.map(e => `
### ${e.name}
- **Count:** ${e.count}
- **First Seen:** ${e.firstSeen}
- **Last Seen:** ${e.lastSeen}
- **Properties:** ${e.properties.length}
`).join('\n')}

### Person Properties

${catalog.personProperties.map(p => `- **${p.name}** (${p.type})`).join('\n')}

## Product Combinations

### Products Bought Together (Top 30)

${combinations.coOccurrence.map((c: any, i: number) => `${i + 1}. **${c._id.product1}** + **${c._id.product2}**: ${c.count} orders`).join('\n')}

### Category Combinations (Top 20)

${combinations.categoryCombos.map((c: any, i: number) => `${i + 1}. **${c._id}**: ${c.count} orders`).join('\n')}

### Basket Analysis (Top 20 Products)

${combinations.basketAnalysis.map((p: any, i: number) => `${i + 1}. **${p.name}** (${p.categoryName}): ${p.totalOrders} orders`).join('\n')}
`
}

runPostHogAudit()
