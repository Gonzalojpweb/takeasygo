# Auditoría de seguridad POS / POS-online — informe S0

**Fecha:** 2026-10-05 · **Rama:** `dev` @ `73ad87a` · **Alcance:** verificación de hallazgos S0 (código + probes de producción + DB) previo a los fixes S1.

---

## 1. Veredicto por ítem

### S0.1 — Webhook POS: firma opcional (Alta)

- `apps/saas/app/api/webhooks/pos/[tenant]/route.ts:89-97` — la firma se verifica **solo si viene el header**, y la comparación usa `!==` (no timing-safe). El comentario de `:96-97` admite explícitamente el caso "FUDO sandbox".
- Orden actual: parse del body y validaciones (`:49-74`) → `connectDB` (`:76`) → tenant (`:77-80`) → `webhookSecret` requerido (`:83-85`, responde 400 si no) → firma opcional (`:89-97`).
- Contrato documentado (`:17`): `HMAC-SHA256` hex del `rawBody` enviado en `X-POS-Signature`.
- Producción (DB `test`): **0 de 51 tenants con `posIntegration.webhookSecret`** → el endpoint hoy responde 400 para todos. Hacer la firma obligatoria **no rompe ninguna integración viva**.
- Fix acordado (S1-1): firma obligatoria (sin header → 401, antes de tocar la DB), `crypto.timingSafeEqual`, timestamp anti-replay (±300s), sandbox FUDO solo con `POS_WEBHOOK_ALLOW_UNSIGNED=1`.

### S0.2 — Claves JWT y huellas (CERRADO, verificado 2026-10-05)

- **Circuito prod cerrado y verificado con probes:** sync (EC2) firma con el par huella **`fa042c28599e3f858d132783536af5aa`** (vive en `/home/ubuntu/app/apps/sync/.env`, pm2 `sync-layer`, dotenv; sin `keys.private.pem` en el server ni en la env de pm2) y el SaaS de Vercel **lo acepta**: probe firmado con esa clave → 403 (auth pasó), probe firmado con el par del repo (`be239784...`) → 401, control sin auth → 401. No hay mismatch → **no hay P0 de rotación JWT**.
- Vercel debe tener **`POS_JWT_PUBLIC_KEY` = pública de `fa042c28`** (tiene prioridad en `posJwt.ts:74`). El `SSO_JWT_PUBLIC_KEY` = `be239784...` que está seteado está **sombreado/viejo**: si algún día se borra `POS_JWT_PUBLIC_KEY`, el SaaS cae a `be239784` y el login se rompe en silencio → higiene: borrar o alinear esa var (ops).
- **La privada de `fa042c28` nunca estuvo en git** (solo el `.env` de la EC2). `keys.private.pem` local está en `.gitignore:93-94` y `git log --all` no lo registra jamás. La única clave privada que tocó la historia pública es la del par viejo **`670c9409039513bee4b4f7101891f7da`** (en `apps/sync/.env.example`, de `4ba2121` hasta `38ec3ce`) — ya no se usa en ningún lado.
- Los 401 de los probes originales de S0 eran **correctos**: la clave del repo (`be239784`) no la acepta prod (y el control positivo estaba mal planteado — firmaba con la clave equivocada).
- `be239784...` (par local `apps/sync/keys.*.pem` = `POS_PUBLIC_KEY_FALLBACK`) es solo el respaldo embebido de desarrollo.
- **Hecho por mí:** huella del `JWT_PRIVATE_KEY` de la EC2 = `fa042c28...` (comando por stdin, la privada nunca salió del server ni se imprimió). Keypair solo-prod ya es así: la privada vive únicamente en la EC2.

### S0.2b — Credenciales Atlas en la historia del repo (P0)

- Repo **público** (`api.github.com` → `private=false`). `apps/sync/.env.example` en la historia previa a `38ec3ce` contiene credenciales reales de Atlas.
- Check booleano contra `.env.local` actual: mismo usuario, misma contraseña, mismo host → **las tres vigentes**. La "rotación" de `38ec3ce` no rotó estas credenciales.
- `CRON_SECRET` filtrado en `TECNICAL/ICOUPDATE.MD:633` → **rotado** (ya no coincide). Clave RSA histórica → **rotada**.
- Acción: rotar el usuario/contraseña del cluster en Atlas y actualizar envs (Vercel / `.env` de la EC2 / `.env.local`) — solo el dueño puede hacerlo.

