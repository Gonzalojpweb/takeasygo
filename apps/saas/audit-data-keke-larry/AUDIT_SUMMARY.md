# TakeasyGo Data Audit - Keke & Larry
**Generated:** 2026-10-02T23:11:53.890Z

## 1. TENANT IDENTIFICADO

- **Nombre:** Keke&Larry
- **ID:** 69f8bf6ad3fcc97fd64bec87
- **Slug:** kekelarry
- **Plan:** full
- **Locations:** 1
- **Activo desde:** 2026-05-04

## 2. PERÍODO DISPONIBLE

- **Fecha inicial:** 2026-06-19
- **Fecha final:** 2026-10-02
- **Días de datos:** 104
- **Gaps:** 0

## 3. FUENTES ENCONTRADAS

### MongoDB Collections
- **orders**: 249 registros
- **customerprofiles**: 140 registros
- **customerevents**: 15508 registros
- **loyaltymembers**: 115 registros
- **feedbacks**: 82 registros
- **tiainsights**: 2077 registros
- **ratings**: 3 registros
- **menus**: 1 registros
- **storeitems**: 1 registros
- **promotions**: 10 registros
- **qrpromos**: 2 registros
- **impactevents**: 163 registros
- **menuvisits**: 3927 registros
- **hiddenrewardclaims**: 9 registros
- **locations**: 1 registros
- **users**: 28 registros
- **reservations**: 3 registros
- **qrpromoviews**: 401 registros
- **auditlogs**: 2150 registros

## 4. ENTIDADES / TABLAS


### Order
- **Colección:** orders
- **Descripción:** Customer orders with items, payments, and status
- **Campos:** 44


### Consumer
- **Colección:** consumers
- **Descripción:** Customer profiles with encrypted PII
- **Campos:** 18


### LoyaltyMember
- **Colección:** loyaltymembers
- **Descripción:** Club membership with points and rewards
- **Campos:** 20


### Menu
- **Colección:** menus
- **Descripción:** Product catalog with categories and items
- **Campos:** 9


### StoreItem
- **Colección:** storeitems
- **Descripción:** Reward items redeemable with points
- **Campos:** 24


## 5. MÉTRICAS DISPONIBLES

### Ventas
- Total Orders: 234
- Total Revenue: $11357090.07
- Avg Ticket: $48534.57

### Clientes
- Unique Customers: 167
- Repeat Customers: 37

### Club / Loyalty
- Total Members: 115
- Total Points: 362115
- Total Redemptions: 1

### Productos
- Product Count: 22

## 6. DATA QUALITY

**Overall Score:** 90/100

### Issues

- **HIGH** - orders: Orders without customer phoneHash
  - Affected: 13 (5.2%)
  - Recommendation: Ensure phoneHash is captured at checkout for customer linking


## 7. DATA LINEAGE

### Sources
- **MongoDB Primary** (mongodb): Primary transactional database
- **PostHog Analytics** (posthog): Event tracking and analytics

## 8. DATOS FALTANTES

### NO DISPONIBLE
- foodCost
- margin
- contributionMargin
- preparationTime
- capacityUtilization
- stockoutRate

### PARCIALMENTE DISPONIBLE
- customerLifetimeValue
- retentionRate
- churnRate

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


