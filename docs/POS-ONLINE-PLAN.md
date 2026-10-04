# POS Online (V1) — Plan y estado

> **Objetivo:** que `apps/pos` hable directo con `apps/saas` por REST, eliminando a `apps/sync` del camino de datos.
> **Restricciones fijadas:** seguridad por diseño no es negociable · el UI existente no se toca · Dexie pasa a ser caché de solo lectura · todo módulo terminado, validado, testeado y documentado antes de pasar al siguiente · sin estimaciones de días.

---

## 1. Decisiones arquitectónicas

### 1.1 Cinco preguntas (respondidas)

| # | Pregunta | Decisión |
|---|----------|----------|
| 1 | ¿Cómo se autentica el POS contra el SaaS? | **Verificar el JWT RS256 existente de `apps/sync`.** Sin login nuevo, sin API keys. |
| 2 | ¿Existen los modelos? | **No.** Se crean `Table`, `CashRegister`, `CashMovement`. |
| 3 | ¿Se reutiliza el `POST /api/[tenant]/orders` (1916 líneas)? | **No.** Nuevo namespace `/api/[tenant]/pos/*` que escribe en `orders` con `source: "pos"`. |
| 4 | ¿Cómo se asegura la superficie nueva? | **Desde la línea 1** + arreglar solo las rutas de escritura explotables encontradas. El resto → deuda documentada. |
| 5 | ¿Dónde está el límite de repositorio? | UI/hooks intactos · Dexie solo-lectura escrito tras confirmación del server · `useLiveQuery` sin cambios · solo cambian los cuerpos de `services/*`. ~~El swap V2 = una línea en `repositories/index.ts`~~ — **ese archivo no existe** (ver §10). |

### 1.2 Corrección al diagrama original

El plan original borraba a `apps/sync` por completo. **Corrección:**

- `apps/sync` (Render) **se queda** como emisor de JWT (`apps/sync/src/routes/auth.ts:44`) y como `GET /api/v1/locations`.
- Render sale **solo del camino de datos**, no de la autenticación ni del registro de dispositivos.

### 1.3 Contrato de datos (invariantes)

- El POS genera el id con `crypto.randomUUID()` y lo envía como `posId`. El server lo persiste con **unique index**; `_id` sigue siendo `ObjectId`. El contrato expuesto al POS usa `id = posId`.
- `posId` **duplica como `Idempotency-Key`**: reintentos del POS no crean órdenes duplicadas.
- El server **recalcula totales** y valida las transiciones de estado; nunca confía en importes o saltos de máquina enviados por el cliente.
- Los comandos de cocina (M5) se derivan localmente en V1; la impresión (`printer.ts`, `z-escpos.ts`) no cambia.
- El reporte Z **se calcula en el server** (`generateZReport` se mueve a `@takeasygo/business`).
- Polling de invalidación: **diff-then-put**, 5–10 s, pausado con `Page Visibility` (Riesgo de costo Vercel). Upgrade a socket posible en V2.
- **Centavos enteros de punta a punta**; ninguna conversión de moneda en ningún mapper.
- Un solo registro de caja abierto por **(tenantId, locationId)**, no por tenant.
- `logAudit` recibe `userId`/`userRole` explícitos: el token POS no trae sesión NextAuth.
- Desde M5: **las reglas de dominio se deciden solo en el server** (ver §7.2).

---

## 2. Mapa de módulos

| Módulo | Contenido | Estado |
|--------|-----------|--------|
| **M1** | Hardening de escrituras existentes + CORS de la superficie nueva | ✅ Completo |
| **M2** | Puente de autenticación RS256 (`apps/sync` → `apps/saas`) | ✅ Completo |
| **M3** | Modelos (`Table`, `CashRegister`, `CashMovement`), `posId` en `Order`, mapper, transiciones compartidas, reporte Z en `@takeasygo/business` | ✅ Completo |
| **M4** | Endpoints `/api/[tenant]/pos/*` (orders ✅ · tables ✅ · cash ✅ · menu ✅ · CORS ✅) | ✅ Completo |
| **M5** | El POS habla con el SaaS: `services/*` server-first, `pos-api`, rehidratación de fechas, outbox fuera de las escrituras POS (ver §7) | ✅ Completo |
| **M6** | Polling diff-then-put, concurrencia entre terminales, Page Visibility (ver §8) | ✅ Completo |
| **—** | E2E de dos terminales + despliegue: no es código, es verificación y decisiones (ver §11) | ⬜ Parcial (§11.2a) |

---

## 3. M1 — Hardening de escrituras y CORS ✅

### 3.1 Rutas blindadas

Siete escrituras que no tenían **ningún** guard. Todas quedaron con auth **antes** de tocar el body:

| Ruta | Guard aplicado |
|------|----------------|
| `GET/POST /api/[tenant]/special-dates` | `requireAdminRole` |
| `DELETE /api/[tenant]/special-dates/[id]` | `requireAdminRole` |
| `PUT /api/[tenant]/promotions/reorder` | chequeo CSRF `x-tenant-slug` **+** `requireAdminRole` |
| `POST /api/[tenant]/preclose/print` | `requireAdminRole` |
| `POST /api/[tenant]/inventory/physical-count` | `requireAuth` (POST y GET) |
| `GET /api/[tenant]/inventory/physical-count` | `requireAuth` |
| `POST /api/[tenant]/inventory/goods-received` | `requireAuth` |
| `POST /api/[tenant]/inventory/pos-sale` | `requireAuth` |

### 3.2 Hallazgo: validación antes que autenticación

`POST /special-dates` leía y validaba el body **antes** de resolver el tenant y autenticar. Un caller sin token recibía `400 Missing required fields`, es decir:

- filtraba existencia/validez de datos sin estar autenticado, y
- podía provocar `500` mandando JSON roto (`request.json()` antes del guard).

**Fix:** tenant → auth → body. El resto de las rutas ya seguían ese orden; la regla queda documentada para M4: *nunca devolver errores de validación a un caller no autenticado*.

### 3.3 Atributos de body endurecidos

Además del guard, se reemplazaron chequeos de presencia (`!x`) por validación de tipo y límites: `name` string ≤100, `date.month/day` enteros en rango, arreglos ≤50 items de ≤100 chars, `from/to/printerName` string ≤100. En `pos-sale`/`physical-count`/`goods-received`, `actorId` ahora **se deriva del token**, nunca del body, y los ids se validan como `ObjectId`.

### 3.4 CORS de `/api/:tenant/pos/*`

