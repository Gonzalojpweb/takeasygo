# QuickAccess SSO — Review para Sirius

**Fecha:** 2026-07-17  
**Estado:** Listo para review  
**Autor:** Fred (via opencode)

---

## Resumen

Implementación completa del sistema QuickAccess SSO que permite a usuarios del POS abrir módulos del SaaS (Analytics, ICO, TIA, CIS, CRM) en nueva pestaña con autenticación automática via token de uso único.

---

## Cambios Realizados

### 1. Fix Crítico: Eliminar fallback `/admin` (BUG REAL)

**Archivo:** `apps/saas/app/api/auth/sso/route.ts`

**Problema:** El fallback `|| '/admin'` causaba que TODOS los roles (incluido admin) fueran rechazados cuando `callbackUrl` estaba vacío.

**Solución:** Rechazar request si `callbackUrl` no está presente:
```ts
if (!token || !jti || !callbackUrl) {
  return redirectToLogin(req, 'sso_invalid_params')
}
```

**También eliminado:** El mismo fallback en `sso-callback/page.tsx` línea 14.

---

### 2. Fix Crítico: Server-Side Role Guard (SEGURIDAD)

**Archivo:** `apps/saas/app/api/auth/sso/route.ts`

**Problema:** El filtro de roles era solo client-side en `QuickAccessPanel.tsx`. Un usuario con token válido de `waiter` podía abrir `/analytics` directamente.

**Solución:** Guard server-side que valida:
1. `tenantId` del token coincide con el usuario en DB
2. `role` del POS tiene permiso para la `callbackUrl` solicitada

```ts
const ROLE_ALLOWED_ROUTES: Record<string, string[]> = {
  admin:    ['/analytics', '/ico', '/tia', '/cis', '/crm'],
  manager:  ['/analytics', '/ico', '/tia', '/cis', '/crm'],
  cashier:  ['/crm'],
  waiter:   [],
}
```

**Errores nuevos:**
- `sso_forbidden_route` — rol no tiene permiso para esa ruta
- `sso_forbidden_tenant` — tenantId no coincide

---

### 3. Cookie `pos_origin` (SaaS)

**Archivo:** `apps/saas/app/api/auth/sso/route.ts`

**Cambio:** Al redirigir al SSO callback, se setea cookie:
```ts
response.cookies.set('pos_origin', 'true', {
  httpOnly: true,
  sameSite: 'lax',
  maxAge: 28800, // 8 hours
  path: '/',
})
```

**Propósito:** Indicar al SaaS que la sesión vino del POS, para mostrar la barra "← Volver al POS".

---

### 4. PosReturnBar (SaaS)

**Archivos nuevos:**
- `apps/saas/components/PosReturnBar.tsx` — Client Component
- `apps/saas/components/PosReturnBarWrapper.tsx` — Server Component que lee cookie

**Comportamiento:**
- Barra fija arriba con "Accedido desde el POS" + botón "← Volver al POS"
- Click en botón: `window.opener.focus()` + `window.close()`
- Si no hay opener: `window.history.back()`
- Solo se muestra si cookie `pos_origin` existe

**Integración:** Se agrega al layout admin en `apps/saas/app/[tenant]/admin/layout.tsx`

---

### 5. QuickAccessPanel (POS)

**Archivo nuevo:** `apps/pos/src/components/shared/QuickAccessPanel.tsx`

**Características:**
- Panel flotante que aparece al click en "⚡ Accesos" en Navigation
- Filtra links según rol POS (decodificado del JWT)
- Popup síncrono: `window.open('', '_blank')` + `newTab.location.href =` post-await
- Toast de error si falla o popup bloqueado
- Muestra rol POS en footer

**Roles → Links:**
| Rol | Links permitidos |
|-----|------------------|
| admin | Analytics, ICO, TIA, CIS, CRM |
| manager | Analytics, ICO, TIA, CIS, CRM |
| cashier | CRM |
| waiter | *(ninguno — panel vacío)* |

---

### 6. Integración POS

**Archivos modificados:**
- `apps/pos/src/App.tsx` — Estado `showQuickAccess`, pasa props a AppShell
- `apps/pos/src/components/layout/Navigation.tsx` — Botón "⚡ Accesos" reemplaza "🔗 Ir al SaaS"
- `apps/pos/src/styles/pos.css` — Estilos para `.quick-access-panel`

---

## Flow Completo

