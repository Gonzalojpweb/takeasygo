# TakeasyGO — Runbook de Incidentes

## Arquitectura

| Servicio | URL | Plataforma | Deploy |
|---|---|---|---|
| SaaS (Next.js) | www.takeasygo.com | Vercel | Auto-deploy from `main` |
| POS (PWA) | pos.takeasygo.com | Vercel | Auto-deploy from `main` |
| Sync Layer (Express + Redis + BullMQ) | takeasygo.onrender.com | Render | Auto-deploy from `main` |
| MongoDB Atlas | cluster0.xxxxx.mongodb.net | Atlas | — |
| Redis | redis://red-xxxxx:6379 | Render | — |

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

## Variables de entorno críticas

| Variable | Dónde | Uso |
|---|---|---|
| `SYNC_LAYER_SECRET` | Render + Vercel | Auth interna entre servicios |
| `INTERNAL_API_SECRET` | Render | Auth interna del SyncLayer |
| `MONGODB_URI` | Render + Vercel | Conexión a MongoDB Atlas |
| `REDIS_URL` | Render | Conexión a Redis |
| `NEXTAUTH_SECRET` | Vercel | Sesiones del SaaS |
| `MERCADOPAGO_*` | Vercel | Pagos |

## Contactos de emergencia

- **Render Support:** support@render.com
- **Vercel Support:** support@vercel.com
- **MongoDB Atlas:** support@mongodb.com
- **Mercado Pago:** soporte@mercadopago.com.ar