```ts
// apps/saas/next.config.ts
const POS_CORS_ORIGIN = process.env.POS_CORS_ORIGIN ?? 'http://localhost:5173'
```

- **Origen explícito, nunca `*`**: todas las llamadas llevan `Authorization: Bearer <RS256>`. Un `*` reflejaría cualquier origen y permitiría que un sitio ajeno consuma la API con tokens robados.
- Métodos `GET,POST,PUT,PATCH,DELETE,OPTIONS`; headers `Content-Type, Authorization, Idempotency-Key`; `Vary: Origin`.
- Next.js añade el `OPTIONS` de preflight automáticamente y `headers()` se aplica también ahí (verificado en docs oficiales de Next).

> ⚠️ **Config abierta:** definir `POS_CORS_ORIGIN` en el entorno de producción de Vercel antes de desplegar M4. Si el POS se sirve desde el mismo dominio del SaaS, no hace falta CORS.

### 3.5 Rutas con CORS `*` ya existentes (deuda, no regresión)

`/api/:tenant/orders`, `/api/:tenant/menu` y `/api/webhooks/pos` estaban con `*` **antes** de este trabajo. Las de órdenes/menú consumidor siguen siendo el contrato público. Quedan anotadas como deuda en §6.

---

## 4. M2 — Puente RS256 ✅

### 4.1 Qué hace

`apps/saas` verifica el mismo token que emite `apps/sync`, sin crear un segundo login:

```
apps/sync (Render)  →  RS256  →  apps/saas getSessionUser()
                                  ├─ 1) sesión NextAuth (cookie)
                                  ├─ 2) cookie NextAuth vía getToken()
                                  └─ 3) Bearer RS256 del POS   ← nuevo
```

`apps/saas/lib/apiAuth.ts` — `getSessionUser` valida el Bearer y lo mapea al mismo shape de sesión con `toSessionFromPosToken`:

- `id ← sub`, `role`, `tenantId`
- `assignedLocation(s)` ← claim `locationId` (ausente en POS single-sede legacy ⇒ arreglo vacío)
- Si hay Bearer pero es inválido/expirado, se devuelve `null` y **no** se intenta ninguna otra vía.

`apps/saas/app/api/auth/sso/route.ts` pasó de un PEM de entorno crudo + `verifyJwt` a `verifyPosToken`, centralizando la verificación en un solo lugar.

### 4.2 Resiliencia de la clave pública — `apps/saas/lib/posJwt.ts`

- `POS_PUBLIC_KEY_FALLBACK`: el PEM **incrustado** en el código (mismo que `apps/sync/keys.public.pem`).
- Orden de resolución: `POS_JWT_PUBLIC_KEY` → `SSO_JWT_PUBLIC_KEY` → fallback.
- Cada candidato se valida con `createPublicKey` y se exige **RSA ≥ 2048**. Si una variable viene corrupta (rompió los tests), se ignora y se cae al siguiente candidato → **auto-sanador**.
- Cacheable, con `__resetPosJwtKeyCacheForTests()` para tests.

**Contexto:** `apps/saas/.env.local` tenía una línea `clear` incrustada dentro del PEM (línea 6), lo que rompía la clave. Se reparó localmente para que coincida byte a byte con `apps/sync/keys.public.pem`.

> ⚠️ **Riesgo pendiente:** `.env.local` está en `.gitignore` y **ningún `.pem` está trackeado**. El entorno de producción de Vercel puede seguir teniendo el PEM corrupto. El fallback incrustado hace que la app se recupere sola, pero conviene limpiar la variable en Vercel.

### 4.3 Rechazos explícitos

- Firmas con otra clave → rechazado.
- Tokens expirados o manipulados → rechazado.
- Tokens `HS256` (confusión de algoritmo) → rechazado: solo se acepta `RS256`.

---

## 5. M3 — Modelos, mapper y lógica compartida ✅

### 5.1 Modelos nuevos (`apps/saas/models/`)

| Modelo | Colección | Índices | Nota |
|--------|-----------|---------|------|
| `Table` | `tables` | `{tenantId, posId}` unique · `{tenantId, locationId, number}` unique | `currentOrderId` opcional; guard de recarga en dev (`Reflect.deleteProperty`). |
| `CashRegister` | `cashregisters` | `{tenantId, locationId}` **unique condicional** `status:'open'` · `{shareToken}` unique condicional | **Una sola caja abierta por (tenant, sede)**, no por tenant: si fuera global, multi-sede se rompería. `zReport` es `Mixed` e inmutable una vez cerrada. |
| `CashMovement` | `cashmovements` | `{registerId, relatedOrderId, type}` **unique condicional** cuando hay `relatedOrderId` | Colección aparte (no embebida): los índices únicos de idempotencia no existen sobre arrays. `amount` siempre positivo; el signo lo decide `cashExpectedDelta()`. |

Todos los importes están en **centavos enteros**, igual que en el POS: no hay conversión en ningún punto del camino.

> Se usó `partialFilterExpression` en lugar de `sparse`: con `sparse`, un índice compuesto no es equivalente (solo omite cuando *todos* los campos son ausentes).

### 5.2 `posId` en `Order`

`apps/saas/models/Order.ts`:

- `posId?: string` **sin default** → el campo no aparece en órdenes de consumo, así que el índice único parcial `{tenantId, posId}` solo afecta a las de origen POS. `_id` sigue siendo `ObjectId`; el contrato que ve el POS usa `id = posId`.
- `posTableId`, `menuVersion` (default `1`).
- `notes` en `IOrderItem` (el POS lo manda por item; el schema de SaaS no lo tenía).
- `requires_manual_attention` agregado al `OrderStatus` del schema: el estado ya existía en `@takeasygo/types` y en `packages/db/sync-order.ts`, faltaba en la storage layer. Sin esto, el grafo compartido de transiciones y lo que guarda Mongo no coincidirían.

### 5.3 Lógica compartida en `@takeasygo/business`

| Archivo | Qué exporta | De dónde viene |
|---------|-------------|----------------|
| `src/transitions.ts` | `TABLE_TRANSITIONS`, `ORDER_TRANSITIONS`, `ORDER_ITEM_EDITABLE_STATUSES`, `isValid*Transition`, `assert*Transition`, `canEditOrderItems` | única fuente de verdad; el POS la delegaba inline |
| `src/cash.ts` | `POSITIVE/NEGATIVE_CASH_TYPES`, `cashExpectedDelta`, `affectsCashExpected`, `findMovementForOrder`, `hasMovementForOrder`, `findRegisterForChannel`, `openRegistersOf` | reglas de arqueo/idempotencia/routing que estaban en `services/cash.ts` |
| `src/z-report.ts` | `generateZReport`, `ZReportInput` | movido desde el POS (lo pide el contrato: el Z se calcula en el server) |