```
POS                         Sync API                    SaaS
 │                              │                         │
 │ 1. Click "Accesos"           │                         │
 │    → QuickAccessPanel abre    │                         │
 │                              │                         │
 │ 2. Click link (ej: Analytics)│                         │
 │    → window.open('', '_blank')│                         │
 │                              │                         │
 │ 3. POST /api/v1/auth/sso-token                        │
 │    (JWT del usuario)          │                         │
 │                              │                         │
 │    ← { ssoToken, jti }       │                         │
 │                              │                         │
 │ 4. newTab.location.href =    │                         │
 │    /api/auth/sso?token=...&jti=...&callbackUrl=/analytics
 │                              │                         │
 │                              │ 5. verifyJwt(token)     │
 │                              │ 6. validar tenantId     │
 │                              │ 7. validar role vs route │
 │                              │ 8. Redis: consumed flag │
 │                              │ 9. Set-Cookie pos_origin│
 │                              │                         │
 │                              │ 10. Redirect → /sso-callback?code=...
 │                              │                         │
 │                              │     11. signIn('credentials', { ssoCode })
 │                              │     12. crear sesión NextAuth
 │                              │     13. redirect a /analytics
 │                              │                         │
 │                              │     14. PosReturnBar aparece (cookie detected)
 │                              │     15. Click "← Volver al POS"
 │                              │     16. window.opener.focus() + window.close()
```

---

## Seguridad

### Protecciones implementadas:
1. **Token de uso único:** Redis flag `consumed: false` → se borra después de usar
2. **TTL 60 segundos:** Token expira rápido
3. **Tenant validation:** `user.tenantId === payload.tenantId`
4. **Role validation:** Server-side check de `ROLE_ALLOWED_ROUTES`
5. **Cookie httpOnly:** No accesible desde JS del SaaS
6. **SameSite lax:** Previene CSRF en navegación cross-origin
7. **Popup síncrono:** `window.open()` en click handler (no post-await)
8. **Role filter UI:** Filtro client-side como capa adicional (cosmético, no seguridad)

### Respuesta a preguntas de ingeniería:

**Pregunta 2 (Server-side guard):** ✅ Implementado. Ver punto 2 arriba.

**Pregunta 3 (Post-hop navigation):** El rol en la sesión del SaaS viene de la DB (`user.role`), no del JWT del POS. Después del hop inicial, la navegación usa el rol real de la cuenta. El guard server-side solo protege el hop inicial.

**Pregunta 1 (Mapeo de roles):** Confirmado. Waiter sin acceso gerencial, cashier solo CRM.

---

## Testing Checklist

| # | Escenario | Esperado |
|---|-----------|----------|
| 1 | Admin click "Accesos" → ve 5 links | Panel muestra Analytics, ICO, TIA, CIS, CRM |
| 2 | Cashier click "Accesos" → ve 1 link | Panel muestra solo CRM |
| 3 | Waiter click "Accesos" → panel vacío | Mensaje "Sin accesos gerenciales" o panel no aparece |
| 4 | Click Analytics → popup abre | Nueva pestaña con SaaS autenticado |
| 5 | Popup bloqueado por browser | Toast "Popup bloqueado — permití ventanas emergentes" |
| 6 | Token expira (60s) → click link | Toast "Error generando acceso SSO" |
| 7 | Tenant A token → SaaS Tenant B | Redirect error `sso_forbidden_tenant` |
| 8 | Waiter con token válido → URL /analytics directa | **Server-side guard bloquea** → redirect `sso_forbidden_route` |
| 9 | Cookie `pos_origin` set en redirect | Layout la lee, muestra barra |
| 10 | Click "← Volver al POS" | `window.opener.focus()` + `window.close()` |
| 11 | Navegación post-hop en SaaS | Usa rol real de DB, no rol POS |

---

## Archivos Touchados

### POS (`apps/pos/`)
- `src/App.tsx` — Agregado estado `showQuickAccess`
- `src/components/layout/Navigation.tsx` — Botón "⚡ Accesos"
- `src/components/shared/QuickAccessPanel.tsx` — **NUEVO**
- `src/styles/pos.css` — Estilos QuickAccessPanel

### Sync API (`apps/sync/`)
- `src/routes/sso.ts` — Sin cambios (ya tenía role en JWT)

### SaaS (`apps/saas/`)
- `app/api/auth/sso/route.ts` — Fix fallback + role guard + cookie
- `app/sso-callback/page.tsx` — Fix fallback
- `app/[tenant]/admin/layout.tsx` — Agregado PosReturnBarWrapper
- `components/PosReturnBar.tsx` — **NUEVO**
- `components/PosReturnBarWrapper.tsx` — **NUEVO**

---

## Pendiente para Fase 2

- [ ] Integrar QuickAccessPanel con CustomerSearch del POS (no requiere salir al SaaS)
- [ ] Evaluar si waiter necesita acceso puntual a CIS en futuro
- [ ] Considerar middleware de SaaS para role guards (actualmente es por-layout)
