# TakeasyGO — Runbook de Incidentes

## Arquitectura

| Servicio | URL | Plataforma | Deploy |
|---|---|---|---|
| SaaS (Next.js) | www.takeasygo.com | Vercel | Auto-deploy from `main` |
| POS (PWA) | pos.takeasygo.com | Vercel | Auto-deploy from `main` |
| Sync Layer (Express + Redis + BullMQ) | takeasygo.onrender.com | Render | Auto-deploy from `main` |
| MongoDB Atlas | cluster0.xxxxx.mongodb.net | Atlas | — |
| Redis (Upstash) | hot-cat-150438.upstash.io | Upstash | — |

## On-Call (72hs post-lanzamiento)

**Nombre:** Gonzalo Palomo
**Teléfono:** +5491160019734
**Email:** takeasygo.latam@gmail.com

## Incidentes comunes

### 1. POS → SaaS no sincroniza estados

**Síntoma:** Cambios de estado en POS no se reflejan en el dashboard del SaaS.

**Causa más probable:** Header `X-Internal-Secret` no llega al SaaS (proxy stripping).

**Pasos:**
1. Verificar logs de Vercel → buscar `[isInternalAuth]`
2. Verificar logs de Render → buscar `WORKER JOB RECEIVED`
3. Si Render envía pero Vercel recibe vacío → problema de proxy (Cloudflare/Vercel edge)
4. Si Render no encola → verificar `POST /:orderId/status` en logs de Render

### 2. SaaS caído (500/502)

**Pasos:**
1. Verificar status en Vercel Dashboard → Deployments
2. Verificar logs en Vercel → Functions
3. Verificar MongoDB Atlas → Connections activas
4. Si MongoDB saturado → verificar Atlas Metrics → Operations

### 3. Sync Layer caído

**Pasos:**
1. Verificar health: `GET https://takeasygo.onrender.com/api/v1/health`
2. Verificar logs en Render Dashboard → Logs
3. Verificar Redis connection en logs
4. Si Redis caído → RenderRedis Metrics

### 4. POS no conecta (offline)

**Pasos:**
1. Verificar que el dispositivo tiene internet
2. Verificar que SyncLayer responde health check
3. Verificar localStorage del POS (Dexie/IndexedDB)
4. Forzar reconexión: cerrar y reabrir la PWA

### 5. Pagos fallan (Mercado Pago)

**Pasos:**
1. Verificar Mercado Pago Dashboard → Pagos
2. Verificar webhook delivery en MP Dashboard
3. Verificar logs de Vercel para `/api/webhooks/pos`
4. Si webhook no llega → verificar URL en configuración de MP

### 6. Redis rate limit exceeded (Upstash)

**Síntoma:** SyncLayer caído. Logs muestran `ERR max requests limit exceeded. Limit: 500000`.

**Causa:** Upstash free tier agotado (500K requests/mes).

**Pasos:**
1. Verificar Upstash Dashboard → Usage
2. Si free tier agotado → upgrade a Pro (~$10/mes) O crear nueva instancia
3. Si nueva instancia → actualizar `REDIS_URL` en Render dashboard
4. Verificar deploy + health check

### 7. Secret rotation needed

**Síntoma:** Auth failures entre servicios después de rotate.

**Pasos:**
1. Generar nuevos secrets: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Actualizar Vercel: `SYNC_LAYER_SECRET`, `AUTH_SECRET`
3. Actualizar Render: `SYNC_LAYER_SECRET`, `INTERNAL_API_SECRET`
4. **NOTA:** `SYNC_LAYER_SECRET` e `INTERNAL_API_SECRET` son valores **DIFERENTES**
5. Verificar deploy + test E2E

## Variables de entorno críticas

| Variable | Dónde | Uso |
|---|---|---|
| `SYNC_LAYER_SECRET` | Render + Vercel | Auth interna SyncLayer → SaaS |
| `INTERNAL_API_SECRET` | Render | Auth interna SaaS → SyncLayer (VALOR DIFERENTE a SYNC_LAYER_SECRET) |
| `AUTH_SECRET` | Vercel | NextAuth sessions |
| `MONGODB_URI` | Render + Vercel | Conexión a MongoDB Atlas |
| `REDIS_URL` | Render | Conexión a Upstash Redis |
| `NEXTAUTH_SECRET` | Vercel | Sesiones del SaaS |
| `MERCADOPAGO_*` | Vercel | Pagos |

## Contactos de emergencia

- **Render Support:** support@render.com
- **Vercel Support:** support@vercel.com
- **MongoDB Atlas:** support@mongodb.com
- **Mercado Pago:** soporte@mercadopago.com.ar
