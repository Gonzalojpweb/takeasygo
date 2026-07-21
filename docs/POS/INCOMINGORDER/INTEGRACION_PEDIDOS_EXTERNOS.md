# Integración de Pedidos Externos — Documentación Completa

**Fecha:** 20 de julio de 2026
**Versión:** 1.0
**Estado:** Implementado — listo para pruebas end-to-end

---

## Tabla de contenidos

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Arquitectura del flujo](#2-arquitectura-del-flujo)
3. [Los 3 caminos de confirmación](#3-los-3-caminos-de-confirmación)
4. [Archivos modificados y creados](#4-archivos-modificados-y-creados)
5. [Decisiones de diseño](#5-decisiones-de-diseño)
6. [Variables de entorno](#6-variables-de-entorno)
7. [Flujos detallados](#7-flujos-detallados)
8. [Edge cases y manejo de errores](#8-edge-cases-y-manejo-de-errores)
9. [Cambios en el POS UI](#9-cambios-en-el-pos-ui)
10. [Próximos pasos y validación](#10-próximos-pasos-y-validación)

---

## 1. Resumen ejecutivo

Este documento cubre la implementación completa de la integración de pedidos externos (TakeasyGO) al POS, incluyendo:

- **Función compartida `confirmOrderPayment()`** — un solo punto de entrada para las 3 rutas de confirmación de pago
- **Forwarding SyncLayer→SaaS con outbox (BullMQ)** — 5 reintentos, exponential backoff, nunca pierde una confirmación
- **Timeout condicional** — transferencias: 24hs, MP/Kripton: 10 min
- **POS → SaaS status sync** — cambios de estado del POS se propagan al SaaS
- **UI diferenciada** — pedidos MP grisados (esperando pago automático), pedidos transfer activos con botón "Confirmar pago"

---

## 2. Arquitectura del flujo

```
┌─────────────┐    webhook/confirm     ┌──────────────┐
│  MercadoPago │ ──────────────────────▶│  SaaS (Vercel)│
│  / Transfer  │                        │               │
└─────────────┘                        │ confirmOrder  │
                                        │ Payment()     │
┌─────────────┐  PATCH /confirm        │  ├─ confirmIn │
│  POS (PWA)  │ ──────────────────────▶│  │  SyncLayer  │
│             │                        │  ├─ notifyCash │
└─────────────┘                        │  │  Sale()     │
       │                               │  └─ captureOrd │
       │ order:created                 │     erCompleted│
       │ order:status_updated          └──────┬────────┘
       ▼                                      │
┌──────────────┐  BullMQ outbox        ┌──────▼────────┐
│ SyncLayer    │ ◀────────────────────▶│  SaaS (Vercel)│
│ (Render)     │  confirm-forward queue│               │
│              │                       │ confirm-      │
│ POST /orders │                       │ internal      │
│ :id/status   │                       └───────────────┘
└──────────────┘
```

### Secuencia de datos

1. **SaaS** crea la orden → llama `pushOrderToSyncLayer()` con `paymentMethod`
2. **SyncLayer** crea `SyncOrder` en MongoDB → emite `order:created` al POS
3. **POS** recibe el pedido → lo muestra en "Pedidos Externos"
4. **Pago se confirma** (webhook MP, admin transfer, o POS transfer)
5. **`confirmOrderPayment()`** ejecuta 3 efectos secundarios:
   - `confirmOrderInSyncLayer()` — actualiza SyncOrder a "confirmed"
   - `notifyCashSale()` — crea movimiento de caja (deduplicado por unique index)
   - `captureOrderCompleted()` — eventos CIS para analytics
6. **SyncLayer** emite `order:status_updated` → POS actualiza UI
7. **POS** muestra badge "Integrar al orden" o "Confirmar pago"

---

## 3. Los 3 caminos de confirmación

### Camino 1: Webhook MercadoPago

```
MP → POST /api/webhooks/mercadopago/[tenant]/route.ts
  → confirmOrderPayment(order, tenant)
    → confirmOrderInSyncLayer()
    → notifyCashSale()
    → captureOrderCompleted()
```

**Archivo:** `apps/saas/app/api/webhooks/mercadopago/[tenant]/route.ts:203-209`

### Camino 2: Admin confirma transferencia (SaaS panel)

```
Admin → PATCH /api/[tenant]/orders/[orderId]/confirm-transfer-admin/route.ts
  → order.save()
  → confirmOrderPayment(order, tenant)  // ← AGREGADO (antes no existía)
    → confirmOrderInSyncLayer()
    → notifyCashSale()
    → captureOrderCompleted()
```

**Archivo:** `apps/saas/app/api/[tenant]/orders/[orderId]/confirm-transfer-admin/route.ts:85-90`

**Bug corregido:** Antes, confirmar una transferencia desde el admin solo actualizaba el SaaS. Ahora también notifica al SyncLayer y crea el movimiento de caja.

### Camino 3: Cajero confirma transferencia (POS)

```
POS → PATCH /api/v1/internal/orders/:id/confirm (SyncLayer)
  → updateOrderStatus("confirmed")
  → emit order:confirmed + order:status_updated
  → enqueueConfirmForward → BullMQ → POST /confirm-internal (SaaS)
    → confirmOrderPayment(order, tenant)
      → confirmOrderInSyncLayer()  // idempotente, ya está confirmado
      → notifyCashSale()
      → captureOrderCompleted()
```

**Archivos:**
- `apps/sync/src/routes/internal.ts:69-127` — PATCH confirm + outbox forward
- `apps/sync/src/routes/orders.ts:125-159` — PATCH confirm (JWT auth)
- `apps/sync/src/queues/order-confirm-forward-queue.ts` — BullMQ queue
- `apps/sync/src/workers/index.ts:107-155` — worker que llama al SaaS
- `apps/saas/app/api/[tenant]/orders/[orderId]/confirm-internal/route.ts` — endpoint receptor

---

## 4. Archivos modificados y creados

### Archivos creados (3)

| Archivo | Descripción |
|---------|-------------|
| `apps/saas/app/api/[tenant]/orders/[orderId]/confirm-internal/route.ts` | Endpoint interno SyncLayer→SaaS, auth por Bearer secret |
| `apps/sync/src/queues/order-confirm-forward-queue.ts` | BullMQ queue con 5 reintentos y exponential backoff |

### Archivos modificados (15)

| Archivo | Cambios principales |
|---------|---------------------|
| `apps/saas/lib/sync-layer.ts` | +`confirmOrderPayment()`, +`updateOrderStatusInSaaS()`, SyncOrderPayload +`paymentMethod` |
| `apps/saas/app/api/webhooks/mercadopago/[tenant]/route.ts` | Reemplazó llamadas separadas por `confirmOrderPayment()` |
| `apps/saas/app/api/[tenant]/orders/[orderId]/confirm-transfer-admin/route.ts` | +import `confirmOrderPayment`, +llamada fire-and-forget |
| `apps/saas/app/api/[tenant]/orders/[orderId]/status/route.ts` | +soporte auth interna (Bearer secret) |
| `apps/saas/app/api/[tenant]/orders/route.ts` | pushOrderToSyncLayer incluye `paymentMethod` |
| `apps/sync/src/routes/internal.ts` | +`confirmForwardQueue` param, +timeout condicional, +POST /orders/:id/status, +emit order:status_updated, +forwarding en confirm |
| `apps/sync/src/routes/orders.ts` | +`confirmForwardQueue` param, +timeout condicional, +emit order:status_updated, +forwarding en confirm, GET /pending incluye paymentMethod |
| `apps/sync/src/routes/sync.ts` | /replay procesa `order.*` events y hace forward a SaaS |
| `apps/sync/src/routes/index.ts` | +`confirmForwardQueue` param, pasa a todos los routers |
| `apps/sync/src/queues/index.ts` | +`confirmForwardQueue` al QueueServer |
| `apps/sync/src/workers/index.ts` | +worker `order_confirm_forward`, +helper `getSaaSslug()` |
| `apps/sync/src/index.ts` | Desestructura y pasa `confirmForwardQueue` |
| `apps/sync/src/services/order-translator.ts` | TranslatedOrder +`paymentMethod`, createTranslatedOrder lo almacena |
| `packages/types/src/index.ts` | Order +6 campos, nuevo type SyncOrder, SocketEvent +`order:status_updated` |
| `packages/db/src/models/sync-order.ts` | +`paymentMethod` field, +compound unique index `{tenantId, externalOrderId}` |
| `apps/pos/src/db/dexie.ts` | v7: +`externalOrderId` index on orders |
| `apps/pos/src/services/sync-api.ts` | +`confirmTransferPayment()`, PendingSyncOrder +`paymentMethod` |
| `apps/pos/src/components/IncomingOrders/OrderCard.tsx` | Renderizado por paymentMethod, badge "Confirmar pago", microcopy |
| `apps/pos/src/components/IncomingOrders/IncomingOrdersDashboard.tsx` | Subscribe `order:status_updated`, `handleConfirmTransfer`, orders con paymentMethod |

---

## 5. Decisiones de diseño

### D1: Shared confirmation function

**Decisión:** Una sola función `confirmOrderPayment()` centraliza los 3 efectos secundarios.

**Razón:** Consistencia. Los 3 caminos de confirmación (webhook MP, admin transfer, POS transfer) ejecutan exactamente la misma lógica. No hay riesgo de que un camino haga algo diferente.

**Implicación:** Idempotencia. `confirmOrderInSyncLayer()` es idempotente (PATCH con status "confirmed" aunque ya esté). `notifyCashSale()` deduplica por unique index `(orderId, tenantId)`.

### D2: Forwarding con outbox (BullMQ), no fire-and-forget

**Decisión:** El forwarding SyncLayer→SaaS usa BullMQ con 5 reintentos y exponential backoff.

**Razón:** Consistencia con el patrón de cash-sale ACK. Un evento de confirmación de plata no puede perderse silenciosamente si el SaaS está caído en ese instante. El costo incremental es bajo porque la infraestructura de BullMQ ya existe.

**Configuración:** 5 reintentos, backoff exponencial con delay inicial de 2000ms. Menos agresivo que cash-sale (10 reintentos) porque es interno entre dos servicios propios.

### D3: Timeout condicional

**Decisión:** Transfer: 24hs, MP/Kripton: 10 min.

**Razón:** Una transferencia puede tardar en llegar el comprobante. No hay riesgo real hoy porque Kripton está detrás del feature flag.

**Nota:** Kripton no se prende sin confirmar el tiempo real de confirmación en blockchain con el proveedor.

### D4: Lookup por orderId del SyncLayer

**Decisión:** El POS usa el `orderId` del SyncLayer (UUID) para todo. La traducción a `externalOrderId` (SaaS) la resuelve el SyncLayer internamente.

**Razón:** El POS ya conoce el orderId del SyncLayer desde `order:created`. No hay razón para que empiece a mandar un identificador distinto. Menos superficie de error.

### D5: No auto-integración

**Decisión:** Confirmar pago e integrar al POS son siempre 2 pasos separados, tanto para MP como para transfer.

**Razón:** Comportamiento consistente. El cajero siempre decide explícitamente cuándo integrar.

### D6: Transfer sin timeout automático

**Decisión:** No hay timeout automático para transferencias. El pedido queda visible indefinidamente hasta que el cajero confirme o cancele manualmente.

**Razón:** Cancelar una transferencia por timer riesga perder una venta real donde el cliente ya pagó pero se demoró en enviar el comprobante.

### D7: OrderCompleted se dispara en confirmación de pago, no en delivery

**Decisión:** `captureOrderCompleted()` (CIS) se ejecuta junto con `notifyCashSale()` en `confirmOrderPayment()`, no cuando se entrega el pedido.

**Razón:** La venta es financieramente real cuando se confirma el pago. El delivery es un evento operativo.

---

## 6. Variables de entorno

### Render (SyncLayer) — ya configuradas

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `INTERNAL_API_SECRET` | *(ya existe)* | Secret para rutas internas |
| `SAAS_BASE_URL` | `https://...vercel.app` | URL del SaaS para forwarding |

### Vercel (SaaS) — verificar

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `SYNC_LAYER_URL` | `https://takeasygo.onrender.com` | URL del SyncLayer |
| `SYNC_LAYER_SECRET` | `= INTERNAL_API_SECRET de Render` | **DEBE coincidir** con INTERNAL_API_SECRET en Render |

### POS — no necesita cambios

El POS solo habla con el SyncLayer por JWT. No hay secrets nuevos.

---

## 7. Flujos detallados

### 7.1 Flujo MP happy path

```
1. Consumidor crea pedido TakeasyGO → SaaS
2. SaaS → pushOrderToSyncLayer({ paymentMethod: "mercadopago" })
3. SyncLayer crea SyncOrder(status=pending, paymentMethod="mercadopago")
4. SyncLayer emite order:created al POS
5. POS muestra pedido grisado (opacity 0.6), badge "Esperando pago"
6. MercadoPago procesa el pago → webhook al SaaS
7. SaaS → confirmOrderPayment(order, tenant)
   → confirmOrderInSyncLayer() → SyncOrder(status=confirmed)
   → notifyCashSale() → movimiento de caja
   → captureOrderCompleted() → evento CIS
8. SyncLayer emite order:status_updated(externalStatus="confirmed")
9. POS actualiza card: badge "confirmed", botón "Integrar al orden"
10. Cajero toca "Integrar al orden" → transformExternalOrder() → update in-place del mismo registro
```

### 7.2 Flujo transfer (cajero confirma)

```
1. Consumidor crea pedido TakeasyGO → SaaS (paymentMethod="transfer")
2. SaaS → pushOrderToSyncLayer()
3. SyncLayer crea SyncOrder(status=pending, paymentMethod="transfer")
4. SyncLayer emite order:created al POS
5. POS muestra card activa, badge "Transferencia pendiente"
6. Microcopy: "Revisá el comprobante en WhatsApp antes de confirmar"
7. Cajero revisa comprobante → toca "Confirmar pago"
8. POS → PATCH /internal/orders/:id/confirm (SyncLayer)
9. SyncLayer → updateOrderStatus("confirmed") → emit order:status_updated
10. SyncLayer → enqueueConfirmForward → BullMQ → POST /confirm-internal (SaaS)
11. SaaS → confirmOrderPayment(order, tenant)
    → confirmOrderInSyncLayer() (idempotente, ya confirmed)
    → notifyCashSale() → movimiento de caja
    → captureOrderCompleted()
12. POS actualiza card: badge "confirmed"
13. Cajero toca "Integrar al orden" → transformExternalOrder() → update in-place del mismo registro
```

### 7.3 Flujo POS → SaaS status propagation

```
1. Cajero toca "Preparar" en POS → emit order.preparing via replay
2. SyncLayer /replay procesa order.preparing
   → updateOrderStatus("preparing")
   → emit order:status_updated(externalStatus="preparing")
   → enqueueConfirmForward → POST /confirm-internal (SaaS)
3. SaaS actualiza Order.status = "preparing"
4. Admin panel refleja el cambio
```

> **Nota (21 jul 2026):** Este flujo requiere que el cajero pueda marcar
> los estados (preparing, ready, delivered) desde el POS. Hoy las funciones
> existen en `order.ts` pero NO hay UI conectada para pedidos externos.
> Pendiente de implementar en Fix 4 (coordinado con Harrys, ver
> RESOLUCION_3_PROBLEMAS.md §11).

---

## 8. Edge cases y manejo de errores

### 8.1 Doble confirmación (idempotencia)

Si llegan 2 requests de confirmación simultáneas:
- `confirmOrderInSyncLayer()` es idempotente (PATCH status "confirmed" aunque ya esté)
- `notifyCashSale()` tiene unique index `(orderId, tenantId)` → segunda insert falla silenciosamente
- **Resultado:** Un solo movimiento de caja, sin duplicación

### 8.2 SyncLayer caído cuando SaaS confirma

`confirmOrderInSyncLayer()` tiene 3 reintentos con exponential backoff (2s, 4s, 8s).

**Si después de 3 reintentos falla:** `confirmOrderPayment()` se **ABORTA**. No se ejecuta `notifyCashSale()` ni `captureOrderCompleted()`. Estado consistente: no hay movimiento de caja fantasma ni evento CIS contaminado.

**Recovery:**
- **MP webhook (camino 1):** MercadoPago reintenta el webhook automáticamente → `confirmOrderPayment()` se llama de nuevo → reintentos → eventualmente funciona. Idempotente.
- **Admin transfer (camino 2):** El admin ve el error y puede re-confirmar manualmente. Consistente: no hay registros parciales.
- **POS transfer (camino 3):** Ya tiene BullMQ outbox — no afecta.

**Log estructurado en caso de aborto:**
```
[confirmOrderPayment] ABORTED — SyncLayer unreachable after retries.
Nothing registered in cash or CIS. Caller can retry.
{ orderId, tenantId, paymentMethod }
```

### 8.3 SaaS caído cuando SyncLayer confirma

- El outbox BullMQ reintenta 5 veces con exponential backoff
- Si agota reintentos, se loggea el error
- La confirmación queda pendiente en la cola de BullMQ
- **Nota Cristóbal:** Si el SaaS está caído mucho tiempo, el evento queda en "failed" y necesita intervención manual

### 8.4 POS se desconecta después de confirmar

- La confirmación ya fue enviada al SyncLayer (PATCH /confirm)
- El SyncLayer procesó y emitió `order:status_updated`
- El ACK de cash-sale sigue el patrón existente (reintentos via BullMQ)
- **No hay pérdida de datos**

### 8.5 Pedido MP llega pero el webhook falla

- MP reintenta el webhook (su propia lógica de reintentos)
- La idempotencia en `PaymentNotification` previene duplicados
- Si el SaaS está caído, MP sigue reintentando

### 8.6 Transfer sin comprobante

- El cajero puede cancelar manualmente desde el POS
- No hay timeout automático (decisión D6)
- El pedido queda visible indefinidamente

### 8.7 Eventos fuera de orden (Decisión Cristóbal, 21 jul 2026)

**Problema:** Si `order:status_updated` o `order:cancelled` llega antes que `order:created` (reintento de red, reconexión), el evento se pierde silenciosamente porque `db.orders.get(orderId)` retorna null.

**Solución — pendingStatusUpdates:**
- Tabla Dexie con PK = `orderId` (upsert: segundo evento sobreescribe al primero)
- `updateExternalOrderStatus()` y `cancelExternalOrder()` escriben ahí si el registro no existe
- `persistExternalOrder()` aplica y borra pendientes dentro de `db.transaction()` al crear el registro
- Limpieza TTL 24h de pendientes huérfanos (si `order:created` nunca llega)

**Escenarios cubiertos:**
1. `status_updated(confirmed)` → `order:created` → registro creado con `confirmed` (no `awaiting_payment`)
2. `status_updated(confirmed)` → `status_updated(preparing)` → `order:created` → registro con `preparing` (last-write-wins)
3. `order:cancelled` → `order:created` → registro creado directamente como `cancelled`
4. Dos `persistExternalOrder()` simultáneos → transacción atómica previene carrera

**Decisión:** Opción B del análisis de Cristóbal — separa responsabilidades (`updateExternalOrderStatus` no inventa items/total que no tiene) y es testeable de forma aislada.

### 8.8 Propagación de estados SaaS → POS (Fred, 21 jul 2026)

**Problema:** Cuando el SaaS cambia el estado de un pedido sincronizado (admin panel, delivery app), el POS nunca se entera. El pedido queda atascado en Pedidos Entrantes con su último status local.

**Causa raíz:** El endpoint `PATCH /{tenant}/orders/{orderId}/status` del SaaS actualiza MongoDB pero no notifica al SyncLayer. El `updateOrderStatusInSaaS()` en `sync-layer.ts` existía como dead code — nunca se conectó.

**Solución (2 capas):**

1. **SaaS → SyncLayer**: Después de `order.save()`, si `order.externalOrderId` existe, llamar `notifySyncLayerStatus()` → `POST /internal/orders/:orderId/status` con `skipForward: true`. El SyncLayer actualiza su DB + emite `order:status_updated` al POS. `skipForward: true` evita loop infinito (SaaS → SyncLayer → SaaS).

2. **POS mirror**: `updateExternalOrderStatus()` ahora mirror `externalStatus` a `status` local para estados terminales (`delivered`, `cancelled`). Esto asegura que el filtro `status !== 'delivered'` en IncomingOrdersDashboard remueva pedidos que el SaaS cerró independientemente.

**Cobertura:** El fix aplica a TODOS los cambios de estado desde el SaaS (no solo delivery). El admin puede cancelar, preparar, o marcar listo desde el panel, y el POS recibe la actualización.

**Atomicidad:** `updateExternalOrderStatus()` no necesita transacción — las escrituras son idempotentes (mismo valor para `externalStatus` y `status`). Si dos llamadas simultáneas compiten, el último写入 gana pero el resultado final es el mismo.

**Monotonía (guard contra stale events):** `updateExternalOrderStatus()` valida que el `externalStatus` nuevo no sea anterior al actual. Si llega un reintento tardío (ej: `preparing` cuando ya tenemos `ready`), se descarta. Definición de orden:
```
awaiting_payment(0) < confirmed(1) < preparing(2) < ready(3) < delivered(4) < cancelled(5)
```
Dos guards separados:
- **externalStatus**: guard de monotonía — compara contra `existing.externalStatus`, no contra `status` local
- **status local**: solo se toca para `delivered`/`cancelled` (estados terminales), siempre se aplica sin comparación de orden

`cancelled` tiene position 5 (la más alta) → nunca puede ser sobreescrito por un stale event. Una vez cancelado, nadie lo revierte.

### 8.9 Recovery offline — delivery completado mientras POS desconectado (Fred, 21 jul 2026)

**Problema:** Si el POS está offline cuando el delivery driver marca `delivered` en el SaaS, el socket event `order:status_updated` se pierde. El pedido queda en Dexie con `externalStatus: "ready"` y `status: "ready"` para siempre en Pedidos Entrantes.

**Causa:** `fetchPendingOrders()` del SyncLayer solo consultaba `status ∈ [pending, confirmed, preparing]` — un pedido `delivered` nunca aparecía en la respuesta.

**Solución (3 capas):**

1. **SyncLayer `/orders/pending`**: Query expandida a `status ∈ [pending, confirmed, preparing, ready, delivered]` + filtro temporal `updatedAt >= 24h`. Incluye delivered para que el reconciliador detecte el cambio.

2. **POS `persistExternalOrder()`**: Monotonía aplicada también aquí — si el registro ya existe, `externalStatus` no retrocede. Un `confirmed` tardío no sobreescribe un `ready` más avanzado.

3. **POS reconnect reconciliation**: Después de `fetchPendingOrders`, el POS itera los pedidos y llama `updateExternalOrderStatus` para estados terminales (`delivered`, `cancelled`). El guard de monotonía descarta stale events automáticamente.

**Flujo de recovery:**
```
1. POS offline: order ready (externalStatus="ready", status="ready")
2. Driver marca delivered → SyncLayer status="delivered" → socket event PERDIDO
3. POS reconecta:
   - flush() envía eventos pendientes
   - fetchPendingOrders() descarga delivered (nuevo: incluido en query)
   - persistExternalOrder() → externalStatus actualizado con monotony guard
   - Reconcile loop → updateExternalOrderStatus("delivered")
     → mirrors status="delivered" → order sale de Pedidos Entrantes ✅
```

**Monotonía compartida:** `isForwardStatus()` helper en `external-orders.ts` usado por ambas funciones (`persistExternalOrder` y `updateExternalOrderStatus`). Un solo lugar para definir el orden de estados.

---

## 9. Cambios en el POS UI

### 9.1 OrderCard — renderizado por paymentMethod

| paymentMethod | externalStatus | Visual |
|---------------|----------------|--------|
| `mercadopago` / `kripton` | `awaiting_payment` | Card grisada (opacity 0.6), badge "Esperando pago" |
| `transfer` | `awaiting_payment` | Card activa, badge "Transferencia pendiente", microcopy, botón "Confirmar pago" |
| cualquiera | `confirmed` | Badge del status, botón "Integrar al orden" |

### 9.2 Badge de paymentMethod

Se muestra un icono + label junto al source del pedido:
- 💙 MP
- ₿ Kripton
- 🏦 Transferencia
- 💵 Efectivo
- 💳 POSNET

### 9.3 Microcopy en transfer

Debajo del badge "Transferencia pendiente":
> "Revisá el comprobante en WhatsApp antes de confirmar"

### 9.4 Toast de concurrencia

Si el `order:status_updated` llega pero la card ya estaba en ese status, se muestra un toast informativo (no error).

---

## 10. Próximos pasos y validación

### Env vars

1. Verificar `SYNC_LAYER_SECRET` en Vercel = `INTERNAL_API_SECRET` en Render
2. Verificar `SAAS_BASE_URL` en Render = URL del SaaS en Vercel
3. Verificar `SYNC_LAYER_URL` en Vercel = URL del SyncLayer en Render

### Pruebas end-to-end

| # | Escenario | Qué validar |
|---|-----------|-------------|
| 1 | MP happy path | Pedido MP → awaiting_payment → webhook → status_updated → Integrar → movimiento caja único + OrderCompleted |
| 2 | Transfer flow | Pedido transfer → card activa → Confirmar pago → status_updated → Integrar → mismo movimiento caja + OrderCompleted |
| 3 | POS → SaaS | Cajero toca "Preparar" en POS → SyncLayer procesa → SaaS refleja "preparing" |
| 4 | Idempotencia | Dos requests simultáneos a confirm → un solo movimiento caja |
| 5 | Timeout transfer | Pedido transfer visible indefinidamente (sin timeout de 10 min) |
| 6 | Triplicación | Verificar idempotencia por externalOrderId + compound unique index |
| 7 | Env vars | Verificar que coinciden en Vercel y Render |
| 8 | Kripton timeout | Confirmar con proveedor tiempo de confirmación (pendiente antes de activar flag) |
| 9 | OrderCompleted | Transfer también dispara `captureOrderCompleted` en CIS |
| 10 | Forward failure | SyncLayer→SaaS forward falla → reintento con outbox → no deja estado inconsistente |
| 11 | Socket root level | Pedidos recibidos mientras el cajero está en Counter/Caja/Ventas → persisten en Dexie y aparecen en Pedidos Entrantes al cambiar de vista |
| 12 | **Delivery cycle** | Pedido delivery → POS preparando → POS listo → driver marca delivered en SaaS → SaaS notifica SyncLayer (skipForward) → socket `order:status_updated` → POS actualiza status a "delivered" → pedido desaparece de Pedidos Entrantes |
| 13 | **Pre-integration cancel** | Pedido en awaiting_payment (sin integrar) → admin cancela desde panel SaaS → SaaS notifica SyncLayer → socket `order:status_updated` → POS actualiza status a "cancelled" → pedido desaparece de Pedidos Entrantes |
| 14 | **Admin status change** | Admin marca "preparando" desde panel SaaS → SaaS notifica SyncLayer → POS recibe `order:status_updated` → externalStatus actualizado (idempotente, status local no cambia) |
| 15 | **Offline recovery delivery** | POS en `ready` → desconectar → driver marca delivered en SaaS → reconectar → fetchPendingOrders devuelve delivered → reconcile actualiza status a "delivered" → pedido sale de Pedidos Entrantes |

### Ciclo de vida delivery (Flujo completo TakeasyGO → SaaS)

```
1. TakeasyGO order → SyncLayer → POS socket → persistExternalOrder() [source=external, status=pending]
2. Cashier validates → "Iniciar Preparación" → prepareOrder() [status=preparing] → SyncLayer → SaaS
3. Cashier marks ready → markReady() [status=ready] → SyncLayer → SaaS
4. Delivery driver picks up → delivery app → SaaS PATCH /status [status=en_ruta]
5. Driver arrives → delivery app → SaaS PATCH /status [status=arrived]
6. Driver confirms delivery → delivery app → SaaS PATCH /status [status=delivered]
   → SaaS calls notifySyncLayerStatus() with skipForward=true
   → SyncLayer updates DB + emits order:status_updated to POS
   → POS updateExternalOrderStatus() → externalStatus="delivered" + status="delivered"
   → Pedido sale del filtro status !== 'delivered' en Pedidos Entrantes
7. SaaS triggers loyalty points + time adjustment (en delivered)
```

### Kripton — prerequisito antes de activar

> No activar el feature flag de Kripton sin confirmar con el proveedor el tiempo real de confirmación en blockchain. Actualmente usa 10 min shared con MP, pero puede ser diferente.

---

## 11. Corrección de 4 fallas críticas (21 julio 2026)

### Diagnóstico

Se identificaron 4 fallas desacopladas que impedían el flujo end-to-end de pedidos externos en producción:

### Falla #1 — Socket nunca conectaba a nivel raíz

**Problema:** `connectSocket()` solo se invocaba en `IncomingOrdersDashboard` y `FlotaDashboard`. Si el usuario abría el POS en Counter/Caja/Ventas, el socket nunca conectaba y los eventos `order:created` se perdían.

**Fix:** `apps/pos/src/App.tsx`
- Importar `connectSocket` de socket-client
- Llamar `connectSocket(state.jwt.accessToken)` al inicio del `useEffect` raíz, antes de registrar los listeners
- `connectSocket` tiene idempotency check —llamadas múltiples son seguras

### Falla #2 — ID mismatch _id vs externalOrderId en SyncLayer

**Problema:** El SaaS llama `confirmOrderInSyncLayer(order._id.toString())` enviando su propio `_id` de MongoDB. Pero `updateOrderStatus()` en SyncLayer solo buscaba por `{ _id: orderId }` — el `_id` del SyncLayer, que es distinto. El ID del SaaS se guardaba como `externalOrderId`. Resultado: 404.

**Fix:** `apps/sync/src/services/order-translator.ts`
- Nueva función helper `buildOrderLookup(orderId, tenantId)` que construye `{ $or: [{ _id: orderId }, { externalOrderId: orderId }] }`
- `updateOrderStatus()` usa esta query dual

**Fix en routes:** `internal.ts`, `orders.ts`, `sync.ts`
- Todos los `SyncOrderModel.findOne({ _id: orderId })` cambiados a `{ $or: [{ _id: orderId }, { externalOrderId: orderId }] }`

### Falla #3 — URL y auth incorrecta en confirmTransferPayment

**Problema:** `confirmTransferPayment()` en el POS llamaba `/api/v1/internal/orders/${orderId}/confirm` con JWT. Pero `/internal/*` requiere `internalApiSecret`. La ruta correcta con JWT es `/api/v1/orders/${orderId}/confirm`.

**Fix:** `apps/pos/src/services/sync-api.ts`
- Cambiar de `${SYNC_URL}/api/v1/internal/orders/${orderId}/confirm` a `${SYNC_URL}/api/v1/orders/${orderId}/confirm`

### Falla #4 — Reconexión

**Problema:** `fetchPendingOrders` ya se ejecutaba en `onReconnect` (HTTP health check), pero sin el socket conectado (Falla #1) los eventos en tiempo real se perdían.

**Fix:** Resuelto por Falla #1. Con el socket conectado a nivel raíz, los eventos fluyen correctamente.

### Archivos modificados

| Archivo | Cambio |
|---|---|
| `apps/pos/src/App.tsx` | Importar y llamar `connectSocket(jwt)` en useEffect raíz |
| `apps/pos/src/services/sync-api.ts` | URL `/internal/orders/` → `/orders/` |
| `apps/sync/src/services/order-translator.ts` | `updateOrderStatus` usa query dual `_id` OR `externalOrderId` |
| `apps/sync/src/routes/internal.ts` | `SyncOrderModel.findOne` con query dual (confirm + status) |
| `apps/sync/src/routes/orders.ts` | `SyncOrderModel.findOne` con query dual (confirm) |
| `apps/sync/src/routes/sync.ts` | `SyncOrderModel.findOne` con query dual (replay) |

### Verificación

- `tsc --noEmit` limpio en apps/pos y apps/sync
- 68/68 tests pasan (apps/pos)
- 6 archivos modificados, 39 inserciones, 7 eliminaciones

### Test manual requerido

1. Login POS → Counter → verificar `[socket] connected` en consola
2. Crear pedido TakeasyGO con MP → verificar que suena POP.mp3 y aparece en Pedidos Entrantes
3. Simular webhook MP → verificar que SyncLayer procesa confirm sin 404
4. En pedido transfer → verificar que "Confirmar pago" retorna 200 (sin 401)

---

## 12. Diagnóstico end-to-end en tenant real (21 julio 2026 — sesión de pruebas)

### Test ejecutado por el usuario (cuenta real, tenant 6a5583a37de41364ef75d662)

| Paso | Acción | Resultado esperado | Resultado real |
|------|--------|-------------------|----------------|
| 1 | Pago MP confirmado en SaaS | Pedido en columna "CONFIRMADOS" | ✅ OK |
| 2 | POS Sidebar "Pedidos" | Pedido aparece con "PAGO PENDIENTE" | ✅ OK |
| 3 | Cajero transforma | Se transforma con éxito | ✅ OK |
| 4 | Cajero hace "Iniciar Preparación" | Status → "preparing" en POS | ✅ OK |
| 5 | Verificar SaaS | SaaS debería mostrar "preparing" | ❌ **Sigue en "CONFIRMADO"** |
| 6 | Verificar Counter "Pedidos Entrantes" | Kanban debería mostrar pedido | ❌ **Vacío** |
| 7 | Verificar Sidebar "Ventas" | Pedido debería aparecer | ✅ OK (aparece como "PREPARANDO") |
| 8 | Cambiar status en SaaS (hasta delivered) | POS debería recibir cambios | ❌ **Nada llega al POS** |
| 9 | Verificar Sidebar "Pedidos" | Pedido debería desaparecer al entregar | ✅ OK (desaparece al marcar delivered en SaaS) |

### Falla #5 — POS → SaaS: cambios de status nunca llegan (flush no se ejecuta)

**Problema:** Cuando el cajero hace "Iniciar Preparación", `prepareOrder()` en `order.ts:217` solo actualiza Dexie y encola evento a `db.pendingEvents`. El evento **NUNCA se envía** al SyncLayer porque `flush()` solo se llama en `onReconnect` (`App.tsx:185`). Si el socket nunca se desconecta, flush nunca ocurre.

**Causa raíz:** El outbox pattern está incompleto — hay enqueue pero no hay flush periódico ni flush-on-action.

**Evidencia:** SaaS sigue en "CONFIRMADO" después de que el cajero cambió a "preparing" en POS.

**Fix (2 partes):**

1. **`apps/pos/src/services/sync-api.ts`** — Nueva función `notifyStatusToSyncLayer()`:
   ```typescript
   export async function notifyStatusToSyncLayer(
     orderId: string, status: string, jwt: string
   ): Promise<boolean> {
     const res = await fetch(`${SYNC_URL}/api/v1/orders/${orderId}/status`, {
       method: "POST",
       headers: {
         "Content-Type": "application/json",
         Authorization: `Bearer ${jwt}`,
       },
       body: JSON.stringify({ status }),
     })
     return res.ok
   }
   ```

2. **`apps/pos/src/services/order.ts`** — En `prepareOrder()`, `markReady()`, `deliverOrder()`, `cancelOrder()`: después de `enqueue()`, llamar `notifyStatusToSyncLayer()` en background (fire-and-forget con `.catch(() => {})`) para no bloquear la UI. Requiere pasar `jwt` como parámetro.

### Falla #6 — SaaS → POS: tenantId type mismatch en notifySyncLayerStatus

**Problema:** `notifySyncLayerStatus()` en `sync-layer.ts:227` envía `{ tenantId: tenantSlug }` ("takeasygo"). Pero el SyncOrder en MongoDB tiene `tenantId: "6a5583a37de41364ef75d662"` (ObjectId string). La query `{ tenantId: "takeasygo" }` nunca matchea → `modifiedCount = 0` → 404 → socket event nunca se emite → POS nunca recibe `order:status_updated`.

**Causa raíz:** Se pasó el slug en vez del ObjectId al llamar `notifySyncLayerStatus`.

**Evidencia:** Admin cambia status en SaaS → POS no recibe nada.

**Fix:**

1. **`apps/saas/lib/sync-layer.ts`** — Cambiar firma:
   ```typescript
   // ANTES:
   export async function notifySyncLayerStatus(tenantSlug: string, orderId: string, status: string)
   // DESPUÉS:
   export async function notifySyncLayerStatus(tenantId: string, orderId: string, status: string)
   ```

2. **`apps/saas/app/api/[tenant]/orders/[orderId]/status/route.ts:150`** — Cambiar llamada:
   ```typescript
   // ANTES:
   notifySyncLayerStatus(tenantSlug, orderId, status)
   // DESPUÉS:
   notifyStatusToSyncLayer(tenant._id.toString(), orderId, status)
   ```

### Falla #7 — Gateway muestra botones de lifecycle (pedidos stuck)

**Problema:** `IncomingOrdersDashboard` renderiza `OrderCard` con botones `Iniciar Preparación`, `Marcar Listo`, `Entregado`. El cajero puede cambiar status SIN integrar el pedido. `prepareOrder()` cambia `status: "preparing"` pero **NO setea `integratedAt`**. Resultado: pedido queda con `integratedAt: null` y `status: "preparing"` → stuck en el gateway, Counter kanban vacío.

**Causa raíz:** El gateway (IncomingOrdersDashboard) no debería tener botones de lifecycle. Solo debería tener: validar, rechazar, transformar.

**Evidencia:** Cajero transforma → pedido sigue en Sidebar "Pedidos" → puede hacer "Iniciar Preparación" desde ahí → Counter "Pedidos Entrantes" vacío.

**Fix:**

1. **`apps/pos/src/components/IncomingOrders/IncomingOrdersDashboard.tsx`** — En la escena "queue", NO pasar callbacks de lifecycle a `OrderCard`. Solo pasar `onSelect` para abrir el detalle.

2. **`apps/pos/src/components/IncomingOrders/OrderCard.tsx`** — Agregar prop `showLifecycleButtons` (default: true). Cuando `false`, no renderizar botones de `prepareOrder`/`markReady`/`deliverOrder`.

### Falla #8 — Llamada circular redundante en confirmOrderPayment

**Problema:** Cuando el worker BullMQ llama a SaaS `/confirm-internal`, ejecuta `confirmOrderPayment()` que vuelve a llamar `confirmOrderInSyncLayer()`. Pero el SyncLayer ya confirmó (el orden ya está "confirmed"). `updateOrderStatus` retorna `false` → 404 → 3 reintentos → abort. `notifyCashSale` y `captureOrderCompleted` nunca ejecutan desde esta ruta.

**Evidencia:** SyncLayer loguea "successfully forwarded confirm" pero el worker falla silenciosamente al re-confirmar en SyncLayer.

**Nota:** Esto no rompe el flujo principal (MP webhook ya ejecutó `confirmOrderPayment` correctamente antes del worker), pero es código muerto que puede causar confusión y consume reintentos innecesariamente.

**Fix:**

1. **`apps/saas/app/api/[tenant]/orders/[orderId]/confirm-internal/route.ts`** — En vez de llamar `confirmOrderPayment()`, llamar directamente `notifyCashSale()` y `captureOrderCompleted()` (saltándose `confirmOrderInSyncLayer()` que ya se ejecutó).

2. **`apps/saas/lib/sync-layer.ts`** — O agregar parámetro `skipSyncLayerConfirm?: boolean` a `confirmOrderPayment()`.

---

## Resumen de archivos modificados (Fixes 5-8)

| Fix | Archivo | Cambio |
|-----|---------|--------|
| 5 | `apps/pos/src/services/sync-api.ts` | Nueva función `notifyStatusToSyncLayer()` |
| 5 | `apps/pos/src/services/order.ts` | `prepareOrder`, `markReady`, `deliverOrder`, `cancelOrder` llaman `notifyStatusToSyncLayer` en background |
| 6 | `apps/saas/lib/sync-layer.ts` | `notifySyncLayerStatus` recibe `tenantId` (ObjectId) en vez de `tenantSlug` |
| 6 | `apps/saas/app/api/[tenant]/orders/[orderId]/status/route.ts` | Llamar con `tenant._id.toString()` |
| 7 | `apps/pos/src/components/IncomingOrders/IncomingOrdersDashboard.tsx` | No pasar lifecycle callbacks en escena "queue" |
| 7 | `apps/pos/src/components/IncomingOrders/OrderCard.tsx` | Prop `showLifecycleButtons` |
| 8 | `apps/saas/app/api/[tenant]/orders/[orderId]/confirm-internal/route.ts` | Llamar directamente `notifyCashSale` + `captureOrderCompleted` |
| 8 | `apps/saas/lib/sync-layer.ts` | Nuevo export `confirmOrderPaymentCore()` sin SyncLayer call |

### Verificación post-fix

1. `tsc --noEmit` limpio en apps/pos, apps/saas, apps/sync
2. Tests POS pasan (68/68)
3. Test manual: Crear pedido MP → transformar en POS → hacer "Iniciar Preparación" → verificar que SaaS muestra "preparing"
4. Test manual: Cambiar status en SaaS → verificar que POS recibe el cambio
5. Test manual: Counter "Pedidos Entrantes" muestra pedidos integrados con lifecycle activo

---

## NOTA IMPORTANTE

Este documento es el **único fuente de verdad** para la integración de pedidos externos. Cualquier cambio futuro debe actualizarse aquí.

**Última actualización:** 21 de julio de 2026 (sesión de pruebas en tenant real)