### S0.3 — Precios y estados confiados al cliente (Alta)

- `packages/business/src/order.ts:15-39` `validateOrderItems`: solo valida aritmética, **no consulta catálogo**.
- `apps/saas/lib/pos-online/orderMapper.ts:169-192`: `unitPrice`/modifiers llegan desde el body del cliente.
- `apps/saas/lib/pos-online/orderMapper.ts:280-287`: el mapper fuerza `payment.method = 'cash'`, `payment.status = 'approved'` y toma el status inicial del cliente.
- Fix acordado (S1-2): el server ignora los precios del cliente y usa el catálogo; definir el manejo de órdenes offline (`menuVersion`).

### S0.4 — Auth chain del POS

- `apps/saas/__tests__/integration/pos-context.test.ts`: **24/24 passed** — cross-tenant → 403, superadmin bypass, token inválido/vencido/ausente → 401, scoping por sede.
- Sin `middleware.ts` de Next en el repo.
- Roles: **cero gates de rol** en las 11 rutas `/pos/*` (el `role` solo se registra en auditoría). `VALID_DEVICE_ROLES` existe únicamente en el middleware de sync (`apps/sync/src/middleware/auth/middleware.ts:51`); mapeo `SAAS_TO_POS_ROLE` en `packages/business/src/role-mapping.ts:12-25`; `cancelledBy: 'admin'` hardcodeado en `orders/[id]` route:57.
- Prod: probes con token firmado por la clave del repo → 401 (correcto: prod verifica con `fa042c28`, ver S0.2). Cross-tenant real en prod → **pendiente de los 2 usuarios de prueba**.

### S0.5 — Logout / almacenamiento (Media)

- `apps/pos/src/hooks/AuthContext.tsx:267-277`: el logout borra solo `sessionStorage` y `db.session`; **no** limpia Dexie (menús, cachés), no revoca el JWT y no hay denylist.
- Token en `sessionStorage` — aceptado condicional a un CSP estricto (la app POS hoy no tiene CSP, ver S0.7).
- Fix acordado (S1-5): logout total (limpieza completa de Dexie + denylist `jti` en Redis con TTL 30 min).

### S0.6 — Fuerza bruta de PIN (Alta)

- `apps/sync/src/middleware/rate-limiter.ts:79-104`: buckets **por IP, en memoria**, 10/min (`config.ts:54-56`); `trust proxy` habilitado en `sync/src/index.ts:30`.
- Sin límite por cuenta, sin lockout progresivo, y el estado no se comparte entre instancias.
- Fix acordado (S1-3): contador por cuenta + lockout progresivo en store compartido (Redis).

### S0.7 — Headers / CSRF / CSP (Media)

- `pos.takeasygo.com`: **sin CSP** (solo HSTS + `Access-Control-Allow-Origin: *`); `apps/pos/vercel.json` solo define `installCommand`.
- SaaS (`next.config.ts`): headers completos, pero `script-src 'unsafe-inline' 'unsafe-eval'`.
- Cookies en vivo: `SameSite=Lax; Secure; HttpOnly; __Host-` (mitigación parcial de CSRF); **0 chequeos de Origin** en `apps/saas/**/*.ts`.
- El `*` de CORS en la app POS es el más urgente de los dos CSP; queda fuera del orden S1 acordado (se ve después de los 5 fixes).

### S0.8 — Secretos en repo / privilegios Mongo

- `.gitignore` correcto; historial limpio salvo el P0 de S0.2b.
- Mongo (prod): `listUsers` → **DENIED**; `getCmdLineOpts` → **ALLOWED** (expone la línea de comandos) → bajar a usuario solo lectura + allowlist de IPs.
- Gitleaks 8.30.1: **155 findings en 6 archivos** — 1 P0 (clave + URI Atlas históricos), CRON rotado, `inviteTokens` en `corporateaccounts_backup_2026-09-01.json` trackeado, ~147 fixtures (FP).

### S0.9 — Dependencias

