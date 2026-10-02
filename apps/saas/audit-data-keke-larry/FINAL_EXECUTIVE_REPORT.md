# Final Executive Report - Keke & Larry
**Generated:** 2026-10-02T23:17:54.514Z

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
- **Con puntos:** 105
- **Puntos totales:** 362115
- **Canjes totales:** 1

### Menus
- **Total:** 1 menú
- **Categorías:** 5
- **Items:** 23

### Promotions
- **Total:** 10 promociones
- **Tipos:** sale, info, announcement, loyalty

### Store Items (Rewards)
- **Total:** 1 item
- **Categoría:** food
- **Puntos requeridos:** 1000

### Customer Events
- **Total:** 15,508 eventos
- **Tipos:** product_view, order_completed, signal_detected, health_score_changed, segment_changed

==================================================
7. MÉTRICAS DISPONIBLES
==================================================

### Ventas
- **Total Orders:** 234
- **Total Revenue:** $11357090.07
- **Avg Ticket:** $48534.57
- **Min Ticket:** $0.00
- **Max Ticket:** $0.00
- **Fecha inicial:** 2026-06-19
- **Fecha final:** 2026-10-02

### Clientes
- **Unique Customers:** 167
- **Repeat Customers:** 37
- **Repeat Rate:** 22.2%
- **Total Customer Revenue:** $11357090.07
- **Avg Customer Revenue:** $68006.53

### Club / Loyalty
- **Total Members:** 115
- **Total Points:** 362115
- **Total Redemptions:** 1
- **Total Points Spent:** 12990

### Productos
- **Product Count:** 22
- **Top Products:**
  - TYRON: 94 unidades, $1803000.00, 86 órdenes
  - ZEBALLON CRISPY: 75 unidades, $1581650.00, 69 órdenes
  - KHEBURGER: 66 unidades, $1302000.00, 63 órdenes
  - YSIBOOM: 48 unidades, $1036800.00, 43 órdenes
  - JEEZY: 47 unidades, $957250.00, 46 órdenes
  - ACRI: 45 unidades, $827350.00, 40 órdenes
  - 🍔 2 RABREK DOBLES: 14 unidades, $625400.00, 13 órdenes
  - DUKING: 28 unidades, $600400.00, 26 órdenes
  - RABREK: 29 unidades, $590150.00, 28 órdenes
  - SAINTLUNA: 20 unidades, $434000.00, 19 órdenes

==================================================
8. DATOS DE PRODUCTOS
==================================================

### Top 20 Productos por Revenue
1. **TYRON** (Burgas): 94 unidades, $1803000.00, 86 órdenes
2. **ZEBALLON CRISPY** (Burgas): 75 unidades, $1581650.00, 69 órdenes
3. **KHEBURGER** (Burgas): 66 unidades, $1302000.00, 63 órdenes
4. **YSIBOOM** (Burgas): 48 unidades, $1036800.00, 43 órdenes
5. **JEEZY** (Burgas): 47 unidades, $957250.00, 46 órdenes
6. **ACRI** (Burgas): 45 unidades, $827350.00, 40 órdenes
7. **🍔 2 RABREK DOBLES** (): 14 unidades, $625400.00, 13 órdenes
8. **DUKING** (Burgas): 28 unidades, $600400.00, 26 órdenes
9. **RABREK** (Burgas): 29 unidades, $590150.00, 28 órdenes
10. **SAINTLUNA** (Burgas): 20 unidades, $434000.00, 19 órdenes
11. **LARRY MOB** (Burgas): 16 unidades, $311000.00, 16 órdenes
12. **BarderiTo$** (Nuggets): 18 unidades, $199750.00, 18 órdenes
13. **Papas Crew** (Papas): 11 unidades, $130000.00, 11 órdenes
14. **Papas Clásicas** (Papas): 17 unidades, $116000.00, 16 órdenes
15. **MOMO SAMP** (Burgas): 5 unidades, $106700.00, 5 órdenes
16. **Pepsi** (Bebidas): 15 unidades, $52500.00, 11 órdenes
17. **PAPAS SAZONADAS** (Papas): 7 unidades, $49000.00, 6 órdenes
18. **Poliamok** (Empanadas): 3 unidades, $36750.00, 3 órdenes
19. **7UP** (Bebidas): 4 unidades, $14000.00, 3 órdenes
20. **Andes Rubia** (Bebidas): 2 unidades, $7000.00, 1 órdenes

### Categorías por Revenue
[object Object]
- **Burgas**: 473 unidades, $9550300.00, 441 órdenes
- ****: 14 unidades, $625400.00, 13 órdenes
- **Nuggets**: 18 unidades, $199750.00, 18 órdenes
- **Papas**: 35 unidades, $295000.00, 33 órdenes
- **Bebidas**: 24 unidades, $84000.00, 17 órdenes
- **Empanadas**: 3 unidades, $36750.00, 3 órdenes

==================================================
9. DATOS DE CLIENTES
==================================================

### Distribución de Órdenes por Cliente
- **1 orden:** 130 clientes
- **2+ órdenes:** 37 clientes
- **3+ órdenes:** [object Object]
16 clientes