Los **mensajes** de `assert*Transition` usan `→` y matchean exactamente los tests del POS (`[table] Invalid transition: free → closed. Allowed: [occupied, reserved]`), así que al delegar no cambia ningún test.

Los servicios del POS quedaron como re-export / delegación (`services/z-report.ts`, `services/table.ts`, `services/order.ts`), por lo que **la UI no se tocó**.

> ⚠️ `packages/business` no tiene runner de tests propio. Sus tests viven en `apps/saas/__tests__/lib/pos-shared.test.ts`, que lo resuelve por alias al **source**. Agregar vitest al paquete queda como deuda.

### 5.4 Mapper POS ⇄ SaaS — `apps/saas/lib/pos/orderMapper.ts`

`toSaasOrder(input, ctx)` construye el draft de Mongoose. Reglas, en orden:

1. `validateOrderItems` (de business) → lista de errores o sigue.
2. Por item, `toSaasOrderItem` **recalcula** `basePrice / extraPrice / price / subtotal` y **rechaza** si el `total` del cliente no cierra. No se "arregla" en silencio: si no cierra, es un error de contrato.
3. `subtotal = calculateOrderTotal(...)` solo se invoca *después* de que cada item fue validado (si no, estaría sumando números del cliente).
4. `productId` → `menuItemId`: se conserva solo si es un `ObjectId` válido, si no `null`. **Verificado** en `apps/sync/src/routes/menu.ts:92`: `flattenMenu` manda `item._id?.toString()`, o sea que el `product.id` del POS *es* el `_id` de `MenuItem`.
5. `modifiers` planos del POS → un único grupo de `customizations` con `groupName: 'Modificadores'`.
6. `orderMode = tableId ? 'dine-in' : 'takeaway'`; `source: 'pos'`; `orderNumber = generateOrderNumber(tenantSlug)` (prefijo `SLG-YYMMDD-NNNN`, único global); `customer.name` no vacío (lo exige el schema); `payment.status: 'pending'`.

`toPosOrder(doc)` devuelve `id = doc.posId` y **rechaza** (`PosError.internal`) si `posId` es `null`: exponer `_id` como `id` rompería la idempotencia. `tableId` ausente queda `undefined`, no `null`.

### 5.5 Errores tipados — `apps/saas/lib/pos/errors.ts`

`PosError` con `code` ∈ `validation | unauthorized | forbidden | not_found | transition_invalid | conflict | idempotency_mismatch | internal`, status HTTP derivado por código, y factories (`PosError.notFound()`, `PosError.transition(from, to, allowed)`…).

- `PosError.transition` expone los destinos legales en `detail` → **el POS no reimplementa el grafo**, consulta el error.
- `toPosErrorResponse()` serializa el detalle para errores de negocio, y para cualquier `Error` genérico devuelve `500 internal` **opaco**: no se filtra el mensaje (test explícito: un `MongoServerError: dup key` jamás llega al cliente).

### 5.6 Tests nuevos

| Suite | Tests | Cubre |
|-------|-------|-------|
| `__tests__/lib/orderMapper.test.ts` | 24 | recálculo de totales · rechazo de `total` trucha · `quantity<1` · precios negativos · `productId` no-ObjectId · required del schema · `dine-in`/`takeaway` · fallo sin persistir nada · round-trip completo · `id = posId` · sin `posId` ⇒ rechazo |
| `__tests__/lib/pos-shared.test.ts` | 21 | grafo de mesas (incluye el mensaje exacto con `→`) · grafo de órdenes · terminales · `requires_manual_attention` recuperable · `canEditOrderItems` · `cashExpectedDelta` efectivo vs MP · idempotencia por `relatedOrderId` · routing multi-caja con fallbacks · mapeo `PosError`→status · opacidad del 500 |

---

## 6. M4 — Endpoints `/api/[tenant]/pos/*` ✅

### 6.1 Fundamento — tenant → auth → sede → body

Los helpers **nuevos** viven en `apps/saas/lib/pos-online/`. (`lib/pos/` es la
fábrica de conectores salientes a terceros — Fudo, Bistrosoft — preexistente:
no se tocó; separar "POS → SaaS" de "SaaS → tercero" es la razón del nombre.)

| Archivo | Qué hace |
|---------|----------|
| `tenantContext.ts` | `resolvePosContext()` → `PosContext { request, user, tenantId, tenantSlug, locationId, scopedByToken }` |
| `route.ts` | `posRoute(handler)` — encapsula **tenant → auth → sede → handler** dentro de un `try` que termina en `toPosErrorResponse`. Ninguna ruta puede "olvidarse" de un guard ni verter un stack de Mongoose. También `readPosBody` (JSON roto ⇒ 400 tipado, límite 100 KB) y `requireFields` |
| `errors.ts` | `PosError` + `toPosErrorResponse` (ver §5.5) |
| `orderMapper.ts` / `orderRepo.ts` | ver §6.2 |
| `tableMapper.ts` / `tableRepo.ts` | ver §6.3 |
| `cashMapper.ts` / `cashRepo.ts` | ver §6.4 |
| *(menú)* | sin helper propio: la ruta importa `flattenMenuSnapshot` de `@takeasygo/business` — ver §6.5 |

**Regla de sede** (implementada en `resolvePosContext`, testeada en `pos-context.test.ts`):

| # | Situación | Resultado |
|---|-----------|-----------|
| 1 | El token trae `locationId` | Es el alcance. Si la petición declara **otra** sede ⇒ `403` (un token atado a una sede no escribe en otra) |
| 2 | Token sin sede (legacy single-sede) | La sede la declara la petición (`X-Location-Id` o `?locationId=`) y se valida contra `Location {_id, tenantId, isActive:true}` ⇒ `403` si es ajena (sin filtrar la existencia de sedes) |
| 3 | Ni token ni declaración | Con **una** sola sede activa se resuelve sola; con 0 o con >1 ⇒ `400 validation` tipado |

El server **nunca inventa una sede**. `locationId` entra en el filtro de cada
query: una mesa/caja/orden de otra sede responde `404`, no `403`.

### 6.2 Orders

