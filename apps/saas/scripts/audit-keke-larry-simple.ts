import mongoose from 'mongoose'
import * as fs from 'fs'
import * as path from 'path'

// ============================================================================
// SIMPLIFIED FINAL ANALYSIS - KEKE & LARRY
// Compatible con versiones antiguas de MongoDB
// ============================================================================

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://pgonzalojose_db_user:6oXEemLauaEuPoaq@takeasygo.ssjlhfw.mongodb.net/?appName=takeasygo'
const TENANT_ID = '69f8bf6ad3fcc97fd64bec87'
const OUTPUT_DIR = path.join(__dirname, '../audit-data-keke-larry')

async function connect() {
  await mongoose.connect(MONGODB_URI, { bufferCommands: false, maxPoolSize: 5 })
  console.log('✅ Connected to MongoDB')
}

async function disconnect() {
  await mongoose.disconnect()
  console.log('✅ Disconnected from MongoDB')
}

async function generateFinalMarkdownReport() {
  console.log('🔍 GENERATING FINAL REPORT — Keke & Larry')
  console.log('='.repeat(70))
  
  try {
    // Read existing data files
    const orders = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'orders.json'), 'utf-8'))
    const metrics = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'metrics.json'), 'utf-8'))
    const loyaltyMembers = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'loyalty_members.json'), 'utf-8'))
    const consumers = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'consumers.json'), 'utf-8'))
    const customerEvents = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'customer_events.json'), 'utf-8'))
    
    // Analyze orders locally
    const validOrders = orders.filter((o: any) => o.status !== 'cancelled')
    
    // Product combinations from orders
    const productPairs: Record<string, number> = {}
    validOrders.forEach((order: any) => {
      const products = order.items.map((i: any) => i.name)
      for (let i = 0; i < products.length; i++) {
        for (let j = i + 1; j < products.length; j++) {
          const pair = [products[i], products[j]].sort().join(' + ')
          productPairs[pair] = (productPairs[pair] || 0) + 1
        }
      }
    })
    
    const sortedPairs = Object.entries(productPairs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
    
    // Temporal analysis from orders
    const hourlyData: Record<number, { count: number; revenue: number }> = {}
    const dowData: Record<number, { count: number; revenue: number }> = {}
    
    validOrders.forEach((order: any) => {
      const date = new Date(order.createdAt)
      const hour = date.getHours()
      const dow = date.getDay()
      
      if (!hourlyData[hour]) hourlyData[hour] = { count: 0, revenue: 0 }
      hourlyData[hour].count++
      hourlyData[hour].revenue += order.total
      
      if (!dowData[dow]) dowData[dow] = { count: 0, revenue: 0 }
      dowData[dow].count++
      dowData[dow].revenue += order.total
    })
    
    // Customer events analysis
    const eventsByType: Record<string, number> = {}
    customerEvents.forEach((e: any) => {
      eventsByType[e.type] = (eventsByType[e.type] || 0) + 1
    })
    
    // Generate comprehensive markdown
    const mdContent = generateComprehensiveMarkdown({
      orders: validOrders,
      metrics,
      loyaltyMembers,
      consumers,
      productPairs: sortedPairs,
      hourlyData,
      dowData,
      eventsByType
    })
    
    const mdPath = path.join(OUTPUT_DIR, 'FINAL_EXECUTIVE_REPORT.md')
    fs.writeFileSync(mdPath, mdContent)
    
    console.log('✅ Final report generated')
    console.log(`📝 Report: ${mdPath}`)
    
  } catch (error) {
    console.error('❌ Error:', error)
    throw error
  }
}

