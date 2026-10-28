# REPORTE FINAL — Base de conocimiento del asistente de soporte TakEasyGo

**Fecha:** 2026-10-27
**Ubicación:** `docs/asistente/`
**Total de archivos:** 43 (11 transversales + 32 módulos)

---

## 1. Inventario de módulos y roles documentados

### 1.1 Módulos (32/32 — cubren todas las features de `PLAN_ACCESS`)

| # | Módulo | Tipo | Roles documentados |
|---|--------|------|--------------------|
| 1 | `menu` | siempre_activo | admin, manager, cashier, waiter, kitchen |
| 2 | `orders` | siempre_activo | admin, manager, cashier, waiter, kitchen |
| 3 | `orderHistory` | siempre_activo | admin, manager, cashier, waiter |
| 4 | `printers` | siempre_activo | admin, manager |
| 5 | `settings` | siempre_activo | admin, manager |
| 6 | `reports` | por_plan | admin, manager |
| 7 | `users` | por_plan | admin |
| 8 | `audit` | por_plan | admin |
| 9 | `multiLocation` | por_plan | admin, manager |
| 10 | `multiPrinter` | por_plan | admin, manager |
| 11 | `ico` | por_plan | admin, manager |
| 12 | `icoTrial` | por_plan | admin, manager |
| 13 | `analyticsAdv` | por_plan | admin |
| 14 | `icoAdvanced` | por_plan | admin |
| 15 | `store` | por_plan | admin, manager |
| 16 | `sos` | por_plan | admin, manager |
| 17 | `dineIn` | por_plan | admin, manager, cashier, waiter |
| 18 | `reservations` | por_plan | admin, manager, cashier, waiter |
| 19 | `inventory` | por_plan | admin, manager |
| 20 | `business` | por_plan | admin, manager |
| 21 | `loyaltyClub` | por_plan | admin, manager |
| 22 | `loyaltyExport` | por_plan | admin |
| 23 | `loyaltyAnalytics` | por_plan | admin |
| 24 | `posIntegration` | por_plan | admin, manager |
| 25 | `delivery` | por_plan | admin, manager |
| 26 | `adminPushNotifications` | por_plan | admin |
| 27 | `tia` | por_plan | admin, manager |
| 28 | `crm` | por_plan | admin, manager |
| 29 | `cis` | por_plan | admin, manager |
| 30 | `transferPayment` | por_plan | admin, manager |
| 31 | `paymentSurcharges` | por_plan | admin, manager |
| 32 | `hiddenRewards` | por_plan | admin |

Todos los archivos siguen la plantilla exacta (13 secciones) con frontmatter YAML válido (`modulo`, `tipo`, `roles`, `version_doc: "2026-10-27"`).

### 1.2 Roles documentados

`admin`, `manager`, `cashier`, `waiter`, `kitchen` (fuente: `packages/types/src/index.ts` → `Role`).

### 1.3 Documentos transversales (11)

| Archivo | Contenido |
|---------|-----------|
| `00-indice.md` | Índice general |
| `01-roles-y-permisos.md` | Matriz exacta de `PERMISSIONS` |
| `02-modulos-y-planes.md` | Matriz `PLAN_ACCESS` (32 features × 5 planes) |
| `03-glosario.md` | Términos y roles |
| `04-flujos-comunes-por-rol.md` | Día típico por rol |
| `05-errores-globales.md` | Errores comunes |
| `06-politica-del-asistente.md` | Política completa |
| `07-escalamiento-a-soporte.md` | Formato de derivación |
| `08-preguntas-de-prueba.md` | **60 preguntas** con respuestas y fuentes |
| `09-pruebas-de-limites.md` | **41 casos adversariales** |
| `10-system-prompt-base.md` | Borrador del prompt de sistema |

---

## 2. Marcas `[VERIFICAR]` (2)

| Archivo | Línea | Marca |
|---------|-------|-------|
| `modulos/tia.md` | 111 | `[VERIFICAR: definición exacta de SIL en el código]` — sub-feature TIA en plan full, siglas "SIL" no confirmadas |
| `modulos/crm.md` | 115 | `[VERIFICAR: alcance exacto de la integración]` — código sugiere integración Google Contacts, alcance no confirmado |

---

## 3. Contradicciones código–documentación (4)

### 3.1 Express vs FastAPI
- **La misión original describía FastAPI.** El código real usa **Express** (`apps/sync/src/index.ts`: `import express from "express"`).
- **Resuelto en la documentación:** se documentó Express como framework real.

### 3.2 Enum de roles: dos fuentes en conflicto
- `packages/types/src/index.ts`: `Role = "admin" | "manager" | "cashier" | "waiter" | "kitchen"` (5 roles).
- `packages/db/src/models/user.ts` (`UserSchema.role.enum`): `["superadmin", "admin", "manager", "staff", "cashier", "consumer", "seller"]` — **7 valores**, sin `waiter`/`kitchen`, con `superadmin`, `staff`, `consumer`, `seller`.
- **Impacto:** `staff`, `seller`, `consumer`, `superadmin` no tienen permisos en `PERMISSIONS` ni están documentados como roles del asistente.
- **Resuelto en la documentación:** se usó el `Role` de types (5 roles) como fuente de verdad; los 4 roles extra quedan como contradicción pendiente.