| Ruta | Comportamiento |
|------|----------------|
| `GET /pos/orders` | Listado con `status`, `tableId`, `updatedSince`, `limit ≤ 500`. El filtro **fija** `source: 'pos'` y `posId: {$type:'string'}` para que un documento sin `posId` no pueda tumbar la lista entera con un 500 |
| `POST /pos/orders` | Crea. `Idempotency-Key` (si viene) debe ser igual a `body.id`; replay de payload idéntico ⇒ `200`, distinto ⇒ `409 idempotency_mismatch`. Colisión de `orderNumber` ⇒ reintenta con otro |
| `GET/PATCH /pos/orders/[id]` | `PATCH` cambia estado vía `isValidOrderTransition`; en `409 transition_invalid` el `detail` trae `Allowed: [...]` para que el POS muestre el camino legal sin reimplementar el grafo. Concurrency optimista sobre `updatedAt`. Al `cancelled`/`delivered` libera la mesa si `currentOrderId` coincide |
| `POST /pos/orders/[id]/items` | Agrega. Bloqueado por `canEditOrderItems` ⇒ `409` |
| `PATCH/DELETE /pos/orders/[id]/items/[productId]` | El POS identifica ítems por **`productId`**, no por índice: se afectan **todos** los ítems cuyo `menuItemId` coincida. `quantity: 0` ⇒ elimina (paridad con el POS). Los totales se recalculan con `recomputeOrderTotals` |

### 6.3 Tables

| Ruta | Comportamiento |
|------|----------------|
| `GET /pos/tables` | Filtros `section` y `status` (validado contra `TABLE_STATUSES`). Orden por `number` |
| `POST /pos/tables` | Crea. Replay por `posId` ⇒ `200`; número repetido en la sede ⇒ `409 conflict` |
| `GET/PATCH /pos/tables/[id]` | Transición vía `isValidTableTransition` + `allowedTableTransitions`. `RELEASE_TARGETS = ['free','closed']` limpian `currentOrderId`/`serverId`/`needsBill`. **`assertCanRelease`** impide liberar/cerrar una mesa con la orden todavía en curso (`pending`/`preparing`/…) ⇒ `409 conflict`. `needsBill` solo toca el flag |

### 6.4 Cash

Las tres reglas del Consenso v1 están **del lado del server**, no del cliente:

| Regla | Implementación |
|-------|----------------|
| §1 — el arqueo suma **solo** efectivo | `cashExpectedDelta()` de `@takeasygo/business`; el server aplica `$inc` con ese delta y **no** confía en el valor del cliente |
| §2.1 — idempotencia de movimientos | Índice único parcial `(registerId, relatedOrderId, type)` en `CashMovement`. El reintento devuelve el existente; con contenido distinto ⇒ `409 idempotency_mismatch` |
| §2 — una caja abierta por sede | Índice único parcial `(tenantId, locationId)` con `status:'open'`. El alcance correcto es **por sede**: por tenant rompería multi-sede |
| §3 — el Z es un snapshot inmutable | Se genera **una sola vez** al cerrar, con guard `{_id, status:'open'}`: dos cierres simultáneos no pueden producir dos Z distintos |
| — arqueo honesto | Al cerrar, `expectedAmount` se **recalcula desde los movimientos reales** (`recomputeExpectedAmount`). El valor denormalizado sirve para la vista en vivo; el que entra al Z es el de la fuente de verdad (test: se fuerza una deriva de `999999` y el Z no la hereda) |

| Ruta | Comportamiento |
|------|----------------|
| `GET /pos/cash/registers` | `?status=open\|closed\|all`, `limit ≤ 100`. Movimientos embebidos (contrato del POS) resueltos en **una** query agrupada, sin N+1 |
| `POST /pos/cash/registers` | Abre. Replay por `posId` ⇒ `200`; firma distinta o sede distinta ⇒ `409 idempotency_mismatch`; caja ya cerrada ⇒ `409`; segunda caja en la sede ⇒ `409 conflict` (también si gana la carrera el índice) |
| `GET /pos/cash/registers/[id]` | Una caja con sus movimientos |
| `POST /pos/cash/registers/[id]/movements` | Valida `type`/`channel`/`paymentMethod` contra los enums, monto entero en centavos `> 0`. Insert **primero**, `$inc` después: si el insert falla nunca se aplicó el delta; si el `$inc` se pierde, el cierre recalcula |
| `POST /pos/cash/registers/[id]/close` | Recalcula arqueo, `difference = final - expected`, `generateZReport`, `shareToken = randomUUID()` |

**Centavos enteros de punta a punta**: no hay conversión en el mapper
(`toPesos` es solo para mostrar). `initialAmount`/`amount`/`finalAmount` son
enteros en centavos y se validan con `assertCents`.

### 6.5 Menu

| Ruta | Comportamiento |
|------|----------------|
| `GET /pos/menu` | Snapshot aplanado `MenuSnapshot { version, tenantId, products, categories, createdAt, signature, serverTime }` (contrato §1.3). Filtra `{tenantId, locationId, isActive:true}` |

**Sin duplicar la regla.** El aplanado (herencia de grupos de la categoría,
desactivados por id/nombre, variantes, inyección de `__half_*`) se extrajo de
`apps/sync/src/routes/menu.ts` a `packages/business/src/menu-flatten.ts` y
**sync importa esa misma función**. Una regla de negocio, dos lectores: el POS
y el SaaS no pueden divergir en mitad-y-mitad.

| Concepto | Decisión |
|----------|----------|
| `signature` | `sha256(JSON.stringify({p: products, c: categories}))`. Es el detector de cambios **real**: en M5 el POS lo compara antes de reescribir Dexie |
| `version` | `floor(max(menu.updatedAt)/1000)`, `1` si todavía no hay menú. Cómodo para el humano y para `Order.menuVersion`; **`signature` es la autoridad** (si se borra un menú puede bajar) |
| Preflight | Next responde `OPTIONS` solo (expone `Allow`); `next.config.ts` agrega los CORS. Verificado contra la doc de Next 16 y testeado en `pos-cors.test.ts` |

Dos correcciones que salieron al construirlo:

- **`X-Location-Id` no estaba en `Access-Control-Allow-Headers`** ⇒ todo
  preflight del POS habría fallado (el header lo dispara). Agregado junto con
  `Access-Control-Max-Age: 600` para el polling de 5–10 s.
- **`halfPrice` no existía en `apps/saas/models/Menu.ts`** (sí en
  `@takeasygo/db`, que declara "matches apps/saas/models/Menu.ts"). Con
  `strict` el campo se descartaba al escribir: mitad-y-mitad no podía
  persistirse desde el SaaS. Agregado al schema y a la interfaz.

### 6.6 Tests nuevos