- `pnpm audit`: **147 vulns** — 1 crítica: `next` `>=16.2.0 <16.3.6` (RCE vía `next/og`); el repo está en `16.3.3` → subir a `>=16.3.6`. 62 high (nodemailer, sharp, socket.io-parser, engine.io, lodash/cloudinary, exceljs>tmp).

### Repro de idempotencia en `POST /api/[tenant]/orders` (verificado)

- Mismo `posId` + misma firma → **200** con la orden existente; `posId` distinto con el mismo `Idempotency-Key` → **409** `idempotency_mismatch`; `findExisting({ tenantId, posId })` tenant-scoped; `Idempotency-Key` debe ser igual a `body.id`.

---

## 2. Tabla de severidad y fixes (veredicto del dueño)

| # | Hallazgo | Severidad | Fix acordado | Lugar |
|---|----------|-----------|--------------|-------|
| 1 | Webhook sin firma obligatoria + `!==` no timing-safe | Alta | Firma obligatoria (401 sin header), `timingSafeEqual`, timestamp anti-replay, sandbox solo con flag | **S1-1 (primero)** |
| 2 | Precios/modifiers confiados al cliente | Alta | Server ignora los del cliente y usa el catálogo | S1-2 |
| 3 | Login limitado solo por IP, en memoria | Alta | Lockout por cuenta progresivo en Redis | S1-3 |
| 4 | Mapper fuerza cash/approved + status inicial del cliente | Media | Resolver con `payOrder` (server setea el estado inicial) | post-S1 |
| 5 | Logout no revoca JWT ni limpia Dexie | Media | Dexie completo + denylist `jti` Redis TTL 30 min | S1-5 |
| 6 | Token en `sessionStorage` | Media | Aceptado con CSP estricto | CSP aparte |
| 7 | `getCmdLineOpts` + PEMs de dev en máquinas | Baja | Usuario Mongo solo lectura + allowlist; rotación de credenciales (ver P0) | ops |

---

## 3. Plan S1 (orden acordado)

1. **Webhook con firma obligatoria** — rama `fix/webhook-signature-required`, tests negativos: sin firma, firma inválida, body alterado, timestamp viejo/futuro, flag sandbox. **Hecho:** `cd0ece3` (49/49).
2. Precios desde el catálogo en el server. **Hecho:** `fix/server-catalog-prices` @ `4e11b4e` (85/85 targeted, 730/730 suite; rechazo 409 si difiere).
3. Lockout por cuenta (Redis). **Hecho:** `fix/login-lockout` @ `64a0440` (58/58).
4. JWT fail-closed + `kid`. **Pendiente.**
5. Logout completo. **Pendiente.**

Estado: las 3 ramas están locales, sin push, sin merge — esperan tu revisión.

Reglas: **una rama por fix, tests negativos, diff pegado para revisión, no merge sin visto bueno**. Recién después de S1: `payOrder` → `docs/POS-FLOWS.md` → F1.

---

## 4. Pendientes

**Tuyos (requieren tus credenciales):**

- ~~Huella de la clave que firma en prod~~ **Hecho:** EC2 `JWT_PRIVATE_KEY` = `fa042c28...` y los probes confirman que Vercel la acepta (S0.2). Sobra borrar/alinear el `SSO_JWT_PUBLIC_KEY` viejo en Vercel (ops).
- Confirmar si `test` es la base de producción (`MONGODB_URI` de Vercel) y probar el login en `pos.takeasygo.com`.
- Crear 2 usuarios cajeros de prueba (la-pesceria + ligre) con PINs desechables.
- `POS_CORS_ORIGIN` en Vercel (el default `http://localhost:5173` bloquearía el POS en prod).
- Rotar las credenciales Atlas del P0 (siguen vigentes).

**Míos (tras tu revisión del diff):**

- Cross-tenant real contra prod con los 2 usuarios de prueba.
- S1-4 (JWT fail-closed + `kid`) y S1-5 (logout) — S1-1/2/3 ya están en ramas esperando tu visto bueno.
- Hallazgos nuevos post-S1-2 (pendientes de tu decisión): órdenes half-half 400 pre-existente, `priceRule` max/average 400 pre-existente, `unitPrice` del cliente aceptado en sync (candidato S1-2b).
