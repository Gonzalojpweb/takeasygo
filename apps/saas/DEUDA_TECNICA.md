# Deuda Técnica Pendiente — TakeasyGO

> Generado: 2026-08-30
> Última actualización: 2026-09-02 (cierre item E + item #9 + Sync activo)

---

## 1. platformConfig null — Hallazgo y estado

### ¿Qué es?

El documento `platformConfigs/{_id: 'platform'}` es un singleton que almacena la configuración global de la plataforma (comisiones, MercadoPago, Kripton, estilos QR, maintenance mode). El schema lo define como `{ _id: { type: String, default: 'platform' } }` en `apps/saas/models/PlatformConfig.ts:48`.

### ¿Se crea automáticamente?

**No.** No existe ningún mecanismo automático de creación (startup hook, middleware, seed, migración). Solo se crea en 4 puntos, todos bajo demanda:

| Punto de creación | Archivo | Tipo |
|---|---|---|
| `POST /api/superadmin/platform-config` | `app/api/superadmin/platform-config/route.ts` | `upsert: true` al guardar config |
| `GET /api/superadmin/qr-promo-defaults` | `app/api/superadmin/qr-promo-defaults/route.ts` | `PlatformConfig.create({ _id: 'platform' })` explícito |
| `PUT /api/superadmin/qr-promo-defaults` | `app/api/superadmin/qr-promo-defaults/route.ts` | `upsert: true` al guardar estilos |
| `_set_maintenance.js` | `scripts/_set_maintenance.js` | `upsert: true` CLI manual |

### ¿Existe en producción hoy?

**Sí, porque el superadmin configuró la plataforma al menos una vez.** El script E2E (`scripts/cash-e2e/e2e.ts:167-175`) lo documenta explícitamente: *"En prod el doc platformconfigs/{_id:'platform'} siempre existe (lo crea el superadmin)."*

### ¿Riesgo real de que falte?

**Riesgo bajo en el corto-mediano plazo**, pero no nulo. Escenarios posibles:
- Si se recrea la DB de producción (nuevo Atlas cluster, migración), no se crearía hasta que un superadmin guarde config por primera vez.
- Si el onboarding de un tenant nuevo requiere `payment-methods` antes de que el superadmin haya tocado la config global, el endpoint fallaría 500.

### Estado del hardening

Aplicado `platformConfig || {}` en los 6 call-sites de pricing en `payment-methods/route.ts` (líneas 66-94). Las funciones de `lib/pricing.ts` ya usan `?? 1` / `?? 0` para valores faltantes, así que pasar `{}` produce el mismo resultado que pasar el documento real con defaults.

### Riesgo residual

**Bajo.** Los 13 puntos de lectura de `platformConfig` en el codebase son seguros vía optional chaining (`config?.field`) o `|| {}`. La única excepción es `lib/mp-platform.ts` que lanza error descriptivo si `mercadopago.isConfigured` es missing — correcto, porque no se puede usar MP sin credenciales.

### Recomendación (urgencia: medio)

Crear un script de seed o un middleware de startup que verifique la existencia del documento y lo cree con valores por defecto si falta. Alternativa: agregar un `PlatformConfig.findOrCreate` en `connectDB()`.

---

## 2. Multi-sede (E, B, A, C) — Auditoría completada

### Estado: CERRADO ✅ (validado HTTP + sockets)

| Item | Estado | Commits | Harness |
|------|--------|---------|---------|
| **E** — Precio × sede + socket isolation | ✅ Cerrado | `1b8594b` | HTTP 10/10 + socket 11/11 |
| **B** — Dedupe + filtros | ✅ Cerrado (40/40) | `cf5c9ca`, `b99f72b`, `9e4d40c`, `64970c0` | 40/40 |
| **A** — QrPromo global × sede | ✅ Cerrado (34/34) | `94590ff`, `8a396d5`, `9a13d06` | 34/34 |
| **C** — Cash override por sede | ✅ Cerrado (23/23) | `94590ff` | 23/23 |

### Validación socket isolation (E) — 2026-09-02

**Resultado: 11/11 checks PASS**

| ID | Check | Resultado |
|----|-------|-----------|
| S1 | JWT Sede A contiene locationId correcto | PASS |
| S2 | JWT Sede B contiene locationId correcto | PASS |
| S3 | JWT legacy NO contiene locationId | PASS |
| S4 | Socket Sede A conectado | PASS |
| S5 | Socket Sede B conectado | PASS |
| S6 | Socket legacy conectado | PASS |
| S7 | POST /orders para Sede A → 201 | PASS |
| S8 | Socket Sede A RECIBE order:created (su sede) | PASS |
| S9 | Socket Sede B NO recibe order:created (sede ajena) | PASS |
| S10 | Socket legacy SÍ recibe order:created (todas las sedes) | PASS |
| S11 | sync_order persistido con locationId = Sede A | PASS |

**Script de test:** `apps/sync/scripts/e-validate/socket-isolation.ts`

**Diagrama de aislamiento:**
```
POS Sede A (JWT + locationId=A)          POS Sede B (JWT + locationId=B)
  │                                          │
  ├─ socket.join(tenant:X:location:A)        ├─ socket.join(tenant:X:location:B)
  │  (NO join tenant:X)                      │  (NO join tenant:X)
  │                                          │
  │         POST /orders (JWT A)             │
  │              │                           │
  │              ▼                           │
  │    emit tenant:X:location:A ◄─── receives │
  │    emit tenant:X (legacy)    ◄─── receives│
  │                                          │
  │    emit tenant:X:location:B ──X── ignores│
```

**Detalle del binding POS login → socket room:**
1. POS login envía `locationId` en request body
2. Server valida sede (debe estar activa) → firma JWT con claim `locationId`
3. POS se conecta via socket con JWT
4. Server middleware: `verifyJwt()` → extrae `locationId` → `socket.join("tenant:{id}:location:{loc}")`
5. Multi-sede NO se une a `tenant:{id}` (sala genérica) → solo recibe pedidos de su sede

### Pendientes post-cierre

Ninguno. Todos los items están commiteados y validados con harness + `typecheck` + socket isolation.

---

## 3. Chequeos de integridad pre-prod

### 3.1 Backfill QrPromo.locationId

- **Estado:** ✅ Ejecutado en staging. 6 promos actualizadas.
- **Archivo:** `apps/saas/scripts/backfill-qr-promo-location.ts`
- **Riesgo:** Ninguno — es idempotente y solo afecta `scope:'tenant'`.

### 3.2 Índice QrPromo `{tenantId, locationId, isEnabled}`

- **Estado:** ✅ Creado en staging.
- **Archivo:** `apps/saas/scripts/fix-qr-promo-index.ts`
- **Pendiente para prod:** Ejecutar `fix-qr-promo-index.ts` contra producción antes de deploy.
- **Urgencia:** Bajo — el índice mejora performance pero no es bloqueante.

### 3.3 Pluralización DB (orden silencioso, 0 conflictos)

- **Estado:** ✅ Verificado. Zero modelos duales.
- **Pendiente para prod:** Ninguno — es solo verificación.

### 3.4 Sync_orders explícito (sincronización implícita)

- **Estado:** ✅ No requerido — funciona por sync implícita.
- **Detalle:** El SaaS tiene su colección `orders`, SyncLayer tiene `sync_orders`. Vinculados por `externalOrderId`. El push es implícito vía `pushOrderToSyncLayer()` al crear pedido. No existe colección `sync_orders` en el SaaS ni es necesaria.
- **Bloqueante:** No.
- **Urgencia:** Cerrado — sin acción requerida.

---

## 4. Sockets/POS real — CERRADO ✅

### Estado: CERRADO (Sync Layer activo en Render)

Sync Layer está activo en Render (cuota habilitada). Validación completa:

1. **HTTP-level** (e-validate C1-C10): 10/10 PASS — login, JWT claims, pending orders filtering, internal API
2. **Socket isolation** (socket-isolation S1-S11): 11/11 PASS — room routing, order delivery, legacy fallback
3. **POS binding**: login con locationId → JWT contiene claim → socket se une a room `tenant:{id}:location:{loc}` → solo recibe pedidos de su sede

### Archivos de evidencia
- `apps/sync/scripts/e-validate/evidence.md` — HTTP checks (10/10)
- `apps/sync/scripts/e-validate/socket-evidence.md` — Socket checks (11/11)
- `apps/sync/scripts/e-validate/socket-isolation.ts` — Test script reproducible

### Urgencia: Cerrado

---

## 5. Deuda de rondas anteriores (no cerrada)

### 5.1 Hidden Rewards (Recompensas Ocultas)

- **Estado:** 🟡 Testing pendiente
- **Commits:** `4e4e63f`, `04a7e0c`
- **Pendiente:** Testing end-to-end del flujo completo (creación de recompensa → visualización condicional → canje).
- **Urgencia:** Medio — funcionalidad existente pero no validada en producción.

### 5.2 WeeklyCommissionStatement (Comisiones semanales)

- **Estado:** 🟡 Migración pendiente
- **Commits:** `a504b18`
- **Pendiente:** Migración del modelo/flujo de comisiones semanales. El modelo existe pero el flujo completo de generación y visualización no está cerrado.
- **Urgencia:** Medio — afecta reporting financiero del superadmin.

### 5.3 WhatsApp Reward Advance

- **Estado:** 🟡 Documentado, no probado en prod
- **Docs:** `docs/whatsapp-reward-advance.md`
- **Pendiente:** Validación con número de WhatsApp real y flujo completo de outreach.
- **Urgencia:** Bajo — feature de marketing, no bloqueante.

### 5.4 Founder Links (Enlaces de fundador)

- **Estado:** 🟡 Migración pendiente
- **Pendiente:** Migración del sistema de links de referencia/fundador.
- **Urgencia:** Bajo — feature de crecimiento, no bloqueante.

### 5.5 QuickAccess SSO (POS → SaaS)

- **Estado:** 🟡 Fase 2 pendiente
- **Docs:** `apps/pos/_REVIEW.md:221`
- **Pendientes Fase 2:**
  - Integrar QuickAccessPanel con CustomerSearch
  - Evaluar si el mesero necesita acceso CIS futuro
  - Considerar middleware SaaS para role guards
- **Urgencia:** Bajo — funcionalidad base funciona, mejoras son incrementales.

---

## 6. Cambios de hoy — Pendientes de commit (si los hay)

### Estado del working tree

```
✅ Limpio — todo commiteado.
```

Últimos commits:
| Hash | Descripción |
|------|-------------|
| `ab5aa06` | seed: pizza-crash menu - Faina + Bebidas |
| `7c54ca3` | useEffect de localCategories: normaliza items/subcategories |
| `e6671f6` | fix re-ordening category |
| `9a13d06` | marketing qr (UrlGenerator selector de sedes) |
| `8a396d5` | adding filter on superadmin to create qr marketing by sede |
| `94590ff` | feat(loyalty/cash): cash per-location override (item C) |

---

## 7. Tabla resumen

| # | Ítem | Estado | Bloqueante para prod | Próxima acción |
|---|------|--------|---------------------|----------------|
| 1 | platformConfig auto-creation | ⚠️ Sin auto-creación | No (existe por uso previo) | Crear seed/middleware de startup |
| 2 | platformConfig `|| {}` hardening | ✅ Aplicado | No | Nada — cerrado |
| 3 | Multi-sede E (HTTP + sockets) | ✅ Cerrado (21/21) | No | Nada |
| 4 | Multi-sede B (40/40) | ✅ Cerrado | No | Nada |
| 5 | Multi-sede A (34/34) | ✅ Cerrado | No | Nada |
| 6 | Multi-sede C (23/23) | ✅ Cerrado | No | Nada |
| 7 | Backfill QrPromo locationId | ✅ Staging | No | Ejecutar en prod |
| 8 | Índice QrPromo | ✅ Staging | No | Ejecutar en prod |
| 9 | Sync_orders explícito | ✅ No requerido | No | Nada — sync implícita funciona |
| 10 | Sockets/POS real | ✅ Cerrado (Sync activo) | No | Nada — validado HTTP + sockets |
| 11 | Hidden Rewards testing | 🟡 Sin test E2E | No | Ejecutar flujo completo |
| 12 | WeeklyCommissionStatement | 🟡 Migración pendiente | No | Cerrar modelo + flujo |
| 13 | WhatsApp Reward Advance | 🟡 Doc pendiente | No | Probar con número real |
| 14 | Founder Links | 🟡 Migración pendiente | No | Migrar sistema |
| 15 | QuickAccess SSO Fase 2 | 🟡 Pendiente | No | Integrar panel + middleware |
| 16 | Seed pizza-crash (Fainá+Bebidas) | ✅ Ejecutado | No | Nada — cerrado |
| 17 | MenuManager bugs (reorder + undefined.length) | ✅ Commiteado | No | Nada — cerrado |
| 18 | UrlGenerator selector sedes | ✅ Commiteado | No | Nada — cerrado |
| 19 | API sedes superadmin | ✅ Commiteado | No | Nada — cerrado |

### Resumen por urgencia

| Urgencia | Ítems |
|----------|-------|
| **Crítico** | — |
| **Alto** | — |
| **Medio** | #1 (platformConfig seed), #11 (Hidden Rewards), #12 (Comisiones) |
| **Bajo** | #7, #8 (backfills prod), #13 (WhatsApp), #14 (Founder), #15 (QuickAccess) |