| Suite | Tests | Cubre |
|-------|-------|-------|
| `__tests__/integration/pos-context.test.ts` | 20 | las 3 reglas de sede · slug malformado · tenant inexistente · token de otro tenant · token con sede ajena · sede declarada inexistente/inactiva · 0 y >1 sedes activas · orden de operación (401 antes que 400) |
| `__tests__/integration/pos-orders.test.ts` | 20 | listado aislado · creación + replay/mismatch · `orderNumber` duplicado · transiciones válidas/inválidas con `Allowed:` · concurrency optimista · liberación de mesa |
| `__tests__/integration/pos-order-detail.test.ts` | 22 | ítems por `productId` · `quantity: 0` ⇒ eliminar · bloqueo por `canEditOrderItems` · recálculo de totales · ítem/orden inexistentes |
| `__tests__/integration/pos-tables.test.ts` | 17 | listado + filtros · creación/replay/número repetido · grafo de transiciones · no liberar con orden activa · `needsBill` aislado · aislamiento de sede |
| `__tests__/integration/pos-cash.test.ts` | 23 | §1 efectivo vs MP · §2.1 idempotencia por `relatedOrderId`+tipo y por `posId` · §2 una caja abierta · §3 Z + recalculo del arqueo · faltante/sobrante · cierre doble · validaciones |
| `__tests__/integration/pos-menu.test.ts` | 11 | guardas (401/400/403) · snapshot vacío · herencia de grupos · `disabledGroupIds` · mitad-y-mitad con ≥2 / con 1 · menús inactivos y aislamiento de sede · `signature` estable y cambiante · `version` en segundos |
| `__tests__/lib/pos-cors.test.ts` | 4 | origen explícito y nunca `*` · override por `POS_CORS_ORIGIN` · métodos + `Authorization`/`Content-Type`/`Idempotency-Key`/`X-Location-Id` · `Max-Age` |

---

## 7. M5 — El POS habla con el SaaS ✅

**Objetivo cumplido:** `apps/pos` habla con `apps/saas` por `/api/[tenant]/pos/*`.
La UI y los hooks no se tocaron — solo el cuerpo de `services/*` — y Dexie quedó
como **read-model escrito después de que el server confirma**.

### 7.1 Decisiones de este módulo

| # | Pregunta | Decisión | Por qué |
|---|----------|----------|---------|
| 1 | ¿Salir del outbox para las escrituras que posee el POS? | **Sí — server-first puro** | Sin `enqueue`: si el server no contesta, no hay evento local que perder ni replay que ordenar. Dexie no avanza. |
| 2 | ¿`notifyStatusToSyncLayer`? | **Se mantiene igual** — fire-and-forget *después* de escribir Dexie, misma firma | Mientras exista `POST /api/v1/orders/:id/status` sigue siendo correcto; se retira en M6 junto con el polling. |

El outbox **sigue vivo** para los flujos que no son escrituras del POS:
`command.ts` (comandos de cocina, derivados localmente en V1) y
`external-orders.ts`. Esos siguen encolando.

### 7.2 Regla de validación del módulo

> Las reglas de **dominio** (items, totales, grafo de transiciones, ciclo de
> vida de la mesa, apertura/arqueo de caja) las decide **solo el server**.
> Del lado cliente quedan únicamente guardas triviales de argumentos que no
> pueden divergir: `quantity < 0`, `amount <= 0`.

- `table.ts` **dejó** de importar `assertTableTransition` y de chequear en
  Dexie si la mesa estaba libre/ocupada. Esas precondiciones producían
  **falsos rechazos** con datos locales viejos; ahora el server responde
  `409 conflict` con el estado real.
- `order.ts` **dejó** de importar `validateOrderItems`: un carrito vacío lo
  rechaza el server con `400 validation`, no una regla local que puede quedar
  fuera de paso.
- `cash.ts` dejó de generar el Z localmente: el arqueo lo arma el server y
  devuelve `zReport` + `shareToken` ya calculados.

Lo que **no** cambió: toda validación pura de entrada sigue en el cliente para
fallar rápido sin round trip, y la lógica de negocio vive en
`@takeasygo/business`, nunca reimplementada inline.

### 7.3 Cliente HTTP único

Nuevo `apps/pos/src/services/pos-api.ts` — único punto por el que salen las
llamadas al SaaS:

| Pieza | Detalle |
|-------|---------|
| URL | `import.meta.env.VITE_SAAS_URL` + `/api/{tenantId}/pos/...` (resuelta perezosamente, testeable con `vi.stubEnv`) |
| JWT | **No** es parámetro de los servicios: se lee de `sessionStorage[SESSION_CACHE_KEY]` en cada request. Los hooks siguen pasando solo `tenantId`; `jwt` existe únicamente en las funciones de estado de orden por compatibilidad de firma |
| Sede | Header `X-Location-Id` desde `db.tenantConfig` |
| Idempotencia | `Idempotency-Key` = `posId`, el `crypto.randomUUID()` que generó el cliente |
| Errores | `PosApiError` con `code` tipado y `detail` del server; 500 es opaco |
| 401 | Dispara el evento `auth:expired` para que `AuthContext` cierre sesión |

El orden de operación del server sigue siendo **tenant → auth → sede → body**,
y el cliente nunca manda una sede que no venga de su propia configuración.

### 7.4 Mapeo servicio → endpoint

| Servicio | Lectura (Dexie, local) | Escritura (server) |
|----------|------------------------|--------------------|
| `menu.ts` | `db.menuSnapshot` | `GET /pos/menu` → `signature`/`version`; solo reescribe si cambió |
| `table.ts` | `db.diningTable` | `POST /pos/tables`, `PATCH /pos/tables/[id]` |
| `cash.ts` | `db.cashRegister` | `GET /pos/cash/registers`, `POST /pos/cash/registers`, `GET .../[id]`, `POST .../[id]/movements`, `POST .../[id]/close` |
| `order.ts` | `db.orders` | `POST /pos/orders`, `PATCH /pos/orders/[id]`, `POST .../items`, `DELETE .../items/[productId]`, `PATCH .../items/[productId]` |
| `z-report.ts` | — | Ya no escribe: `generateZReport` es un re-export de `@takeasygo/business` que solo usa el test del arqueo |

Los items se identifican por **`productId`**, nunca por índice
(`menuItemId.toString() === productId`), y `quantity: 0` significa quitar.

### 7.5 Fechas (D10)

El wire devuelve ISO. Nuevo `apps/pos/src/services/pos-wire.ts` rehidrata
antes de tocar Dexie: `rehydrateRegister` (`openedAt`, `closedAt`, `movements[]`,
`zReport.closedAt/generatedAt`), `rehydrateOrder` (`createdAt`, `updatedAt`,
`syncedAt`, `integratedAt`) y `rehydrateMovement` (`timestamp`).

