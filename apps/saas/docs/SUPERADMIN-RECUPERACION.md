# Recuperación y protección del SuperAdmin

> Implementado en `dev` el 19/11/2026. Sin servicios nuevos ni costos: TOTP con `crypto` de Node,
> avisos por el SMTP existente, auditoría en la Mongo existente, script local.

## 1. Evaluación del informe (`superadmin.md`)

El informe es **fiable**: todas las afirmaciones se verificaron contra el código (archivos y líneas coinciden).

Correcciones y agregados:

| Punto | Informe | Realidad |
|---|---|---|
| `allowDangerousEmailAccountLinking` | Quitarlo | **Se mantiene**: quitarlo rompería el login con Google de consumidores que se registraron con email. El riesgo real (superadmin) queda cerrado bloqueando todo proveedor que no sea contraseña para ese rol. |
| Vías de "lockout" del dueño | No mencionadas | **Faltaban dos**: `PATCH /api/superadmin/users/[userId]` permitía degradar o desactivar a otro superadmin, y `PATCH .../reset-password` cambiar su contraseña. Una sesión robada podía dejar afuera al dueño. Corregido. |
| Proyección de organización | No mencionada | Un token de superadmin sin MFA se proyectaba a membresías de organización. Corregido (`superadmin_pending` no se proyecta). |
| SSO del POS (`ssoCode`) | No mencionado | No era explotable para superadmin (exige `tenantId` igual), pero se bloqueó explícitamente. |
| Proveedor Email | Lo llama "nodemailer" | En next-auth v5 el id es `email`; el bloqueo nuevo usa "todo lo que no sea `credentials`", así cubre ambos. |

## 2. Qué se implementó

| Capa | Estado | Dónde |
|---|---|---|
| **Fase 0** — Google / link por email bloqueados para superadmin | Hecho | `lib/auth.config.ts` (signIn + jwt) |
| Fase 0 — reset por email bloqueado para superadmin (avisa y audita) | Hecho | `app/api/auth/forgot-password`, `reset-password` |
| Fase 0 — whitelist de roles + auditoría al crear usuarios de un comercio | Hecho | `app/api/superadmin/tenants/[tenantId]/users` |
| Fase 0 — superadmin no se degrada / desactiva / cambia contraseña desde la web | Hecho (agregado) | `app/api/superadmin/users/[userId]/*` |
| **A** — MFA TOTP obligatorio + 10 códigos de recuperación hasheados, un solo uso | Hecho | `lib/totp.ts`, `lib/auth.ts`, `/superadmin/seguridad` |
| **D** — reautenticación (contraseña + código) para códigos y contraseña; avisos; auditoría | Hecho | `app/api/superadmin/security/*` |
| **G** — guardia estricta (base + MFA + `sessionsValidAfter`) en cualquier modo de `access.central` | Hecho | `lib/superadmin-guard.ts`, `lib/tenant-access.ts` |
| G — `sessionsValidAfter` al cambiar/resetear contraseña, activar MFA y "cerrar sesiones" | Hecho | rutas de seguridad y reset |
| G — rate-limit en forgot/reset y en acciones de seguridad | Hecho | idem |
| G — aviso por email en cada login de superadmin | Hecho | `lib/security-alerts.ts` |
| Auditoría de sistema (antes se descartaba todo lo de `tenantId: null`) | Hecho | `models/SystemAuditLog.ts`, `lib/audit.ts` |
| **C (parcial)** — segundo canal de avisos | Hecho, opcional | variable `SECURITY_ALERT_EMAIL` |
| **F** — script offline con `CONFIRMAR` y nombre de base | Hecho | `apps/saas/scripts/recovery/superadmin-recovery.mjs` |
| bcrypt unificado a costo 12 | Hecho | `models/User.ts` |
| **B** — reset con time-lock | No | No hace falta mientras no exista reset por email para superadmin (está bloqueado). |
| **E** — segundo SuperAdmin / break-glass | No (operativo) | Decisión tuya: crear una segunda cuenta con el script (acción 4), con email en otro dominio y MFA en otro celular. |

## 3. Cómo funciona ahora el acceso

1. `/login` con email + contraseña.
2. Si la cuenta tiene MFA: aparece el campo **Código de verificación** (6 dígitos de la app, o un código de recuperación `XXXXX-XXXXX`).
3. Si la cuenta **todavía no tiene MFA**: entra como `superadmin_pending` y solo ve `/superadmin/seguridad` para activarlo. Ninguna otra guardia acepta ese rol.
4. Al activar MFA se muestran los 10 códigos **una vez** y se cierran todas las sesiones: se vuelve a entrar con contraseña + código.

## 4. Primer uso después del deploy (importante)

- **La cuenta superadmin necesita contraseña.** Si hoy entrás solo con Google o con link de email, eso deja de funcionar. Antes del deploy, poné una contraseña con el script (acción 2) o comprobá que la que tenés funciona.
- Las sesiones abiertas de superadmin dejan de valer en el panel (no tienen MFA verificado): hay que volver a entrar.
- Configurar opcionalmente `SECURITY_ALERT_EMAIL` en Vercel (un email en **otro** proveedor/dominio que el de login).

## 5. Si perdés el acceso

| Situación | Qué hacer |
|---|---|
| Perdiste el celular, tenés códigos | Entrar con un código de recuperación; en Seguridad, generar códigos nuevos. Para cambiar de celular: script acción 1 y volver a activar MFA. |
| Perdiste celular y códigos | Script acción 1 (desactiva MFA) → entrar con contraseña → activar MFA. |
| Olvidaste la contraseña | Script acción 2. |
| Alguien tomó la cuenta | Script acción 5 sobre la cuenta tomada + acción 4 sobre una cuenta tuya; rotar `AUTH_SECRET` en Vercel (cierra todos los JWT). Revisar la auditoría. |

Uso del script (terminal interactiva, desde `apps/saas`):

```powershell
$env:MONGODB_URI = "<uri con el nombre de la base>"
node scripts/recovery/superadmin-recovery.mjs
```

Muestra host y base (avisa si es producción, base `test`), pide escribir `CONFIRMAR`, cierra las sesiones de la cuenta y deja registro en `systemauditlogs`. No imprime el URI ni secretos.

## 6. Límites conocidos

- Hay ~57 lugares que leen el rol del JWT directamente (páginas de comercio, etc.). Ahí el rol `superadmin` ya solo se obtiene con contraseña + MFA, pero la revocación inmediata aplica en el panel superadmin y en las APIs con `requireSuperAdmin`; en el resto el JWT vence a las 8 h. Para cortar todo al instante ante una toma: rotar `AUTH_SECRET`.
- Los avisos dependen del SMTP actual; si falla, el login sigue (se registra el error).
- El MFA de las cuentas de infraestructura (Google de la casilla, Vercel, GitHub, MongoDB Atlas, DNS, SMTP) **no se puede verificar desde el código**: revisarlo a mano. Con acceso a `MONGODB_URI` o `AUTH_SECRET`, cualquiera se salta todo lo anterior.
