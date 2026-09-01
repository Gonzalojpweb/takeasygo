# Deuda Técnica Pendiente — TakeasyGO

> Generado: 2026-08-30
> Última actualización: 2026-08-30 (cierre de sesión)

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

### Estado: CERRADO ✅

| Item | Estado | Commits | Harness |
|------|--------|---------|---------|
| **E** — Precio × sede | ✅ Cerrado | `1b8594b` | — |
| **B** — Dedupe + filtros | ✅ Cerrado (40/40) | `cf5c9ca`, `b99f72b`, `9e4d40c`, `64970c0` | 40/40 |
| **A** — QrPromo global × sede | ✅ Cerrado (34/34) | `94590ff`, `8a396d5`, `9a13d06` | 34/34 |
| **C** — Cash override por sede | ✅ Cerrado (23/23) | `94590ff` | 23/23 |

### Pendientes post-cierre

Ninguno. Todos los items están commiteados y validados con harness + `typecheck`.

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

### 3.4 Sparse sync_orders (sincronización implícita)

- **Estado:** ⚠️ Pendiente — nunca se creó el sync explícito de `sync_orders`.
- **Bloqueante:** No — funciona por sync implícita al crear/leer órdenes.
- **Urgencia:** Bajo.

---

## 4. Sockets/POS real — PENDING

### ¿Qué es?

El POS real requiere conexiones WebSocket para sincronización en tiempo real de órdenes, estado de impresión, y actualizaciones de menú.

### ¿Por qué quedó pendiente?

- **Local:** WSL roto, Docker sin daemon — no se puede levantar Redis ni el servidor de sockets.
- **Producción:** Sync Layer inactivo en Render — no se puede validar end-to-end.

### ¿Qué se necesita?

1. Restaurar WSL/Docker local para desarrollo con Redis.
2. Activar Sync Layer en Render (o migrar a infraestructura que soporte WebSockets).
3. Validar handshake POS ↔ SaaS con datos reales.

### Urgencia: **Alta**

Sin sockets, el POS funciona en modo offline/sync periódico. No es bloqueante para pedidos web, pero sí para la experiencia POS en locales con múltiples terminales.

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
| 3 | Multi-sede E | ✅ Cerrado | No | Nada |
| 4 | Multi-sede B (40/40) | ✅ Cerrado | No | Nada |
| 5 | Multi-sede A (34/34) | ✅ Cerrado | No | Nada |
| 6 | Multi-sede C (23/23) | ✅ Cerrado | No | Nada |
| 7 | Backfill QrPromo locationId | ✅ Staging | No | Ejecutar en prod |
| 8 | Índice QrPromo | ✅ Staging | No | Ejecutar en prod |
| 9 | Sync_orders explícito | ⚠️ Pendiente | No | Crear sync (baja prioridad) |
| 10 | Sockets/POS real | 🔴 Bloqueado | **Sí** (para POS multi-terminal) | Restaurar WSL/Docker → Activar Sync Layer |
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
| **Alto** | #10 (Sockets/POS) |
| **Medio** | #1 (platformConfig seed), #11 (Hidden Rewards), #12 (Comisiones) |
| **Bajo** | #7, #8 (backfills prod), #9 (sync_orders), #13 (WhatsApp), #14 (Founder), #15 (QuickAccess) |