`assignPendingMovements` ahora **trae el registro del server** antes de decidir:
si el server falla, los movimientos pendientes quedan en Dexie; solo se borran
tras una respuesta exitosa.

### 7.6 Hueco de concurrencia (cerrado en M6)

Sin outbox y sin polling todavía, dos terminales no se veían entre sí: cada
una solo ve sus propias escrituras. Si la caja estaba abierta en otra
terminal, `openRegister` devolvía `409` y no había forma local de
descubrirlo. **D14 — cerrado en §8.** La costura que dejó listo este módulo
fue `refreshRegisters(tenantId)`, que desde M6 delega en el mismo
`syncRegisters` que usa el polling.

### 7.7 Verificación de M5

```
apps/pos: typecheck 0 · lint en los 9 archivos tocados 0/0 ·
          117 tests → 116 OK, 1 fallo preexistente (D9)
          (los 202 tests de negocio del server siguen verdes: 35 files / 439)
```

| Suite `apps/pos/src/__tests__` | Tests | Qué cubre |
|--------------------------------|-------|-----------|
| `pos-api.test.ts` *(nuevo)* | 11 | URL, JWT de sessionStorage, `X-Location-Id`, `Idempotency-Key`, traducción de errores, `auth:expired` |
| `table.test.ts` *(nuevo)* | 17 | Server-first: sin outbox, sin validación local de transición, Dexie después del 200/201 |
| `cash.test.ts` *(reescrito)* | 16 | Apertura, movimientos, cierre con `zReport` del server, `assignPendingMovements`, `refreshRegisters` |
| `order.test.ts` *(nuevo)* | 13 | `posId = Idempotency-Key`, items por `productId`, `mostrador-*` no viaja, errores 400/409 sin tocar Dexie |
| `order-status.test.ts` *(reescrito)* | 19 | Transiciones de estado + liberación de mesa reflejada localmente |
| `sync-cash.test.ts`, `z-report.test.ts` | 11 | Sin cambios (mockean `./cash`; validan la regla compartida del arqueo) |
| `external-orders.test.ts` | 30 | Preexistente — **1 fallo también preexistente (D9)** |

Total al cerrar M5: 117. Con `polling.test.ts` (M6) el suite queda en 130.

---

## 8. M6 — Concurrencia entre terminales ✅

**Objetivo cumplido:** dos terminales del mismo local se ven entre sí. M5 dejó
las escrituras server-first, pero cada terminal solo veía lo que ella misma
escribía — el hueco **D14**: con la caja abierta en otra, `openRegister`
respondía `409` y no había forma local de enterarse.

### 8.1 El contrato ya existía

**M6 no tocó el server.** Los tres `GET` necesarios ya estaban desde M4:

| Endpoint | Filtro | Uso del polling |
|----------|--------|-----------------|
| `GET /pos/tables` | `section`, `status` | mesas de la sede |
| `GET /pos/orders` | `status`, `tableId`, `updatedSince`, `limit` | las 200 más recientes por `updatedAt` |
| `GET /pos/cash/registers` | `status=all`, `limit` | cajas de la sede con sus movimientos |

Se usa `limit=200` ordenado por `updatedAt desc` en vez de `updatedSince`:
el watermark se calcularía con `serverTime` (que se genera **después** del
query) y se saltearían los registros escritos justo entre el query y la
respuesta. Con `updatedAt desc` siempre entran las que pueden cambiar.

### 8.2 Tres reglas — `apps/pos/src/services/polling.ts` (nuevo)

| # | Regla | Por qué |
|---|-------|---------|
| 1 | **Nunca borra** | `/pos/orders` solo devuelve `source: "pos"` de esta sede; Dexie además guarda órdenes externas que el server no conoce. Borrar lo que "falta" destruiría datos ajenos. Es upsert puro. |
| 2 | **Difiere antes de escribir** | Un `put` idéntico igual dispara `useLiveQuery` y re-renderiza la pantalla entera cada 7 s. Compara con una serialización de claves ordenadas (un `JSON.stringify` simple marcaría cambios inexistentes por orden de claves). |
| 3 | **No se cruza con una mutación propia** | Ver §8.3 |

### 8.3 Invariante — por qué la comprobación no tiene `await` en el medio

El riesgo real: el polling pide el estado, mientras tanto esta terminal
confirma una mutación, y el polling termina escribiendo encima una respuesta
ya vieja.

```
polling: fetch ──────────────► guardia ──► bulkPut
mutación:      fetch ──► put(fresca)
                              ▲
              si esto se cruza, la fresca se pierde
```

Dos señales en módulo, ambas manejadas por `runMutation()`:

- `activeMutations` — hay una mutación en vuelo → **aborta el tick**.
- `completedMutations` — terminó una mutación después de que el polling
  capturó su `epoch` → **aborta el tick**.

Y una regla de orden: la comprobación corre **sin ningún `await` entre ella
y el `bulkPut`**. Como Dexie serializa por orden de llamada, una mutación que
empiece *después* de la comprobación se cola detrás y gana ella, que es la
fresca. Para que las señales cierren, `runMutation` decrementa
`activeMutations` e incrementa `completedMutations` **en el mismo bloque
sincrono**, después de su escritura.

Es reentrante: `assignPendingMovements` llama `addMovement` por cada
pendiente y el contador simplemente sube y baja.

### 8.4 Alcance y programación

| Aspecto | Decisión |
|---------|----------|
| Intervalo | **7 s** (dentro del rango 5–10 s que fija el plan) |
| Primer tick | **Inmediato** en `startPosPolling`: una terminal recién abierta no puede esperar 7 s con Dexie vacía |
| Page Visibility | `visibilitychange` → fuera de foco se detiene el timer; al volver, se reinicia **y corre un tick** |
| Fallo parcial | `Promise.allSettled`: si una colección responde mal, las otras dos igual se aplican |
| Solapamiento | Un tick en vuelo bloquea al siguiente (`ticking`) |
| Ubicación | `App.tsx`, en el mismo efecto autenticado que ya hace `startConnectivityMonitoring()` |

Los hooks **no se tocaron**: `useTables`, `useCash` y `useOrders` leen con
`useLiveQuery`, así que reaccionan solos a los `put` del polling.

### 8.5 Lo que NO cambió