### Top 10 Clientes por Spend
[object Object]
1. 99ffcddeefb6...: 1 órdenes, $20450.00
2. e8187cf21327...: 1 órdenes, $20450.00
3. f20043140b2f...: 1 órdenes, $101850.00
4. 76b0a3399c9a...: 3 órdenes, $94000.00
5. 27f5302d9031...: 1 órdenes, $37950.00
6. 1346b199fd17...: 1 órdenes, $86250.00
7. 79cc3aa05af6...: 2 órdenes, $85652.50
8. af854dc77e40...: 3 órdenes, $105250.00
9. a7d7058a07ae...: 1 órdenes, $47450.00
10. 3902e858d2be...: 1 órdenes, $36450.00

==================================================
10. CLUB / LOYALTY
==================================================

### Miembros del Club
- **Total:** 115
- **Activos:** 115
- **Con puntos > 0:** 105
- **Promedio de puntos:** 3149

### Distribución por Fuente
[object Object]
- checkout: 81 miembros
- promotion: 21 miembros
- explore: 13 miembros

### Canjes
- **Total canjes:** 1
- **Puntos gastados:** 12990

==================================================
11. PROMOCIONES
==================================================

### Promociones Disponibles
- **🍔 3 ZEBALLON DOBLES** (sale): Activa, 1 slots
- **🍔 2 LARRY MOB** (sale): Activa, 1 slots
- **LA DATA BUENA PASA POR EL CLUB.** (loyalty): Activa, 0 slots
- **🍔 2 DUKING DOBLES** (sale): Activa, 1 slots
- **🍔 3 TYRON** (sale): Activa, 1 slots
- **🍔 ACR1 + TYRON + BEBIDAS** (sale): Activa, 1 slots
- **🍔 3 YSIBOOM** (sale): Activa, 1 slots
- **🍔 2 JEEZY SIMPLES — $34.000** (sale): Activa, 1 slots
- **🍔 2 RABREK DOBLES** (sale): Activa, 1 slots
- **LAS MAS PEDIDAS. YA LO SABES!** (sale): Activa, 1 slots

### QR Promos
- **🍔 3 ZEBALLON DOBLES**: $59000.00
- **🍔 2 LARRY MOB**: $35000.00
- **LA DATA BUENA PASA POR EL CLUB.**: N/A
- **🍔 2 DUKING DOBLES**: $40000.00
- **🍔 3 TYRON**: $53500.00
- **🍔 ACR1 + TYRON + BEBIDAS**: $36500.00
- **🍔 3 YSIBOOM**: $60000.00
- **🍔 2 JEEZY SIMPLES — $34.000**: $34000.00
- **🍔 2 RABREK DOBLES**: $38500.00
- **LAS MAS PEDIDAS. YA LO SABES!**: $6000.00

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
1. **KHEBURGER + TYRON**: 28 órdenes
2. **TYRON + ZEBALLON CRISPY**: 25 órdenes
3. **KHEBURGER + ZEBALLON CRISPY**: 23 órdenes
4. **ACRI + TYRON**: 17 órdenes
5. **KHEBURGER + KHEBURGER**: 16 órdenes
6. **ACRI + KHEBURGER**: 16 órdenes
7. **JEEZY + KHEBURGER**: 12 órdenes
8. **YSIBOOM + ZEBALLON CRISPY**: 11 órdenes
9. **JEEZY + RABREK**: 10 órdenes
10. **KHEBURGER + YSIBOOM**: 10 órdenes
11. **KHEBURGER + Papas Clásicas**: 9 órdenes
12. **TYRON + TYRON**: 9 órdenes
13. **ZEBALLON CRISPY + ZEBALLON CRISPY**: 8 órdenes
14. **TYRON + YSIBOOM**: 8 órdenes
15. **ACRI + ZEBALLON CRISPY**: 8 órdenes
16. **JEEZY + JEEZY**: 8 órdenes
17. **DUKING + ZEBALLON CRISPY**: 8 órdenes
18. **BarderiTo$ + YSIBOOM**: 8 órdenes
19. **JEEZY + ZEBALLON CRISPY**: 7 órdenes
20. **RABREK + ZEBALLON CRISPY**: 7 órdenes

==================================================
12. TEMPORAL INTELLIGENCE
==================================================

### Patrón por Hora
- Hora 11: 1 órdenes, $36450.00
- Hora 12: 8 órdenes, $738761.11
- Hora 13: 1 órdenes, $51519.30
- Hora 14: 1 órdenes, $41005.16
- Hora 19: 6 órdenes, $202347.87
- Hora 20: 81 órdenes, $3797975.23
- Hora 21: 86 órdenes, $4416463.43
- Hora 22: 40 órdenes, $1763832.17
- Hora 23: 10 órdenes, $308735.80

### Patrón por Día de Semana
- Día 0: 41 órdenes, $1823653.42
- Día 2: 17 órdenes, $944613.01
- Día 3: 34 órdenes, $1500973.18
- Día 4: 33 órdenes, $1609863.08
- Día 5: 58 órdenes, $3096611.53
- Día 6: 51 órdenes, $2381375.85

==================================================
Customer Events Distribution
==================================================

- signal_detected: 14917 eventos
- health_score_changed: 457 eventos
- product_view: 79 eventos
- order_completed: 38 eventos
- segment_changed: 17 eventos

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
