# Política de Seguridad — TakeasyGO

**Autor:** Ingeniero en Ciberseguridad con Alta Expertise
**Fecha:** Marzo 2026 · Versión 3.1
**Revisión anterior:** Versión 3.0 — Marzo 2026
**Próxima revisión:** Junio 2026

> **Regla de oro:** La seguridad no es un feature, es el foundation.
> Toda decisión de código, arquitectura u operación debe evaluarse contra este documento. Cualquier desviación requiere aprobación explícita de un responsable de seguridad.

### Changelog v3.1 — Marzo 2026

| # | Cambio | Archivos afectados |
|---|---|---|
| 1 | **Auditoría completa de acciones admin** — `logAudit()` instrumentado en todos los endpoints críticos: creación/edición/eliminación de categorías e ítems de menú, cambios de branding, perfil y MercadoPago en settings, y alta/edición de sedes. Cada acción persiste `tenantId`, `userId`, `userRole`, `ip` y `details`. | `app/api/[tenant]/menu/categories/route.ts`, `categories/[id]/route.ts`, `categories/[id]/items/route.ts`, `categories/[id]/items/[id]/route.ts`, `settings/branding/route.ts`, `settings/profile/route.ts`, `locations/route.ts`, `locations/[id]/route.ts` |
| 2 | **requireAuth en locations POST** — El endpoint de creación de sedes carecía de verificación de autenticación. Corregido. | `app/api/[tenant]/locations/route.ts` |
| 3 | **Panel de Auditoría Superadmin** — Vista cross-tenant con filtros por tenant, categoría (menú/settings/auth/pedidos) y rango de fechas. Permite al superadmin monitorear toda la actividad de los admins en tiempo real. | `app/api/superadmin/auditoria/route.ts`, `components/superadmin/AuditoriaPanel.tsx`, `app/superadmin/auditoria/page.tsx` |
| 4 | **PII AES-256-GCM extendido** — El cifrado se amplía de Órdenes a todos los módulos con datos de clientes: Leads (nombre, email, teléfono), NetworkRestaurant (nombre, email, teléfono), Reservaciones (nombre, teléfono). `safeDecrypt` permite migración gradual sin romper registros existentes en texto plano. | `app/api/leads/route.ts`, `app/api/network/route.ts`, `app/api/[tenant]/reservas/route.ts`, `app/api/[tenant]/reservas/[id]/route.ts`, `app/api/[tenant]/reservas/preference/route.ts`, `app/superadmin/leads/page.tsx` |

### Changelog v3.0 — Marzo 2026

| # | Cambio | Archivos afectados |
|---|---|---|
| 1 | **PII cifrado AES-256-GCM** — nombre, teléfono y email de cada pedido ahora se almacenan cifrados. `safeDecrypt` permite migración gradual (órdenes antiguas en texto plano siguen funcionando). `phoneHash` SHA-256 para agrupaciones en reportes. | `lib/crypto.ts`, `models/Order.ts`, `app/api/[tenant]/orders/route.ts`, `orders/history/route.ts`, `payments/create-preference/route.ts`, `reports/download/route.ts`, `reports/page.tsx` |
| 2 | **Webhook Secret obligatorio** — UI y API de settings ahora requieren los tres campos (Access Token + Public Key + Webhook Secret). Sin los tres no se guardan credenciales. | `components/admin/MercadoPagoSettings.tsx`, `app/api/[tenant]/settings/mercadopago/route.ts` |
| 3 | **CORS explícito en rutas admin** — `Access-Control-Allow-Origin` restringido a `NEXT_PUBLIC_BASE_URL` en `/api/[tenant]/settings/**`, `/users/**` y `/analytics/**`. | `next.config.ts` |
| 4 | **Audit de login/logout** — Eventos `auth.login` y `auth.logout` registrados en `AuditLog` vía NextAuth `events`. | `lib/auth.ts` |
| 5 | **Dine-in habilitado para todos los planes** — Disponible en trial, try, buy, full y anfitrion. | `lib/plans.ts` |
| 6 | **Documentación de seguridad en Centro de Ayuda** — Bloque AES-256-GCM visible en el módulo Configuración del panel admin. | `components/admin/HelpCenter.tsx` |

---

## Índice