- **`notifyStatusToSyncLayer` sigue.** El polling cubre la concurrencia
  entre terminales del **POS**; el empuje de estado a Sync Layer (para que
  emita por socket a cocina/otras terminales) es otro camino. Retirarlo es
  **D16**, decisión aparte — el usuario eligió "mantenerlo como está".
- `refreshRegisters()` ahora **delega** en `syncRegisters()` (mismo diff,
  mismas guardas) en vez de hacer un `bulkPut` propio.
- Impresión, kitchen commands y el outbox de flujos no-POS: intactos.

### 8.6 Verificación de M6

```
apps/pos: typecheck 0 · lint en los 14 archivos tocados 0/0 ·
          130 tests → 129 OK, 1 fallo preexistente (D9)
```

Nuevos: `src/__tests__/polling.test.ts` — **13 tests**

| Qué cubre | Casos |
|-----------|-------|
| Diff-then-put | primer tick hidrata las 3 colecciones · tick repetido sin cambios escribe 0 · reescribe solo lo que cambió · **lo que no viene no se borra** |
| D10 | `createdAt`/`openedAt`/`timestamp` llegan como `Date` |
| Guardia | mutación en vuelo → no sale a buscar nada · mutación que termina *dentro* del fetch → aborta · mutación posterior gana |
| Programación | tick inmediato + intervalo · pausa con pestaña oculta y retoma con tick · reinicio al cambiar de sede |
| Resiliencia | una colección en 500 no detiene a las otras dos · `refreshRegisters` delega |

---

## 9. Verificación

```bash
pnpm --filter @takeasygo/business build        # EXIT=0  (dist regenerado; el POS resuelve vía dist)
pnpm --filter @takeasygo/business typecheck    # EXIT=0
pnpm --filter @takeasygo/saas typecheck        # EXIT=0
pnpm --filter @takeasygo/saas test             # 35 files / 439 tests, EXIT=0
pnpm --filter @takeasygo/sync typecheck        # EXIT=0
pnpm --filter @takeasygo/sync test             # 20 tests, EXIT=0
pnpm --filter @takeasygo/pos typecheck         # EXIT=0
pnpm --filter @takeasygo/pos test              # 130 tests, 1 fallo preexistente (D9)
# lint en todos los archivos tocados (business + saas + pos): EXIT=0
```

| Suite | Tests | Módulo |
|-------|-------|--------|
| `__tests__/lib/posJwt.test.ts` | 15 | M2 |
| `__tests__/integration/pos-guards.test.ts` | 19 | M2 |
| `__tests__/lib/orderMapper.test.ts` | 24 | M3 |
| `__tests__/lib/pos-shared.test.ts` | 21 | M3 |
| `__tests__/integration/pos-context.test.ts` | 24 | M4 |
| `__tests__/integration/pos-orders.test.ts` | 20 | M4 |
| `__tests__/integration/pos-order-detail.test.ts` | 22 | M4 |
| `__tests__/integration/pos-tables.test.ts` | 19 | M4 |
| `__tests__/integration/pos-cash.test.ts` | 23 | M4 |
| `__tests__/integration/pos-menu.test.ts` | 11 | M4 |
| `__tests__/lib/pos-cors.test.ts` | 4 | M4 |
| **Total de suites POS Online (server)** | **202** | |

El total de la app saas (35 files / 439 tests) incluye suites preexistentes.

Los tests del **lado POS** suman **130 (129 OK)** y están desglosados en
§7.7 (M5) y §8.6 (M6); los 117 anteriores a M6 siguen pasando.

### Nota sobre `typecheck`

El script quedó en `node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit`: con el heap default el proceso se quedaba sin memoria (OOM). Además se regeneró el `.next` dev types corrupto que hacía fallar el typecheck.

### Nota sobre `lint`

El repo arrastra **2476 errores** preexistentes (casi todos `no-explicit-any` en `scripts/`). En los archivos tocados por este trabajo se limpiaron todos los que había, incluidos 5 preexistentes en `models/Order.ts` y 1 en `models/Menu.ts`. No se tocó el resto.

> Atajo útil: en `apps/saas`, `pnpm exec eslint "app/api/**/pos/**/*.ts"` — con
> `app/api/[tenant]/...` los corchetes se leen como glob y eslint no encuentra
> archivos.

### Nota sobre `apps/pos` — 1 test roto es preexistente

`apps/pos` tiene **un** fallo: `external-orders.test.ts > transformExternalOrder > updates the SAME record`. Se probó que **no es de este trabajo** ejecutando el suite con mis 3 archivos stashados (`git stash` → mismo fallo → `git stash pop`). No se tocó.

---

## 10. Deuda documentada

| # | Ítem | Impacto | Cuándo |
|---|------|---------|--------|
| D1 | `POS_CORS_ORIGIN` sin definir en producción | Bloquea M4 en prod | Antes de M4 |
| D2 | Limpiar `POS_JWT_PUBLIC_KEY` corrupta en Vercel | Ruido operativo; no rompe (fallback) | Cualquier momento |
| D3 | `/api/:tenant/orders` y `/api/:tenant/menu` con `*` | Contrato público consumidor; ya existía | Revisión de contratos |
| D4 | 2476 errores de lint del repo | No bloquea | Backlog |
| D5 | Índice duplicado en `User.email`/`phone`, `QrPromo.scope`/`code` (warnings de Mongoose) | Solo warnings | Backlog |
| D6 | Kitchen commands se derivan localmente (sin server) | Aceptado para V1 | M5 |
| D7 | Polling en vez de socket | Costo Vercel / latencia | V2 |
| D8 | `@takeasygo/business` sin runner de tests (sus tests viven en `apps/saas`) | Los tests dependen del alias del consumidor | Backlog |
| D9 | `external-orders.test.ts` roto en `apps/pos` (preexistente, verificado con stash) | Ruido en CI del POS | Backlog |
| D10 | ~~El wire JSON devuelve fechas como **string ISO**~~ | **Cerrado en M5**: `apps/pos/src/services/pos-wire.ts` rehidrata con `new Date(...)` antes de tocar Dexie | — |
| D11 | ~~El aplanado del menú vive solo en `apps/sync`~~ | **Cerrado en M4**: `packages/business/src/menu-flatten.ts`, importado por sync **y** por `GET /pos/menu` | — |
| D12 | Existen **dos** modelos de la colección `menus`: `apps/saas/models/Menu.ts` y `packages/db/src/models/menu.ts`. El comentario del segundo dice "matches apps/saas/models/Menu.ts" y no era cierto (`halfPrice`, `subcategories`, `hiddenReward`, `likesCount`) | `.lean()` devuelve el BSON crudo, así que las **lecturas** estaban bien; las **escrituras** con `strict` descartaban campos. `halfPrice` ya se agregó; el resto sigue divergido | Backlog — unificar en un solo modelo |
| D13 | `flattenMenu` **no recorre `categories[].subcategories[]`**: un ítem dentro de una subcategoría no llega al snapshot | Es exactamente lo que hace sync **hoy**; se portó fielmente en vez de cambiar el menú en silencio. Si el POS debe ver subcategorías, es un cambio de producto explícito | Decisión de producto |
| D14 | ~~Sin outbox y sin polling, dos terminales no se ven entre sí~~ | **Cerrado en M6**: `services/polling.ts` hace diff-then-put de mesas/órdenes/cajas cada 7 s, pausado con Page Visibility, con guardia de cruce contra mutaciones propias (§8) | — |
| D15 | `uploadZReport` (`z-report-sync.ts`) y `getShareUrl` (`cash.ts`) **no tienen llamadores**: la vista compartida del Z (`{SYNC_URL}/api/v1/z-report/{shareToken}`) no está cableada en el POS | El `shareToken` que devuelve el server se guarda y no se usa | Decisión de producto |
| D16 | El server de POS escribe directo en `orders` de SaaS, pero el Sync Layer registra órdenes en su **propia** colección (`SyncOrderModel`). Una orden `source:"pos"` no tiene registro de sync | Mientras siga `notifyStatusToSyncLayer` no hace falta. **M6 no lo retiró**: el polling sincroniza entre terminales del POS, el notify empuja estado a Sync Layer por socket. Retirarlo es un cambio aparte | Decisión |
| D17 | `_serverId` sigue en la firma de `createOrder` (lo pasa `useOrders`) pero no tiene equivalente en el contrato `/pos/orders` — la mesa se ocupa con `occupyTable()` aparte | Parámetro muerto con `eslint-disable` documentado. Los hooks no se tocan en V1 | Cuando se puedan tocar hooks |

