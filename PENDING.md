# TakeasyGO — Pendientes y Documentación Importante

## Estado actual
- ✅ POS → Render → BullMQ → SaaS status sync funcionando
- ✅ Seguridad audit items #1-6 completados
- ✅ HSTS + Runbook + On-call
- ⚠️ Secrets comprometidos (mismos en todos los ambientes)

---

## Pendientes Semana 1

### 1. Rotar TODOS los secrets (CRÍTICO)
- `SYNC_LAYER_SECRET` — mismo en Render + Vercel (dev=staging=prod)
- `INTERNAL_API_SECRET` — mismo en Render + .env.production
- `NEXTAUTH_SECRET` — Vercel
- `MERCADOPAGO_*` — Vercel
- `MONGODB_URI` — Render + Vercel (mismo cluster para todo)
- **Acción:** generar nuevos, actualizar Vercel Dashboard + Render Dashboard, redeployar ambos

### 2. Verificar backups MongoDB Atlas
- Atlas Dashboard → Backups habilitados?
- Último backup reciente?
- Point-in-time recovery activado?
- **Test:** restaurar un backup a un cluster temporal

### 3. `confirmOrder` en POS (order.ts)
- Falta `jwt?` param + `notifyStatusToSyncLayer` en `confirmOrder()`
- No conectado a UI activa, pero completar por consistencia

### 4. `useOrders` hook (POS)
- `cancelOrder`, `deliverOrder` no pasan JWT al llamar a funciones de order.ts
- Cuando se usen esas funciones desde UI, van a fallar el notifyStatusToSyncLayer

### 5. `canPerformAction()` enforcement (P1)
- No existen rutas de refund/cash register todavía
- Cuando se creen, enforcear `canPerformAction()` en cada una

### 6. Limpiar diagnostic logging
- Render logs: `console.warn` en auth middleware, `console.log` en config
- Render routes: logs de orderId, syncOrder, enqueue
- Worker: logs de token length, JOB RECEIVED
- **Acción:** una vez confirmado estable, bajar a nivel debug o eliminar

---

## Arquitectura de servicios

| Servicio | URL | Plataforma | Deploy |
|---|---|---|---|
| SaaS (Next.js) | www.takeasygo.com | Vercel | Auto-deploy `main` |
| POS (PWA) | pos.takeasygo.com | Vercel | Auto-deploy `main` |
| Sync Layer | takeasygo.onrender.com | Render | Auto-deploy `main` |
| MongoDB Atlas | cluster0.xxxxx.mongodb.net | Atlas | — |
| Redis | red-xxxxx.render.com | Render | — |

---

## Auth entre servicios

```
POS → SyncLayer:  JWT (Bearer token from /auth/pos-login)
SyncLayer → SaaS: X-Internal-Secret (SYNC_LAYER_SECRET)
SaaS → SyncLayer: X-Internal-Secret (SYNC_LAYER_SECRET)
Admin → SaaS:     NextAuth JWT (from browser)
```

**Importante:** Cloudflare/Vercel edge strippea el header `Authorization`. Siempre usar `X-Internal-Secret` para comunicación interna.

---

## Máquina de estados de pedidos

```
pending → confirmed → preparing → ready → en_ruta → arrived → delivered
   ↓          ↓           ↓
cancelled  cancelled   cancelled
```

- POS es **autoritativo**: cuando envía status via internal auth, el SaaS no valida transiciones
- Admin del SaaS: sí valida transiciones (para evitar errores humanos)

---

## Variables de entorno críticas

| Variable | Dónde | Uso |
|---|---|---|
| `SYNC_LAYER_SECRET` | Render + Vercel | Auth interna servicios |
| `INTERNAL_API_SECRET` | Render | Auth interna SyncLayer |
| `MONGODB_URI` | Render + Vercel | MongoDB Atlas |
| `REDIS_URL` | Render | Redis (BullMQ queues) |
| `NEXTAUTH_SECRET` | Vercel | Sesiones SaaS |
| `MERCADOPAGO_ACCESS_TOKEN` | Vercel | Pagos |
| `CORS_ORIGIN` | Render | `https://www.takeasygo.com,https://pos.takeasygo.com` |

---

## On-Call (72hs post-lanzamiento)

- **Nombre:** Gonzalo Palomo
- **Teléfono:** +5491160019734
- **Email:** takeasygo.latam@gmail.com

---

## Notas de debugging

- **Vercel logs:** Functions tab → buscar por `[isInternalAuth]` o `[status]`
- **Render logs:** Logs tab → buscar por `WORKER JOB RECEIVED` o `enqueueConfirmForward`
- **POS Network tab:** verificar que requests a Render llegan (200 OK)
- **Si 401 en SaaS:** verificar `SYNC_LAYER_SECRET` coincide en ambos ambientes
- **Si 400 en SaaS:** verificar máquina de estados o que `isInternalAuth` retorna true

---

## Git

- Solo ramas: `main`, `dev`, `cash`
- Deploy automático desde `main`
- Commits significativos:
  - `8b45746` — X-Internal-Secret header fix
  - `59f1827` — Skip state machine for internal auth
  - `e55047e` — Diagnostic logging + setEnRuta/setArrived fix
  - `e52ef9f` — HSTS + Runbook + On-call