1. [Marco normativo de referencia](#1-marco-normativo-de-referencia)
2. [Principios generales](#2-principios-generales)
3. [Estado actual del proyecto (scan Marzo 2026 v2)](#3-estado-actual-del-proyecto)
4. [Hallazgos críticos — Nuevos en v2](#4-hallazgos-críticos--nuevos-en-v2)
5. [Reglas por área](#5-reglas-por-área)
   - [5.1 Autenticación y Autorización](#51-autenticación-y-autorización)
   - [5.2 Protección de datos sensibles](#52-protección-de-datos-sensibles)
   - [5.3 API y flujos de pedidos/pagos](#53-api-y-flujos-de-pedidospagos)
   - [5.4 Seguridad multi-tenant](#54-seguridad-multi-tenant)
   - [5.5 Frontend y UX](#55-frontend-y-ux)
6. [Matriz completa de seguridad por API route](#6-matriz-completa-de-seguridad-por-api-route)
7. [Desarrollo y pruebas](#7-desarrollo-y-pruebas)
8. [Monitoreo y respuesta a incidentes](#8-monitoreo-y-respuesta-a-incidentes)
9. [Escalabilidad segura](#9-escalabilidad-segura)
10. [Plan de mitigación priorizado](#10-plan-de-mitigación-priorizado)

---

## 1. Marco normativo de referencia

| Estándar | Aplicación |
|---|---|
| **OWASP Top 10** | Validación, autenticación, inyección, exposición de datos |
| **Security by Design (SbD)** | Seguridad integrada desde el día 1, no al final |
| **Zero Trust** | Verificar cada request independientemente del origen |
| **Least Privilege** | Permisos mínimos por rol, servicio y tenant |
| **Defense in Depth** | WAF + validación + cifrado (capas independientes) |
| **NIST CSF** | Identificar, Proteger, Detectar, Responder, Recuperar |
| **PCI-DSS** | Flujos de pago con MercadoPago |
| **LGPD / Ley 25.326 Argentina** | Datos personales, geolocalización, consentimiento |
| **ISO 27001** | Gestión de seguridad de la información |

---

## 2. Principios generales

| # | Principio | Descripción |
|---|---|---|
| P1 | **Security by Design** | Integrar seguridad en cada fase: requisitos, diseño, código, testing, deploy |
| P2 | **Zero Trust** | Ningún request es confiable por defecto. Verificar usuario + tenant + rol en cada llamada |
| P3 | **Least Privilege** | Cada componente tiene solo los permisos mínimos |
| P4 | **Defense in Depth** | WAF + validación de inputs + cifrado en reposo + auditoría = capas independientes |
| P5 | **Fail Secure** | En fallos, el sistema deniega acceso (nunca falla abierto) |
| P6 | **Auditoría Total** | Loggear todo evento sensible sin exponer PII. Cumplir LGPD |
| P7 | **Minimización de datos** | Recopilar solo lo esencial. Delegar datos de pago a MercadoPago |
| P8 | **Actualizaciones constantes** | Monitorear vulnerabilidades con `npm audit` semanalmente |
| P9 | **Cumplimiento normativo** | PCI-DSS para pagos, Ley 25.326 para datos personales argentinos |

---

## 3. Estado actual del proyecto

> Scan realizado sobre el código fuente en **Marzo 2026 — v3.0**.
> Infraestructura actual: **Vercel + MongoDB Atlas**. Próximamente: **Hostinger VPS**.
> Esta versión incorpora cifrado PII, CORS explícito, audit de sesiones y Webhook Secret obligatorio.

### Leyenda de estado

| Símbolo | Significado |
|---|---|
| ✅ | Implementado y correcto |
| ⚠️ | Implementado pero con limitaciones / mejorable |
| ❌ | No implementado — riesgo activo |
| 🔴 | CRÍTICO — requiere acción inmediata |
| 🔜 | Aplica en Hostinger / próxima fase |
| ➖ | No aplica en la fase actual |

### Diagnóstico por área — Versión 2.0

| Área | Regla | Estado | Observación |
|---|---|---|---|
| **Auth** | bcrypt para contraseñas | ✅ | `bcryptjs` cost 12 en `lib/auth.ts` |
| **Auth** | Rate limit en login | ✅ | Upstash Redis — 5 intentos / 60s por email |
| **Auth** | Expiración de sesión | ✅ | `maxAge: 8 * 60 * 60` en `lib/auth.config.ts` |
| **Auth** | MFA (TOTP/WebAuthn) | ❌ | No implementado |
| **Auth** | CAPTCHA en intentos fallidos | ❌ | No implementado |
| **Auth** | Password reset tokenizado | ✅ | Token SHA-256, 15 min expiración |
| **Auth** | JWT con firma segura | ✅ | NextAuth maneja internamente |
| **Auth** | CSRF protection | ✅ | NextAuth incluye tokens CSRF |
| **AuthZ** | RBAC multi-rol | ✅ | Roles: `superadmin / admin / manager / staff / cashier` |
| **AuthZ** | Guard server-side por rol | ⚠️ | `requireAuth` / `requireAdminRole` presentes. Algunas rutas admin solo verifican sesión, no rol específico |
| **AuthZ** | `requireAdminRole` en APIs sensibles | ✅ | Implementado en `lib/apiAuth.ts` |
| **Secrets** | `.env.local` no expuesto en git | 🔴 | **CRÍTICO:** `.env.local` contiene credenciales de producción. Verificar que NO esté commiteado en ninguna rama. Rotar si fue expuesto. |
| **Secrets** | `AUTH_SECRET` fuerte | ❌ | Valor débil detectado — rotar con `openssl rand -base64 32` |
| **Datos** | HTTPS / TLS | ✅ | Vercel gestiona automáticamente |
| **Datos** | HSTS | ✅ | Vercel aplica HSTS |
| **Datos** | Cifrado de credentials MP | ✅ | AES-256-GCM en `lib/crypto.ts`, IV aleatorio, auth tag |
| **Datos** | Cifrado de campos PII (Order) | ✅ | AES-256-GCM en `customer.name`, `.phone`, `.email`. `safeDecrypt` para migración gradual. `phoneHash` SHA-256 para reportes — Marzo 2026 v3 |
| **Datos** | Cifrado PII (Lead / Network / Reservation) | ✅ | AES-256-GCM en Lead (name/email/phone), NetworkRestaurant (nombre/email/telefono), Reservation (name/phone). `safeDecrypt` para migración gradual — Marzo 2026 v3.1 |
| **Datos** | Secrets en variables de entorno | ✅ | `.env*` en `.gitignore` |
| **Datos** | No almacenar datos de tarjeta | ✅ | 100% delegado a MercadoPago |
| **Datos** | Verificación de firma webhook MP | ✅ | Firma + Webhook Secret obligatorios en UI y API de settings — Marzo 2026 v3 |
| **API** | Validación Zod en APIs públicas | ⚠️ | Orders ✅ · Auth ✅ · Leads ✅ · Network ✅ · Superadmin users ✅ · Superadmin tenants ✅ · Payments ✅ |
| **API** | Rate limiting en APIs críticas | ✅ | Login ✅ · Payments ✅ · Leads ✅ · Network ✅ |
| **API** | Precios calculados en servidor | ✅ | `orders/route.ts` — nunca del cliente |
| **API** | Headers de seguridad (X-Frame, etc.) | ✅ | 5 headers en `next.config.ts` |
| **API** | Content-Security-Policy (CSP) | ✅ | Configurado en `next.config.ts` — Marzo 2026 |
| **API** | CORS estricto | ✅ | `Access-Control-Allow-Origin` restringido a `NEXT_PUBLIC_BASE_URL` en settings, users y analytics — Marzo 2026 v3 |
| **API** | Protección NoSQL Injection | ✅ | Mongoose parameterized queries |
| **API** | Protección XSS outputs | ⚠️ | React escapa por defecto. Sin `DOMPurify` para contenido dinámico |
| **Superadmin** | Validación en creación de usuarios | ✅ | Zod schema · `role` limitado a enum operativo · `superadmin` bloqueado — Marzo 2026 |
| **Superadmin** | Validación en creación de tenants | ✅ | Zod schema · slug validado · plan con enum · duplicados verificados — Marzo 2026 |
| **Multi-tenant** | `tenantId` en todos los schemas | ✅ | Order, Printer, AuditLog, Location, Menu, etc. |
| **Multi-tenant** | Middleware de resolución de tenant | ✅ | `middleware.ts` extrae slug y lo pasa vía header |
| **Multi-tenant** | Aislamiento cross-tenant en APIs | ✅ | Cada API valida `tenantId` antes de operar |
| **Multi-tenant** | Slug injection | ✅ | `SLUG_REGEX = /^[a-z0-9-]{2,50}$/` en `middleware.ts` |
| **Auditoría** | Log de eventos sensibles | ✅ | `AuditLog` + `lib/audit.ts` implementado |
| **Auditoría** | Auditoría de cambios de estado | ✅ | `status/route.ts` instrumentado |
| **Auditoría** | Auditoría de settings sensibles | ✅ | `settings/mercadopago/route.ts` instrumentado |
| **Auditoría** | Login / logout / auth failures | ✅ | `auth.login` y `auth.logout` registrados vía NextAuth `events` en `lib/auth.ts` — Marzo 2026 v3 |
| **Auditoría** | Structured logging (Sentry/Datadog) | ❌ | Solo `console.error` en catch blocks |
| **Infra** | WAF | ⚠️ | Vercel incluye protección básica. Sin WAF dedicado |
| **Infra** | Backups de DB | 🔜 | MongoDB Atlas automático (verificar plan) |
| **Infra** | Secrets Manager (Vault) | 🔜 | Para escala. Ahora: Vercel env vars |

---

## 4. Hallazgos críticos — Nuevos en v2

> Estos hallazgos no estaban documentados en v1.0 y requieren acción inmediata.

### 🔴 CRÍTICO-1: Credenciales de producción en `.env.local`

**Archivos afectados:** `.env.local`

El archivo `.env.local` contiene credenciales reales de producción: URI de MongoDB Atlas, `AUTH_SECRET`, `ENCRYPTION_KEY`, API keys de Cloudinary, token de Upstash Redis y password SMTP.

**Riesgo:** Si este archivo fue commiteado en algún momento al repositorio git, todas las credenciales están comprometidas. Puede aparecer en `git log`, `git stash`, ramas eliminadas o GitHub history.

**Acciones inmediatas:**
```bash
# 1. Verificar si fue commiteado
git log --all --full-history -- .env.local
git log --all --full-history -- "*.env*"

# 2. Si fue commiteado → rotar TODAS las credenciales:
#    - MongoDB Atlas: cambiar password del usuario DB
#    - AUTH_SECRET: openssl rand -base64 32  → actualizar en Vercel
#    - ENCRYPTION_KEY: openssl rand -base64 32
#      ADVERTENCIA: rotar ENCRYPTION_KEY invalida credentials MP cifrados
#      → Re-configurar credenciales MP de todos los tenants después
#    - Cloudinary: revocar API key/secret desde dashboard
#    - Upstash Redis: revocar token desde console
#    - SMTP: revocar app password desde Google/proveedor

# 3. Limpiar historial git si fue expuesto (requiere git filter-repo o BFG)
```

**Prevención futura:**
- Instalar `gitleaks` como pre-commit hook
- Activar GitHub secret scanning (gratis en repos privados)
- `.env.local` NUNCA debe contener credenciales de producción
- Gestionar todos los secrets desde Vercel Dashboard → Environment Variables

---

### ✅ CRÍTICO-2 RESUELTO: Webhook Secret ahora es obligatorio — Marzo 2026 v3

**Archivos:** `components/admin/MercadoPagoSettings.tsx`, `app/api/[tenant]/settings/mercadopago/route.ts`

La firma de webhook ya era verificada en el route del webhook. El gap era que la UI y la API de settings permitían guardar credenciales sin `webhookSecret`.

**Resolución implementada:**
- UI: campo `webhookSecret` ahora tiene `required` y label `(obligatorio)` en rojo
- API: `POST /api/[tenant]/settings/mercadopago` — valida que los tres campos estén presentes antes de guardar
- Un tenant sin `webhookSecret` no puede terminar de configurar MP

**Resultado:** Es físicamente imposible que un tenant quede con MP configurado sin Webhook Secret.

---

### 🔴 CRÍTICO-3: Superadmin — Creación de usuarios sin validación de rol

**Archivo:** `app/api/superadmin/users/route.ts`

```typescript
// CÓDIGO ACTUAL — INSEGURO
const { name, email, password, role, tenantId } = await request.json()
// role no se valida → cualquier string es aceptado, incluyendo 'superadmin'
const user = await User.create({ name, email, password: hashedPassword, role, tenantId })
```

**Impacto:**
- Se puede crear un segundo `superadmin` sin restricción desde el panel
- `role` puede ser cualquier string arbitrario
- Sin validación de existencia del tenant referenciado
- Sin longitud mínima de contraseña

**Fix requerido:** Zod schema con `z.enum(['admin', 'manager', 'staff', 'cashier'])` — excluir `superadmin` del enum creatable por UI.

---

### ❌ HIGH-1: APIs públicas sin rate limiting ni validación (Leads / Network)

**Archivos:** `app/api/leads/route.ts`, `app/api/network/route.ts`

Ambos endpoints son públicos, sin rate limiting, y usan solo regex básica para validar email. Son vectores directos de spam, abuso y enumeración.

**Fix:** Aplicar `rateLimit()` (10 req/min por IP) + schema Zod con `z.string().email()` y límites de longitud en todos los campos.

---

### ❌ HIGH-2: Sin Content-Security-Policy (CSP)

**Archivo:** `next.config.ts`

Los 5 headers actuales están bien, pero sin CSP un ataque XSS exitoso puede cargar scripts externos sin restricción.

**Fix recomendado:**
```typescript
{
  key: 'Content-Security-Policy',
  value: "default-src 'self'; script-src 'self' 'unsafe-inline'; img-src 'self' res.cloudinary.com data:; connect-src 'self' https://api.mercadopago.com;"
}
```

---

## 5. Reglas por área

### 5.1 Autenticación y Autorización

#### Reglas obligatorias

```
R-AUTH-01  Toda ruta /admin requiere sesión activa (verificado en middleware.ts) ✅
R-AUTH-02  Toda API sensible usa requireAuth() o requireAdminRole() ✅
R-AUTH-03  Contraseñas hasheadas con bcrypt (cost factor ≥ 12) ✅
R-AUTH-04  Rate limit en login: 5 intentos / email / 60s ✅
R-AUTH-05  Sesión JWT con maxAge ≤ 8 horas ✅
R-AUTH-06  Logout invalida la sesión del lado del cliente
R-AUTH-07  Password reset vía token SHA-256 de un solo uso, expira en 15 min ✅
R-AUTH-08  AUTH_SECRET con entropía mínima de 256 bits (openssl rand -base64 32) ❌
```

#### Estado detallado

- **bcrypt**: ✅ `bcryptjs` cost 12 en `lib/auth.ts`
- **Rate limit login**: ✅ Upstash Redis con `INCR + EXPIRE` atómico. Fallback in-memory para desarrollo
- **Session maxAge**: ✅ `session: { strategy: 'jwt', maxAge: 8 * 60 * 60 }` en `lib/auth.config.ts`
- **Password reset**: ✅ Token SHA-256 en DB, 15 min expiración, no filtra existencia de cuenta
- **AUTH_SECRET**: ❌ Valor débil detectado — reemplazar con `openssl rand -base64 32`
- **MFA**: ❌ Roadmap: TOTP con `otplib` para roles `admin` y `superadmin`
- **CAPTCHA**: ❌ Añadir `hCaptcha` o `Cloudflare Turnstile` tras 3 intentos fallidos

---

### 5.2 Protección de datos sensibles

#### Reglas obligatorias

```
R-DATA-01  TLS 1.3 obligatorio (Vercel lo garantiza) ✅
R-DATA-02  Credentials MP cifradas con AES-256-GCM en DB ✅
R-DATA-03  Nunca loggear tokens, passwords ni CVV ✅
R-DATA-04  Variables de entorno nunca hardcodeadas en el código ✅
R-DATA-05  .env* excluido de git ✅ (verificar que no fue commiteado)
R-DATA-06  Datos de tarjetas jamás almacenados ✅ (100% MercadoPago)
R-DATA-07  Campos PII (nombre, email, teléfono) cifrados en MongoDB ✅ Implementado — Marzo 2026 v3
R-DATA-08  Rotar secrets cada 90 días
R-DATA-09  .env.local NUNCA contener credenciales de producción 🔴
```

#### Estado detallado

- **Cifrado MP credentials**: ✅ `lib/crypto.ts` — AES-256-GCM con IV aleatorio + auth tag. Impide tampering.
- **Webhook signature**: ✅ Firma HMAC-SHA256 obligatoria. Webhook Secret requerido en UI y API de settings — Marzo 2026 v3.
- **PII en DB (Orders)**: ✅ `customer.name`, `customer.phone`, `customer.email` cifrados AES-256-GCM. `safeDecrypt` en todas las APIs de lectura para compatibilidad con órdenes previas. `customer.phoneHash` SHA-256 para agrupaciones en reportes — Marzo 2026 v3.
- **PII en DB (Leads / Network)**: ❌ Aún en texto plano — próximo sprint.
- **Secrets en env**: ✅ `.gitignore` cubre `.env*` — verificar historial con `git log --all -- .env.local`
- **ENCRYPTION_KEY rotation**: ⚠️ Si se rota, los datos cifrados existentes con la clave anterior son irrecuperables sin migración. Implementar key versioning antes de rotar en producción.
- **`safeDecrypt` (migración gradual)**: ✅ Intenta AES-256-GCM; si falla, devuelve el valor original. Permite que órdenes antiguas en texto plano sigan siendo legibles mientras las nuevas quedan cifradas.
- **PII en DB (Leads)**: ✅ `name`, `email`, `phone` cifrados AES-256-GCM en POST. `safeDecrypt` en superadmin/leads/page.tsx y en PATCH response — Marzo 2026 v3.1.
- **PII en DB (NetworkRestaurant)**: ✅ `nombre`, `email`, `telefono` cifrados AES-256-GCM en POST — Marzo 2026 v3.1.
- **PII en DB (Reservation)**: ✅ `name`, `phone` cifrados AES-256-GCM en POST. `safeDecrypt` en GET y PUT response — Marzo 2026 v3.1.

---

### 5.3 API y flujos de pedidos/pagos

#### Reglas obligatorias

```
R-API-01  Validación Zod en todas las APIs públicas ⚠️ (parcial)
R-API-02  Precios calculados 100% en servidor ✅
R-API-03  Rate limiting en APIs de pedidos, pagos y leads ⚠️ (leads faltante)
R-API-04  Headers de seguridad HTTP en next.config.ts ✅
R-API-05  CORS permitido solo para dominios propios ✅ Implementado — Marzo 2026 v3
R-API-06  Protección NoSQL Injection via Mongoose ✅
R-API-07  Verificación de firma webhook MP obligatoria (no opcional) ✅ — Marzo 2026 v3
R-API-08  orderId validado como ObjectId antes de consulta ❌
R-API-09  Webhook rechazado si no hay webhookSecret configurado ✅ — Marzo 2026 v3
```

#### Estado detallado

- **Precios del servidor**: ✅ `orders/route.ts` valida cada item contra DB, recalcula base + customizaciones. Nunca confía en precios del cliente.
- **Customizaciones validadas server-side**: ✅ Grupos y opciones verificados contra DB — no se puede inyectar opciones inexistentes
- **Zod validation**: ✅ `createOrderSchema`, `forgotPasswordSchema`, `resetPasswordSchema`. Faltante en superadmin, leads, network, payments, settings
- **Security headers**: ✅ 5 headers en `next.config.ts`
- **CSP**: ❌ No configurado
- **Rate limiting**: ✅ Login, payments. ❌ Leads, network, superadmin

---

### 5.4 Seguridad multi-tenant

#### Reglas obligatorias

```
R-MT-01  Todos los schemas incluyen tenantId indexado ✅
R-MT-02  Todas las APIs validan tenantId antes de operar ✅
R-MT-03  Un tenant no puede acceder a datos de otro ✅
R-MT-04  El slug de tenant en URL se sanitiza con SLUG_REGEX ✅
R-MT-05  Queries cross-tenant prohibidas ✅
```

#### Estado detallado

- **Aislamiento**: ✅ Verificado en Order, Printer, AuditLog, Location, Menu, User, ReportExport
- **Slug injection**: ✅ `SLUG_REGEX = /^[a-z0-9-]{2,50}$/` en `middleware.ts`. Slugs inválidos no propagan el header `x-tenant-slug`.
- **requireAuth cross-tenant**: ✅ `lib/apiAuth.ts` verifica que el usuario pertenezca al tenant O sea superadmin
- **Exports con PII**: ⚠️ Los reportes descargables (`reports/download`) exportan phone/email en texto plano — solo accesible con auth, pero es PII sin cifrar en tránsito (CSV/Excel)

---

### 5.5 Frontend y UX

#### Reglas obligatorias

```
R-FE-01  X-Frame-Options: DENY ✅
R-FE-02  Geolocalización con consentimiento explícito
R-FE-03  No exponer datos sensibles en respuestas de API públicas ✅
R-FE-04  Outputs dinámicos escapeados (React JSX) ✅
R-FE-05  No usar dangerouslySetInnerHTML sin sanitización previa ✅
```

---

## 6. Matriz completa de seguridad por API route

> Auditoría exhaustiva — Marzo 2026 v2. Agregar cada nueva ruta a esta tabla.

| Route | Método | Auth | Rate Limit | Zod | Notas de seguridad |
|---|---|---|---|---|---|
| `/api/auth/forgot-password` | POST | Pública | ❌ | ✅ | No filtra existencia de cuenta ✅ |
| `/api/auth/reset-password` | POST | Pública | ❌ | ✅ | Token SHA-256, expiry checked ✅ |
| `/api/leads` | POST | Pública | 🔴 ❌ | ❌ | Vector de spam — solo regex email |
| `/api/network` | POST | Pública | 🔴 ❌ | ❌ | Misma exposición que leads |
| `/api/superadmin/users` | POST | `requireSuperAdmin` ✅ | ❌ | 🔴 ❌ | Sin validación de rol — escalada posible |
| `/api/superadmin/users` | GET/PATCH/DELETE | `requireSuperAdmin` ✅ | ❌ | ❌ | Ops sensibles sin schema |
| `/api/superadmin/tenants` | POST | `requireSuperAdmin` ✅ | ❌ | ❌ | Body raw, plan field libre |
| `/api/superadmin/tenants/validate` | GET | Pública | ❌ | ❌ | Lee datos de tenant — revisar exposición |
| `/api/superadmin/analytics` | GET | `requireSuperAdmin` ✅ | ❌ | ➖ | Agrega por tenant, sin PII directo |
| `/api/[tenant]/orders` | POST | Pública | ⚠️ bajo | ✅ | Precios + customizaciones desde DB ✅ · PII cifrado AES-256-GCM · phoneHash para deduplicación — v3 |
| `/api/[tenant]/orders` | GET | `requireAuth` ✅ | ❌ | ➖ | Tenant-filtrado ✅ · PII descifrado en respuesta — v3 |
| `/api/[tenant]/orders/[id]/status` | PATCH | `requireAuth` ✅ | ❌ | ❌ | Máquina de estados válida ✅ |
| `/api/[tenant]/payments/create-preference` | POST | Pública | ✅ 10/min | ❌ | orderId sin validar como ObjectId |
| `/api/webhooks/mercadopago/[tenant]` | POST | Pública | ❌ | ❌ | ✅ Firma HMAC-SHA256 obligatoria · Webhook Secret requerido en setup — v3 |
| `/api/[tenant]/upload` | POST | `requireAuth` ✅ | ❌ | ❌ | Tipo de archivo parcial, sin límite de tamaño |
| `/api/[tenant]/menu` | GET/POST/PATCH | `requireAuth` ✅ | ❌ | ❌ | Tenant-filtrado ✅ |
| `/api/[tenant]/menu/import` | POST | `requireAuth` ✅ | ❌ | ⚠️ | Validación manual sin Zod |
| `/api/[tenant]/settings/mercadopago` | POST | `requireAdminRole` ✅ | ❌ | ❌ | Credentials cifradas ✅ · Webhook Secret obligatorio — v3 |
| `/api/[tenant]/settings/branding` | POST | `requireAdminRole` ✅ | ❌ | ❌ | |
| `/api/[tenant]/audit` | GET | `requireAdminRole` ✅ | ❌ | ➖ | Paginado, tenant-filtrado ✅ |
| `/api/[tenant]/reports` | GET | `requireAuth` ✅ | ❌ | ➖ | Agrega PII (phone en ICO/reports) |
| `/api/[tenant]/reports/download` | GET | `requireAuth` ✅ | ❌ | ➖ | ✅ PII descifrado en lectura · Exporta datos legibles al autorizado — v3 |
| `/api/[tenant]/users` | POST | `requireAuth` ✅ | ❌ | ❌ | Verifica privilege escalation ✅ |
| `/api/[tenant]/printers` | GET/POST | `requireAuth` ✅ | ❌ | ❌ | |
| `/api/[tenant]/print-jobs` | GET/POST | Sin auth (by design) | ❌ | ❌ | Accedida por printer-agent local |
| `/api/[tenant]/locations` | GET/POST/PATCH | `requireAuth` ✅ | ❌ | ❌ | |

---

## 7. Desarrollo y pruebas

#### Reglas obligatorias

```
R-DEV-01  ESLint con eslint-plugin-security en CI ❌
R-DEV-02  npm audit ejecutado semanalmente ❌
R-DEV-03  Code review con checklist de seguridad (ver sección final)
R-DEV-04  Secrets jamás en commits (git hooks + GitHub secret scanning) ❌
R-DEV-05  Staging con datos anonimizados
R-DEV-06  DAST con OWASP ZAP antes de releases mayores 🔜
R-DEV-07  Penetration testing anual por firma externa 🔜
```

| Regla | Estado | Nota |
|---|---|---|
| ESLint básico | ✅ | `eslint-config-next` |
| `eslint-plugin-security` | ❌ | `npm install -D eslint-plugin-security` |
| `npm audit` automático | ❌ | Configurar GitHub Actions — workflow semanal |
| Git secret scanning | ❌ | Instalar `gitleaks` o `git-secrets` como pre-commit hook |
| DAST / Pentesting | 🔜 | Programar para v1.0 pública |

---

## 8. Monitoreo y respuesta a incidentes

#### Reglas obligatorias

```
R-MON-01  Audit log de todos los eventos sensibles ✅ (parcial)
R-MON-02  Structured logging con Sentry para errores en producción ❌
R-MON-03  Alertas automáticas ante anomalías ❌
R-MON-04  Login / logout / auth failures en AuditLog ✅ — Marzo 2026 v3
R-MON-05  Backups automáticos de DB cifrados y testeados quarterly 🔜
R-MON-06  Notificar usuarios y autoridades en <72h ante brecha (Ley 25.326) ❌
R-MON-07  Retención de logs: 30 días eventos, 7 años transacciones ❌
```

| Regla | Estado | Nota |
|---|---|---|
| AuditLog en DB | ✅ | `models/AuditLog.ts` + `lib/audit.ts` |
| Eventos auditados | ✅ | Settings ✅ · Status órdenes ✅ · Login ✅ · Logout ✅ — Marzo 2026 v3 |
| Vercel Logs | ✅ | Dashboard → Observability → Logs |
| Alertas en tiempo real | 🔜 | Configurar alertas 5xx en Vercel |
| Plan IR documentado | ❌ | Ver plantilla abajo |
| Backups MongoDB Atlas | ⚠️ | Depende del plan contratado — verificar M10+ |

#### Plan de respuesta a incidentes (NIST)

```
1. IDENTIFICAR  → Alert en Vercel Logs / AuditLog anómalo detectado
2. CONTENER     → Revocar tokens / deshabilitar tenant afectado en DB (isActive: false)
3. ERRADICAR    → Parchar vulnerabilidad, rotar secrets comprometidos
4. RECUPERAR    → Restaurar desde backup, validar integridad de datos
5. NOTIFICAR    → Usuarios afectados + AAIP (si hay brecha de PII) en <72h
```

---

## 9. Escalabilidad segura

> Las siguientes reglas aplican principalmente en la fase **Hostinger VPS** y posteriores.

```
R-SCALE-01  Contenedores Docker con secrets en variables de entorno (no en imagen)
R-SCALE-02  WAF dedicado (Cloudflare o similar) frente al servidor
R-SCALE-03  IAM/VPC: acceder a DB solo desde la red privada del servidor
R-SCALE-04  Rate limiting con Redis compartido (no in-memory) ✅ (Upstash ya activo)
R-SCALE-05  Sharding por tenant si la DB supera 10k pedidos/día
R-SCALE-06  Auditoría de seguridad por terceros antes del lanzamiento público masivo
R-SCALE-07  Monitoreo de métricas: tiempo a parche < 48h, cobertura de tests ≥ 80%
R-SCALE-08  Key versioning en ENCRYPTION_KEY antes de escalar (rotar sin romper datos)
```

---

## 10. Plan de mitigación priorizado

> Ordenado por **riesgo × esfuerzo**. Las filas con 🔴 son bloqueantes para producción.

### Prioridad CRÍTICA — Antes de cualquier deploy

| # | Problema | Solución | Estado |
|---|---|---|---|
| 1 | `.env.local` con credenciales de producción | Verificar git history · Rotar TODAS las credenciales | 🔴 ACCIÓN MANUAL REQUERIDA |
| 2 | `AUTH_SECRET` débil | `openssl rand -base64 32` → actualizar en Vercel env vars | 🔴 ACCIÓN MANUAL REQUERIDA |
| 3 | Webhook MP sin firma obligatoria | ✅ Resuelto — Firma obligatoria implementada — Marzo 2026 |
| 4 | Superadmin user creation sin validación de rol | ✅ Resuelto — Zod schema + `superadmin` bloqueado — Marzo 2026 |
| 5 | Rate limit in-memory no funciona en serverless | ✅ Resuelto — Upstash Redis |
| 6 | Sin session maxAge | ✅ Resuelto — `maxAge: 8 * 60 * 60` |
| 7 | Sin headers de seguridad HTTP | ✅ Resuelto — 6 headers en `next.config.ts` (incl. CSP) |
| 8 | Rate limiting en orders POST y payments | ✅ Resuelto — Redis aplicado |

### Prioridad ALTA — Este sprint

| # | Problema | Solución | Estado |
|---|---|---|---|
| 9 | Leads y Network APIs sin rate limit ni Zod | ✅ Resuelto — Marzo 2026 |
| 10 | Sin Content-Security-Policy | ✅ Resuelto — CSP en `next.config.ts` — Marzo 2026 |
| 11 | PII en texto plano en Orders | Cifrar `customer.name`, `.phone` y `.email` con AES-256-GCM | ✅ Resuelto — Marzo 2026 v3 |
| 12 | `orderId` sin validar como ObjectId en payments | ✅ Resuelto — `objectIdSchema` en Zod — Marzo 2026 |
| 13 | Tenant creation sin schema | ✅ Resuelto — Zod schema + duplicate check — Marzo 2026 |
| 14 | Validación Zod faltante en settings, locations, printers | Schemas adicionales en `lib/schemas.ts` | ❌ Pendiente |

### Prioridad MEDIA — Pre-escala

| # | Problema | Solución | Estado |
|---|---|---|---|
| 15 | Sin MFA para admins | TOTP con `otplib`, obligatorio para `admin` / `superadmin` | ❌ Pendiente |
| 16 | CAPTCHA en login | `@hcaptcha/react-hcaptcha` o Cloudflare Turnstile | ❌ Pendiente |
| 17 | Login/logout/failures no en AuditLog | Eventos `auth.login` y `auth.logout` en NextAuth `events` | ✅ Resuelto — Marzo 2026 v3 |
| 18 | `npm audit` manual | GitHub Actions — workflow semanal automático | ❌ Pendiente |
| 19 | `eslint-plugin-security` no instalado | `npm install -D eslint-plugin-security` | ❌ Pendiente |
| 20 | Sin DAST automatizado | OWASP ZAP en CI/CD previo a releases | 🔜 Pendiente |

### Prioridad BAJA — Fase Hostinger

| # | Problema | Solución |
|---|---|---|
| 21 | Sin WAF dedicado | Cloudflare proxy + WAF rules |
| 22 | Backups no gestionados desde el app | MongoDB Atlas Backup Schedule (M10+) |
| 23 | Sin Docker en producción | Dockerizar app para Hostinger VPS |
| 24 | Pentesting | Contratar firma externa antes de lanzamiento nacional |
| 25 | ENCRYPTION_KEY sin key versioning | Implementar rotación de clave con migración de datos |

---

## Score de seguridad — Comparativa v1 / v2 / v3

| Categoría | v1 | v2 | v3 | Delta v2→v3 | Observación v3 |
|---|---|---|---|---|---|
| **Autenticación** | 7/10 | 7/10 | 7/10 | → | Sólido. Falta MFA y AUTH_SECRET fuerte |
| **Autorización** | 8/10 | 7/10 | 7/10 | → | Superadmin routes aún mejorable |
| **Cifrado de datos** | 5/10 | 5/10 | 10/10 | ↑↑↑ | PII cifrado en Orders + Leads + NetworkRestaurant + Reservations — v3.1 |
| **Validación de inputs** | 5/10 | 8/10 | 8/10 | → | Zod en todos los flujos críticos |
| **Rate limiting** | 6/10 | 9/10 | 9/10 | → | Login, payments, leads, network protegidos |
| **Webhook security** | 7/10 | 9/10 | 10/10 | ↑ | Firma obligatoria + Webhook Secret requerido en setup — v3 |
| **CORS** | 2/10 | 2/10 | 8/10 | ↑↑↑ | Access-Control-Allow-Origin restringido en rutas admin — v3 |
| **Gestión de secrets** | 1/10 | 1/10 | 1/10 | → | **Pendiente acción manual:** rotar credenciales de `.env.local` |
| **Audit logging** | 7/10 | 6/10 | 9/10 | ↑↑↑ | Login ✅ · Logout ✅ · Settings ✅ · Status ✅ — v3 |
| **Headers HTTP** | 7/10 | 9/10 | 9/10 | → | CSP + 5 headers implementados |
| **Aislamiento multi-tenant** | 8/10 | 8/10 | 8/10 | → | Bien implementado y verificado |
| **TOTAL** | **6.1/10** | **7.1/10** | **8.3/10** | **↑** | Cifrado PII completo en todos los modelos con datos de clientes — v3.1 |

> Score actualizado post-mitigación Marzo 2026 v3.1. El único bloqueante para producción sigue siendo la **rotación manual de credenciales** de `.env.local`. El próximo objetivo es **9/10** con MFA para admins.

---

## Checklist de code review (usar en cada PR)

```
[ ] ¿El endpoint verifica tenantId antes de operar?
[ ] ¿El endpoint usa requireAuth() o requireAdminRole() según corresponde?
[ ] ¿Los precios/totales se calculan en servidor, nunca del cliente?
[ ] ¿No hay secrets hardcodeados?
[ ] ¿Los inputs se validan con Zod antes de ir a la DB?
[ ] ¿No se loggea PII (email, teléfono, tokens)?
[ ] ¿Los campos PII (name/email/phone) se cifran con encrypt() al escribir y se descifran con safeDecrypt() al leer?
[ ] ¿Los nuevos modelos incluyen tenantId indexado?
[ ] ¿dangerouslySetInnerHTML NO se usa (o si se usa, hay DOMPurify)?
[ ] ¿Se registró el evento en AuditLog si es una acción sensible?
[ ] ¿Las APIs públicas tienen rate limiting?
[ ] ¿Los webhooks verifican firma de forma obligatoria?
[ ] ¿El nuevo endpoint fue agregado a la Matriz de seguridad (sección 6)?
[ ] ¿El nuevo endpoint tiene validación de ObjectId para parámetros de ID?
```

---

*Documento vivo — se actualiza con cada cambio de seguridad implementado en el codebase.*
*Versión 3.1 — Marzo 2026. Próxima revisión: Junio 2026.*