---

## 11. Siguiente — E2E y puesta en producción

M1–M6 están completos, testeado y documentado. No queda código pendiente en
el alcance de V1; lo que sigue es **verificación en ambiente real** y
**decisiones**, no módulos nuevos.

### 11.1 Antes de tocar producción (bloqueante)

- **D1 — `POS_CORS_ORIGIN` en Vercel.** Sin esto ninguna llamada del POS
  llega al SaaS: el navegador la bloquea por CORS. Es lo único que bloquea
  de verdad el despliegue de M4–M6.
- **D2 — limpiar `POS_JWT_PUBLIC_KEY`** corrupta en Vercel (ruido operativo,
  no rompe: hay fallback).

### 11.2 E2E sugerido (dos terminales reales)

1. Terminal A abre caja → en menos de 7 s la terminal B la ve **abierta**
   (antes: 409 sin explicación — D14).
2. A ocupa la mesa 1 con una orden → B la ve ocupada con la orden.
3. B confirma la orden → A la ve confirmada.
4. A cierra caja (Z) → B ve la caja cerrada y el historial.
5. Con la pestaña de B oculta: ningún request de polling (Network tab).
6. Con una mutación de A en vuelo a mitad de un tick de B: B no retrocede
   de estado.

### 11.2a Resultados del E2E — 2026-10-04 (parcial)

Ejecutado por el operador sobre producción (SaaS + POS reales):

- [x] Pedido creado en SaaS cae en el POS (cola de Pedidos entrantes).
- [x] **POS → SaaS**: marcar estados en el POS cambia el estado en SaaS.
- [x] **Mostrador completo**: abrir mesa → cargar pedido → validar → cobrar
  en efectivo → cerrar mesa → la venta suma en Ventas.
- [ ] **SaaS → POS** (el bug corregido en `7e2e780`): mover/cancelar un
  pedido desde el admin del SaaS y verlo reflejado en el POS. Requiere
  redeploy del Sync en EC2 + Vercel redesplegado.
- [ ] Dos terminales: pasos 1–6 de §11.2.
- [ ] Cancelación desde SaaS suelta el pedido en POS; `offline_timeout` no
  cancela pedidos vivos (guard nuevo de `7e2e780`).

**Falló en la primera corrida (2026-10-04):**

1. **SaaS → POS cancel** no llegó al POS (el pedido quedó activo ahí).
   El cableado del SaaS está completo (`maybeNotifySyncLayerStatus` en la
   ruta de status, `confirmOrderPayment` en confirm-transfer-admin); la
   variable que falta es el **redeploy del Sync en EC2** (con el código
   viejo el emit usa el id del SaaS y el POS no lo encuentra). Pendiente
   de confirmar + retestear. Además se agregó el **terminal guard** de la
   ruta status: por `X-Internal-Secret` un `cancelled`/`delivered` del
   SaaS ya no se puede resucitar con otro estado desde el POS.
2. **Salón: mesa no se marcaba ocupada** al abrir la mesa con items sin
   cobrar — la ocupación solo existía en `handlePay`. Ahora el cajero
   ocupa la mesa al cargar el primer item (ocupación *draft* server-first,
   sin orden): `occupyTableForLoading` / `bindTableOrder` (services),
   free automático al vaciar el carrito/cambiar de mesa, y en el cobro se
   vincula la orden real (o se ocupa si sigue libre) releyendo el estado
   fresco.

### 11.3 Decisiones de producto abiertas (no son de código)

| # | Decisión |
|---|----------|
| D15 | Cablear o descartar la vista compartida del Z (`shareToken` → `GET /api/v1/z-report/{token}`) |
| D13 | Si el POS debe ver ítems dentro de `categories[].subcategories[]` |
| D16 | Si se retira `notifyStatusToSyncLayer` una vez el estado del POS viaja por polling |
| D7 | Socket vs. polling (costo Vercel / latencia) — es V2 |

### 11.4 V2

- **Escritura offline**: hoy Dexie se toca directo desde `services/*`. No
  existe `apps/pos/src/repositories/`; meter una capa de repositorios es lo
  que haría que el swap a offline fuera una línea. Es trabajo nuevo, no un
  pendiente de V1.
- Reemplazar polling por socket (D7).

Reglas que siguen valiendo en cualquier módulo posterior:

- Orden de operación: **tenant → auth → sede → body**.
- Las reglas de dominio se deciden **solo en el server** (§7.2).
- Centavos enteros de punta a punta; ninguna conversión en un mapper.
- El read model **nunca** se borra desde el cliente (§8.2).
- La UI y los hooks no se tocan: sigue cambiando solo el cuerpo de `services/*`.
- Impresión: **no se toca**.

