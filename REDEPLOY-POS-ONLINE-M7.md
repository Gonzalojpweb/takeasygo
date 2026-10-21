# Redespliegue — POS Online M7 (correcciones de la auditoría)

> Commit: `43fab5eb feat(pos-online): correcciones de la auditoria POS Online V1` (rama `dev`).
> Detalle técnico: `docs/INFORME-POS-ONLINE-V1-VALIDACION-Y-CORRECCIONES-2026-10-21.md`.
>
> **Orden obligatorio: 0 → 1 (EC2) → 2 (Vercel SaaS) → 3 (Vercel POS) → 4 (verificación).**
> El Sync va primero porque el POS nuevo llama a `/api/v1/auth/refresh`, que solo existe en el Sync nuevo.

---

## Paso 0 — Preparar el código y el secreto (5 min)

1. Subir la rama (está 21 commits adelante de `origin/dev`, incluye también los commits de multisede):
   ```bash
   git push origin dev
   ```
2. Si producción (Vercel) despliega desde `main`: abrir PR `dev → main`, revisar y mergear. Si despliega desde `dev`, el push ya dispara el build (igual seguí los pasos 2 y 3 para las variables).
3. Generar **un** secreto para el PIN del POS y guardarlo en tu gestor de contraseñas. Se usa **idéntico** en EC2 y en Vercel:
   ```bash
   openssl rand -hex 32
   ```
   (En PowerShell sin openssl: `-join ((1..32) | % { '{0:x2}' -f (Get-Random -Max 256) })`)

---

## Paso 1 — EC2: Sync Layer (`sync.takeasygo.com`)

```bash
ssh ubuntu@<IP-o-host-de-la-instancia>        # con tu .pem
cd <ruta-del-repo>                            # donde corre hoy el Sync
git fetch origin && git checkout <rama-de-produccion> && git pull

pnpm install --frozen-lockfile
pnpm --filter @takeasygo/types build
pnpm --filter @takeasygo/business build
pnpm --filter @takeasygo/db build
pnpm --filter @takeasygo/sync build
```

Agregar la variable al entorno del proceso (en el `.env.production` del Sync o en el `ecosystem` de pm2, donde estén hoy `INTERNAL_API_SECRET`, `MONGODB_URI`, etc.):

```
POS_PIN_PEPPER=<el secreto del paso 0>
```

Reiniciar con las variables nuevas:

```bash
pm2 ls                                   # identificar el nombre del proceso del Sync
pm2 restart <nombre-proceso> --update-env
pm2 logs <nombre-proceso> --lines 50     # sin errores de arranque
```

Verificación rápida:

```bash
curl -s https://sync.takeasygo.com/api/v1/health
# → "uptime" chico (recién reiniciado)

curl -si -X POST https://sync.takeasygo.com/api/v1/auth/refresh | head -1
# → HTTP/1.1 401   (la ruta existe y exige token; antes era 404)
```

---

## Paso 2 — Vercel: proyecto **SaaS** (`www.takeasygo.com`)

Vercel → proyecto SaaS → **Settings → Environment Variables** (entorno *Production*):

| Acción | Variable | Valor |
|---|---|---|
| **Agregar** | `POS_CORS_ORIGINS` | `https://pos.takeasygo.com` |
| **Borrar** | `POS_CORS_ORIGIN` | (hoy vale `"true"`: es la causa del bloqueo. Si la dejás se ignora, pero mejor borrarla) |
| **Agregar** | `POS_PIN_PEPPER` | el **mismo** secreto del paso 0 |

Luego **Deployments → Redeploy** del último deploy de producción (o esperar el build del push/merge del paso 0, que ya toma las variables nuevas si se cargaron antes).

Verificación:

```bash
curl -si -X OPTIONS https://www.takeasygo.com/api/demo/pos/menu \
  -H "Origin: https://pos.takeasygo.com" -H "Access-Control-Request-Method: GET" | grep -i access-control-allow-origin
# → access-control-allow-origin: https://pos.takeasygo.com      (antes: true)

curl -si -X OPTIONS https://www.takeasygo.com/api/auth/logout \
  -H "Origin: https://pos.takeasygo.com" -H "Access-Control-Request-Method: POST" | grep -i access-control-allow-origin
# → access-control-allow-origin: https://pos.takeasygo.com      (antes: sin header)

curl -si -X OPTIONS https://www.takeasygo.com/api/demo/pos/menu \
  -H "Origin: https://evil.example" -H "Access-Control-Request-Method: GET" | head -1
# → HTTP/2 403
```

---

## Paso 3 — Vercel: proyecto **POS** (`pos.takeasygo.com`)

No hay variables nuevas. Confirmar que siguen así (Production):

```
VITE_SYNC_URL=https://sync.takeasygo.com
VITE_SAAS_URL=https://www.takeasygo.com
```

**Redeploy** (son variables de build: el bundle se arma con ellas).

---

## Paso 4 — Verificación funcional (15 min, en una tablet/PC real)

1. **SaaS → Usuarios:** en un usuario cajero → **Generar PIN**. Anotarlo (se muestra una sola vez).
2. **POS:** login con ese PIN → entra. Con un segundo cajero y su propio PIN → también entra (antes solo entraba uno).
3. **F5 en el POS** → sigue logueado (antes volvía al login).
4. **Caja:** abrir con `$1000` → el saldo muestra `$1.000,00` (antes `$10,00`). Abrir con `$1000,50` → funciona (antes error).
5. **Mostrador:** agregar un producto con modificadores → Revisar → Cobrar → dividir en 2 partes: efectivo + POSNET débito (con comprobante) → Confirmar. Con "Enviar a cocina" tildado: sale la comanda por la impresora (si la sede tiene printer-agent) y el pedido aparece en **Mis Pedidos**.
6. **Salón:** mesa → productos → **Enviar a cocina (sin cobrar)** → volver a la mesa → aparece "Ya enviado a cocina" → **Cobrar cuenta** → la mesa queda libre.
7. **Caja → Cerrar** → ver el Z. En el **SaaS → Cajas POS** aparece el cierre con el desglose por método.
8. **SaaS → menú:** cambiar un precio → en ≤ 40 s el POS lo muestra sin recargar.
9. Dejar el POS abierto > 30 min → la sesión se renueva sola (no pide PIN).

---

## Paso 5 — Pendientes con acceso a la base / cuenta

1. **Índice `users.phone`** (Mongo de producción, solo lectura primero):
   ```js
   db.users.getIndexes().filter(i => i.key.phone)
   ```
   Si aparece `unique: true` **sin** `partialFilterExpression`, avisame antes de tocar nada: hay que migrarlo a índice único parcial (`{ phone: { $type: "string" } }`), si no el segundo usuario sin teléfono no se puede crear.
2. **Render** (`takeasygo.onrender.com`): sigue vivo y no lo usa nadie. Recomendado **suspenderlo/borrarlo** (tiene credenciales de la base).
3. Opcional: en la sede, actualizar el printer-agent a ≥ 2.0.0 si no lo está (las comandas del POS usan el formato de jobs pre-renderizados).

---

## Nota — Actualización ROS (UI) incluida en la misma rama

El commit de la actualización de UI del ROS (Design System) también toca el **Sync**: login y refresh devuelven `profile` (nombre, rol, local, sede) para el Header del POS. Se despliega con los mismos pasos 1–3 (no hay variables nuevas). Si el POS se publica antes que el Sync, el Header muestra valores genéricos ("Operador"), sin romper nada.

---

## Rollback

- **Vercel:** Deployments → el deploy anterior → *Promote to Production*. Restaurar `POS_CORS_ORIGIN` no hace falta (el código viejo con `"true"` estaba roto de todas formas).
- **EC2:** `git checkout <commit-anterior>` → rebuild de los paquetes y del Sync → `pm2 restart <proceso> --update-env`. `POS_PIN_PEPPER` puede quedar (el código viejo la ignora).
- La base no tiene migraciones destructivas: los campos nuevos (`posPayments`, `posPinLookup`, `orderMode`) son opcionales y el código viejo los ignora.