### 3.3 Permisos del rol `waiter` (corregido durante la revisión final)
- Errata inicial de esta base: decía que `waiter` no podía crear/modificar órdenes.
- Código real (`authorization.ts`): `order:create` y `order:modify` **incluyen** a `waiter`; solo `order:cancel` y `payment:process` lo excluyen.
- **Corregido en:** `01-roles-y-permisos.md`, `04-flujos-comunes-por-rol.md`, `modulos/orders.md`, `08-preguntas-de-prueba.md` (pregunta 32).

### 3.4 Features `delivery` y `adminPushNotifications` en `PLAN_ACCESS`
- Aparecen en la matriz de planes pero su implementación/alcance exacto no está tan explícita en rutas como los módulos principales.
- **Estado:** documentados con la mejor evidencia disponible; incluidos en el listado de preguntas para el dueño.

---

## 4. Funciones incompletas o no confirmadas

- **`SIL` (sub-feature de TIA):** marcado `[VERIFICAR]` — significado no confirmado en código.
- **Google Contacts (CRM):** marcado `[VERIFICAR]` — integración sugerida, alcance no confirmado.
- Búsqueda de `TODO`/`FIXME`/`not implemented` en `.ts` no arrojó funciones incompletas relevantes para el asistente (solo falsos positivos de tests y comentarios).

---

## 5. Secretos detectados (NO copiados a la documentación)

Los siguientes archivos contienen credenciales reales en el repositorio. **No se reprodujo ningún valor** en `docs/asistente/`.

| Archivo | Cantidad aprox. de variables sensibles |
|---------|----------------------------------------|
| `apps/saas/.env.local` | ~25+ (MONGODB_URI, SYNC_LAYER_SECRET, AUTH_SECRET, NEXTAUTH_SECRET, ENCRYPTION_KEY, Cloudinary keys ×2 cuentas, Upstash Redis, SMTP password, VAPID keys, Google OAuth, PostHog, WHAPI, Kripton, Carto, etc.) |
| `apps/saas/.env.local.bak` | 37 variables (mismas + GOOGLE_WALLET_SERVICE_ACCOUNT_KEY, WALLET_WEB_SERVICE_SECRET, CRON_SECRET, ADMIN_EMAIL) |
| `apps/saas/.env.staging` | 43 variables (mismas + APP_URL, AUTH_TRUST_HOST, DELIVERY_SIMULATE_GPS, NEXT_PUBLIC_URL) |

**Recomendación:** mover a variables de entorno fuera del repo, rotar secretos si el repo es compartido, y verificar `.gitignore`.

---

## 6. Preguntas para el dueño

1. **¿Qué significa "SIL" en TIA?** (marcado `[VERIFICAR]` en `tia.md`)
2. **¿Qué alcance tiene la integración con Google Contacts en CRM?** (marcado `[VERIFICAR]` en `crm.md`)
3. **¿Los roles `superadmin`, `staff`, `seller`, `consumer` del enum de Mongoose son reales o legacy?** No tienen permisos en `PERMISSIONS` ni aparecen en el tipo `Role`.
4. **¿Los módulos `delivery` y `adminPushNotifications` están efectivamente activos en producción?** Aparecen en `PLAN_ACCESS` pero su implementación es menos evidente que el resto.
5. **¿Se debe documentar al rol `superadmin` (panel superadmin) para el asistente, o queda fuera de alcance?** Existe directorio `apps/saas/app/superadmin/`.
6. **¿Confirmamos que el plan `anfitrion` no tiene pedidos?** Documentado así en `orderHistory.md` y `02-modulos-y-planes.md`.
7. **¿Rotar los secretos de `.env.local*`?** Están en el árbol de trabajo.
8. **¿El prompt final debe inyectar los 32 módulos completos o solo los activos + descripción breve?** El borrador asume inyección selectiva por consulta.

---

## 7. Verificación final ejecutada

| Verificación | Resultado |
|--------------|-----------|
| 43 archivos creados | ✅ |
| 32 módulos con frontmatter YAML válido | ✅ |
| 60 preguntas de prueba (mín. 60) | ✅ |
| 41 casos adversariales (mín. 40) | ✅ |
| Sin secretos/credenciales/URLs internas en la documentación | ✅ |
| Matriz de permisos alineada con `authorization.ts` (tras corrección waiter) | ✅ |
| Módulos = features de `PLAN_ACCESS` | ✅ (32/32) |
| Marcas `[VERIFICAR]` presentes donde falta evidencia | ✅ (2) |

---

**Estado de entrega:** base de conocimiento completa y consistente con el código. Pendiente: resolver las 8 preguntas de la sección 6 con el dueño.