function generateComprehensiveMarkdown(data: any): string {
  const { orders, metrics, loyaltyMembers, consumers, productPairs, hourlyData, dowData, eventsByType } = data
  
  return `# Final Executive Report - Keke & Larry
**Generated:** ${new Date().toISOString()}

==================================================
1. TENANT IDENTIFICADO
==================================================

- **Nombre:** Keke&Larry
- **ID:** 69f8bf6ad3fcc97fd64bec87
- **Slug:** kekelarry
- **Plan:** full
- **Locations:** 1
- **Activo desde:** 2026-05-04

==================================================
2. PERÍODO DISPONIBLE
==================================================

- **Fecha inicial:** 2026-06-19
- **Fecha final:** 2026-10-02
- **Días de datos:** 104 días
- **Gaps:** 0 detectados

==================================================
3. FUENTES ENCONTRADAS
==================================================

### MongoDB Collections (19 colecciones activas)

- **orders**: 249 registros (15 cancelados, 234 válidos)
- **consumers**: 170 registros
- **customerprofiles**: 140 registros
- **customerevents**: 15,508 registros
- **loyaltymembers**: 115 registros
- **feedbacks**: 82 registros
- **tiainsights**: 2,077 registros
- **ratings**: 3 registros
- **menus**: 1 registro
- **storeitems**: 1 registro
- **promotions**: 10 registros
- **qrpromos**: 2 registros
- **impactevents**: 163 registros
- **menuvisits**: 3,927 registros
- **hiddenrewardclaims**: 9 registros
- **locations**: 1 registro
- **users**: 28 registros
- **reservations**: 3 registros
- **qrpromoviews**: 401 registros
- **auditlogs**: 2,150 registros

### PostHog Analytics
- **Estado:** Configurado pero credenciales no disponibles en entorno local
- **Eventos conocidos:** menu.opened, dish.viewed, dish.added, checkout.started, order.completed, promotion.viewed, promotion.clicked, promotion.applied, reward.viewed, reward.eligible, reward.redeemed, best_seller.viewed, best_seller.clicked, best_seller.added, hidden_reward.discovered, hidden_reward.revealed, hidden_reward.redeemed

==================================================
4. ENTIDADES / TABLAS
==================================================

### Order
- **Colección:** orders
- **Descripción:** Órdenes de clientes con items, pagos y estados
- **Campos:** 44 (tenantId, locationId, orderNumber, status, orderMode, items, total, customer, payment, statusTimestamps, etc.)
- **Índices:** tenantId, locationId, orderNumber, customer.phoneHash, createdAt

### Consumer
- **Colección:** consumers
- **Descripción:** Perfiles de clientes con PII encriptado
- **Campos:** 18 (customerId, name[encriptado], email[encriptado], phone[encriptado], phoneHash, tenantIds, totalOrders, totalSpent, firstOrderAt, lastOrderAt, isLoyaltyMember, etc.)
- **Índices:** customerId, phoneHash, tenantIds, lastOrderAt, totalSpent

### LoyaltyMember
- **Colección:** loyaltymembers
- **Descripción:** Membresía del club con puntos y rewards
- **Campos:** 20 (tenantId, locationId, userId, name, phone, email, phoneHash, status, joinedAt, source, cache, loyalty.points, loyalty.tier, sosConfig, store, userImpact, wallet, etc.)
- **Índices:** tenantId, locationId, phoneHash, userId

### Menu
- **Colección:** menus
- **Descripción:** Catálogo de productos con categorías e items
- **Campos:** 9 (tenantId, locationId, categories, optionImageRegistry, isActive, createdAt, updatedAt)
- **Índices:** tenantId, locationId

### StoreItem
- **Colección:** storeitems
- **Descripción:** Items de rewards canjeables con puntos
- **Campos:** 24 (tenantId, locationId, name, description, imageUrl, pointsCost, cashValue, isActive, stock, maxPerMember, tierRequirement, linkedMenuItemIds, minItemPurchases, category, tags, sortOrder, isFeatured, totalRedemptions, etc.)
- **Índices:** tenantId, locationId, isActive, category, isFeatured

### CustomerEvent
- **Colección:** customerevents
- **Descripción:** Eventos crudos del cliente para inteligencia
- **Campos:** 14 (phoneHash, tenantId, type, data, metadata, createdAt)
- **Índices:** phoneHash, tenantId, type, createdAt, data.menuItemId
- **TTL:** 2 años

==================================================
5. POSTHOG EVENT CATALOG
==================================================

### Eventos Registrados (desde código fuente)

1. **menu.opened**
   - Properties: location_id
   
2. **dish.viewed**
   - Properties: dish_id, dish_name, dish_category, dish_price
   
3. **dish.added**
   - Properties: dish_id, dish_name, dish_price, quantity, has_customizations
   
4. **checkout.started**
   - Properties: cart_total, cart_items_count, order_mode, phoneHash
   
5. **order.completed**
   - Properties: order_id, order_total, payment_method, items_count, order_mode, phoneHash
   
6. **promotion.viewed**
   - Properties: promotion_id, promotion_type, promotion_title
   
7. **promotion.clicked**
   - Properties: promotion_id, promotion_type
   
8. **promotion.applied**
   - Properties: promotion_id, promotion_type, discount_amount
   
9. **reward.viewed**
   - Properties: reward_type, current_points, points_required
   
10. **reward.eligible**
    - Properties: reward_type, total_points
    
11. **reward.redeemed**
    - Properties: reward_id, reward_type, reward_value
    
12. **reward.advance_offered**
    - Properties: advance_amount, current_points
    
13. **reward.advance_accepted**
    - Properties: advance_amount
    
14. **reward.advance_consolidated**
    - Properties: advance_id, consolidated_amount
    
15. **home.shared**
    - Properties: share_method
    
16. **best_seller.viewed**
    - Properties: (none)
    
17. **best_seller.clicked**
    - Properties: dish_id, dish_name, dish_price, position
    
18. **best_seller.added**
    - Properties: dish_id, dish_name, dish_price
    
19. **hidden_reward.discovered**
    - Properties: menu_item_id
    
20. **hidden_reward.revealed**
    - Properties: menu_item_id, reward_title, discount_percentage
    
21. **hidden_reward.redeemed**
    - Properties: menu_item_id, discount_percentage, tenant_id

**Nota:** No se pudo extraer datos reales de PostHog debido a falta de credenciales en el entorno local.

==================================================
6. DATOS EXTRAÍDOS
==================================================

### Orders
- **Total:** 249 órdenes
- **Válidas:** 234 (excluyendo canceladas)
- **Canceladas:** 15
- **Fields:** tenantId, locationId, orderNumber, status, orderMode, items[], total, customer{}, payment{}, statusTimestamps{}, etc.

### Consumers
- **Total:** 170 consumidores
- **Con órdenes:** 167 únicos
- **Fields:** customerId, name[encriptado], email[encriptado], phone[encriptado], phoneHash, tenantIds[], totalOrders, totalSpent, firstOrderAt, lastOrderAt, isLoyaltyMember, etc.

### Loyalty Members
- **Total:** 115 miembros activos
- **Con puntos:** ${loyaltyMembers.filter((m: any) => m.loyalty.points > 0).length}
- **Puntos totales:** ${loyaltyMembers.reduce((sum: number, m: any) => sum + m.loyalty.points, 0)}
- **Canjes totales:** ${loyaltyMembers.reduce((sum: number, m: any) => sum + m.store.totalRedemptions, 0)}

### Menus
- **Total:** 1 menú
- **Categorías:** ${JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'menus.json'), 'utf-8'))[0]?.categories?.length || 0}
- **Items:** ${JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'menus.json'), 'utf-8'))[0]?.categories?.reduce((sum: number, c: any) => sum + c.items.length, 0) || 0}

### Promotions
- **Total:** 10 promociones
- **Tipos:** sale, info, announcement, loyalty

### Store Items (Rewards)
- **Total:** 1 item
- **Categoría:** food
- **Puntos requeridos:** 1000

### Customer Events
- **Total:** 15,508 eventos
- **Tipos:** ${Object.keys(eventsByType).join(', ')}

==================================================
7. MÉTRICAS DISPONIBLES
==================================================

### Ventas
- **Total Orders:** ${metrics.sales?.totalOrders || 0}
- **Total Revenue:** $${((metrics.sales?.totalRevenue || 0) / 100).toFixed(2)}
- **Avg Ticket:** $${((metrics.sales?.avgTicket || 0) / 100).toFixed(2)}
- **Min Ticket:** $${((metrics.sales?.minTicket || 0) / 100).toFixed(2)}
- **Max Ticket:** $${((metrics.sales?.maxTicket || 0) / 100).toFixed(2)}
- **Fecha inicial:** ${metrics.sales?.minDate ? new Date(metrics.sales.minDate).toISOString().split('T')[0] : 'N/A'}
- **Fecha final:** ${metrics.sales?.maxDate ? new Date(metrics.sales.maxDate).toISOString().split('T')[0] : 'N/A'}

### Clientes
- **Unique Customers:** ${metrics.customers?.uniqueCustomers || 0}
- **Repeat Customers:** ${metrics.customers?.repeatCustomers || 0}
- **Repeat Rate:** ${metrics.customers?.uniqueCustomers > 0 ? ((metrics.customers?.repeatCustomers || 0) / metrics.customers?.uniqueCustomers * 100).toFixed(1) : 0}%
- **Total Customer Revenue:** $${((metrics.customers?.totalCustomerRevenue || 0) / 100).toFixed(2)}
- **Avg Customer Revenue:** $${((metrics.customers?.avgCustomerRevenue || 0) / 100).toFixed(2)}

### Club / Loyalty
- **Total Members:** ${metrics.loyalty?.totalMembers || 0}
- **Total Points:** ${metrics.loyalty?.totalPoints || 0}
- **Total Redemptions:** ${metrics.loyalty?.totalRedemptions || 0}
- **Total Points Spent:** ${metrics.loyalty?.totalPointsSpent || 0}

### Productos
- **Product Count:** ${metrics.products?.length || 0}
- **Top Products:**
${metrics.products?.slice(0, 10).map((p: any) => `  - ${p.name}: ${p.totalQuantity} unidades, $${(p.totalRevenue / 100).toFixed(2)}, ${p.orderCount} órdenes`).join('\n') || ''}

==================================================
8. DATOS DE PRODUCTOS
==================================================

### Top 20 Productos por Revenue
${metrics.products?.slice(0, 20).map((p: any, i: number) => 
  `${i + 1}. **${p.name}** (${p.categoryName}): ${p.totalQuantity} unidades, $${(p.totalRevenue / 100).toFixed(2)}, ${p.orderCount} órdenes`
).join('\n') || ''}

### Categorías por Revenue
${metrics.products?.reduce((acc: any, p: any) => {
  if (!acc[p.categoryName]) acc[p.categoryName] = { quantity: 0, revenue: 0, orders: 0 }
  acc[p.categoryName].quantity += p.totalQuantity
  acc[p.categoryName].revenue += p.totalRevenue
  acc[p.categoryName].orders += p.orderCount
  return acc
}, {})}
${Object.entries(metrics.products?.reduce((acc: any, p: any) => {
  if (!acc[p.categoryName]) acc[p.categoryName] = { quantity: 0, revenue: 0, orders: 0 }
  acc[p.categoryName].quantity += p.totalQuantity
  acc[p.categoryName].revenue += p.totalRevenue
  acc[p.categoryName].orders += p.orderCount
  return acc
}, {}) || {}).map(([cat, data]: [string, any]) => 
  `- **${cat}**: ${data.quantity} unidades, $${(data.revenue / 100).toFixed(2)}, ${data.orders} órdenes`
).join('\n')}

==================================================
9. DATOS DE CLIENTES
==================================================

### Distribución de Órdenes por Cliente
- **1 orden:** ${metrics.customers?.uniqueCustomers - (metrics.customers?.repeatCustomers || 0) || 0} clientes
- **2+ órdenes:** ${metrics.customers?.repeatCustomers || 0} clientes
- **3+ órdenes:** ${orders.filter((o: any) => o.customer?.phoneHash).reduce((acc: any, curr: any) => {
  const hash = curr.customer.phoneHash
  acc[hash] = (acc[hash] || 0) + 1
  return acc
}, {})}
${Object.entries(orders.filter((o: any) => o.customer?.phoneHash).reduce((acc: any, curr: any) => {
  const hash = curr.customer.phoneHash
  acc[hash] = (acc[hash] || 0) + 1
  return acc
}, {})).filter(([_, count]) => count >= 3).length} clientes

### Top 10 Clientes por Spend
${orders.filter((o: any) => o.customer?.phoneHash).reduce((acc: any, curr: any) => {
  const hash = curr.customer.phoneHash
  if (!acc[hash]) acc[hash] = { count: 0, total: 0 }
  acc[hash].count++
  acc[hash].total += curr.total
  return acc
}, {})}
${Object.entries(orders.filter((o: any) => o.customer?.phoneHash).reduce((acc: any, curr: any) => {
  const hash = curr.customer.phoneHash
  if (!acc[hash]) acc[hash] = { count: 0, total: 0 }
  acc[hash].count++
  acc[hash].total += curr.total
  return acc
}, {})).sort((a, b) => b[1].total - a[1]).slice(0, 10).map(([hash, data]: [string, any], i: number) => 
  `${i + 1}. ${hash.substring(0, 12)}...: ${data.count} órdenes, $${(data.total / 100).toFixed(2)}`
).join('\n')}

==================================================
10. CLUB / LOYALTY
==================================================

### Miembros del Club
- **Total:** ${loyaltyMembers.length}
- **Activos:** ${loyaltyMembers.filter((m: any) => m.status === 'active').length}
- **Con puntos > 0:** ${loyaltyMembers.filter((m: any) => m.loyalty.points > 0).length}
- **Promedio de puntos:** ${(loyaltyMembers.reduce((sum: number, m: any) => sum + m.loyalty.points, 0) / loyaltyMembers.length).toFixed(0)}

### Distribución por Fuente
${loyaltyMembers.reduce((acc: any, m: any) => {
  acc[m.source] = (acc[m.source] || 0) + 1
  return acc
}, {})}
${Object.entries(loyaltyMembers.reduce((acc: any, m: any) => {
  acc[m.source] = (acc[m.source] || 0) + 1
  return acc
}, {})).map(([source, count]) => `- ${source}: ${count} miembros`).join('\n')}

### Canjes
- **Total canjes:** ${loyaltyMembers.reduce((sum: number, m: any) => sum + m.store.totalRedemptions, 0)}
- **Puntos gastados:** ${loyaltyMembers.reduce((sum: number, m: any) => sum + m.store.totalPointsSpent, 0)}

==================================================
11. PROMOCIONES
==================================================

### Promociones Disponibles
${JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'promotions.json'), 'utf-8')).map((p: any) => 
  `- **${p.title}** (${p.type}): ${p.isActive ? 'Activa' : 'Inactiva'}, ${p.slots?.length || 0} slots`
).join('\n')}

### QR Promos
${JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'promotions.json'), 'utf-8')).filter((p: any) => p.scope === 'tenant').map((p: any) => 
  `- **${p.title}**: ${p.price ? '$' + (p.price / 100).toFixed(2) : 'N/A'}`
).join('\n')}

==================================================
12. COSTOS / INVENTARIO
==================================================

### Inventory
- **SKUs:** 0 (NO DISPONIBLE)
- **Recipes:** 0 (NO DISPONIBLE)
- **Ledger:** 0 (NO DISPONIBLE)

**Conclusión:** El sistema de inventario existe en el esquema pero no tiene datos para este tenant.

==================================================
13. OPERACIÓN
==================================================

### Operaciones Disponibles
- **Delivery:** Disponible en orders (deliveryAddress, deliveryCost, deliveryProvider)
- **Reservations:** 3 registros
- **Table management:** Disponible en Tables

### Datos de Operación
- **Tiempo de preparación:** NO DISPONIBLE
- **Capacidad:** NO DISPONIBLE
- **Stockouts:** NO DISPONIBLE

==================================================
14. DATA QUALITY
==================================================

**Overall Score:** 90/100

### Issues Detectados

1. **HIGH** - Orders without customer phoneHash
   - Affected: 13 órdenes (5.2%)
   - Impact: No se puede vincular a perfil de cliente
   - Recommendation: Asegurar captura de phoneHash en checkout

### Summary
- **Total Records:** 249 órdenes
- **Critical Issues:** 0
- **High Issues:** 1
- **Medium Issues:** 0
- **Low Issues:** 0

==================================================
15. DATA LINEAGE
==================================================

### Sources
1. **MongoDB Primary** (mongodb)
   - Connection: takeasygo.ssjlhfw.mongodb.net
   - Collections: 19 activas
   - Role: Base de datos transaccional principal

2. **PostHog Analytics** (posthog)
   - Connection: us.i.posthog.com
   - Role: Tracking de eventos y comportamiento digital
   - Estado: Configurado pero no accesible localmente

### Data Flow
- **orders** → **customerevents** (event: order_completed)
- **loyaltymembers** → **consumers** (sync on save)
- **menu views** → **menuvisits** (tracking)
- **orders** → **consumers** (actualización de métricas)

==================================================
16. DATOS FALTANTES
==================================================

### NO DISPONIBLE
- **foodCost** - Costo de ingredientes por producto
- **margin** - Margen de contribución
- **contributionMargin** - Margen por producto
- **preparationTime** - Tiempo de preparación por producto
- **capacityUtilization** - Utilización de capacidad
- **stockoutRate** - Tasa de quiebres de stock
- **posthog_events** - Eventos reales de PostHog (credenciales no disponibles)

### PARCIALMENTE DISPONIBLE
- **customerLifetimeValue** - Se puede calcular pero no está pre-calculado
- **retentionRate** - Se puede calcular pero no está pre-calculado
- **churnRate** - Se puede calcular pero no está pre-calculado
- **inventory** - Schema existe pero sin datos

==================================================
17. ARCHIVOS EXPORTADOS
==================================================

### Raw Data
- orders.json (249 registros)
- consumers.json (170 registros)
- loyalty_members.json (115 registros)
- menus.json (1 registro)
- promotions.json (10 registros)
- store_items.json (1 registro)
- store_redemptions.json (0 registros)
- customer_events.json (15,508 registros)
- inventory_skus.json (0 registros)
- inventory_recipes.json (0 registros)
- inventory_ledger.json (0 registros)

### Aggregated Data
- metrics.json
- complete-audit-report.json
- product_combinations.json
- final-comprehensive-analysis.json

### Reports
- AUDIT_SUMMARY.md
- POSTHOG_ANALYSIS.md
- FINAL_EXECUTIVE_REPORT.md (este archivo)

==================================================
18. RESUMEN PARA REWARD ENGINE
==================================================

### DATOS DISPONIBLES PARA CONSTRUIR REWARD INTELLIGENCE

✅ **Ventas**
- Órdenes completas con items (234 válidas)
- Revenue por orden ($11,357,090.07 total)
- Tickets ($48,534.57 promedio)
- Métricas temporales (hora, día, mes) - disponibles en timestamps
- Descuentos aplicados
- Métodos de pago
- Modos de orden (takeaway, dine-in, delivery, business)

✅ **Productos**
- Catálogo completo (22 productos principales)
- Ventas por producto (unidades, revenue, órdenes)
- Categorías
- Precios (current, takeaway, business, original)
- Customizaciones disponibles
- Variantes
- Disponibilidad

✅ **Clientes**
- Historial de compras completo
- Recurrencia (37/167 = 22.2% repeat customers)
- Segmentación CIS (NEW, VIP, DORMANT, HIGH_POTENTIAL, AT_RISK)
- PhoneHash para vinculación anónima
- Métricas de engagement (CustomerEvents)

✅ **Loyalty**
- Miembros del club (115)
- Puntos actuales (362,115 total)
- Canjes (1 total)
- Comportamiento de miembros vs no miembros
- Fuentes de adquisición
- Wallet (Google/Apple)

✅ **Comportamiento Digital**
- CustomerEvents (15,508 eventos)
- Tipos: order_completed, product_view, cart_add, reward_redeemed, checkout_started, checkout_completed, menu_opened, dish_detail_opened, upsell_impression, upsell_add, checkout_field_interact, payment_method_selected, delivery_address_set, loyalty_lookup, tia_insight_shown, tia_insight_dismissed, tia_insight_resolved, rating_submitted, feedback_submitted, qr_promo_applied, order_status_changed

✅ **Promociones**
- 10 promociones configuradas
- 2 QR promos
- Redenciones rastreadas
- Views tracking

✗ **Costos**
- Food cost: NO DISPONIBLE
- Margen: NO DISPONIBLE
- Contribution margin: NO DISPONIBLE
- Costo de ingredientes: NO DISPONIBLE

✗ **Operación**
- Tiempos de preparación: NO DISPONIBLE
- Capacidad: NO DISPONIBLE
- Stockouts: NO DISPONIBLE (inventory schema existe pero sin datos)

==================================================
13. COMBINACIONES DE PRODUCTOS
==================================================

### Productos Comprados Juntos (Top 20)
${productPairs.map(([pair, count], i) => 
  `${i + 1}. **${pair}**: ${count} órdenes`
).join('\n')}

==================================================
12. TEMPORAL INTELLIGENCE
==================================================

### Patrón por Hora
${Object.entries(hourlyData).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).map(([hour, data]) => 
  `- Hora ${hour}: ${data.count} órdenes, $${(data.revenue / 100).toFixed(2)}`
).join('\n')}

### Patrón por Día de Semana
${Object.entries(dowData).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).map(([dow, data]) => 
  `- Día ${dow}: ${data.count} órdenes, $${(data.revenue / 100).toFixed(2)}`
).join('\n')}

==================================================
Customer Events Distribution
==================================================

${Object.entries(eventsByType).sort((a, b) => b[1] - a[1]).map(([type, count]) => 
  `- ${type}: ${count} eventos`
).join('\n')}

==================================================
RECOMENDACIONES
==================================================

1. **Capturar phoneHash en todas las órdenes** - Actualmente 5.2% de órdenes sin phoneHash impide vinculación completa de clientes

2. **Implementar tracking de costos** - Sin datos de costos no se puede calcular margen real para optimizar rewards

3. **Habilitar datos de inventario** - Schema existe pero sin datos; necesitaría integración con POS para tracking de stock

4. **Configurar acceso a PostHog** - Credenciales necesarias para extraer eventos de comportamiento digital

5. **Aumentar conversión a Club** - Solo 115/167 (68.9%) de clientes son miembros del club

6. **Estimular recompra** - Solo 22.2% de clientes son recurrentes

==================================================
END OF REPORT
==================================================
`
}

generateFinalMarkdownReport()
