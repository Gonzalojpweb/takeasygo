---
modulo: users
tipo: opcional
roles: [admin]
version_doc: "2026-10-27"
---
# Usuarios

## Qué es y para qué sirve
El módulo de usuarios permite al administrador crear, editar, activar/desactivar y gestionar los usuarios del negocio. Cada usuario tiene un rol que define sus permisos en la plataforma.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Crear, editar, activar/desactivar usuarios, asignar roles, restablecer PINs. | — |
| **manager** | — | Gestionar usuarios (solo admin). |
| **cashier** | — | Gestionar usuarios. |
| **waiter** | — | Gestionar usuarios. |

## Requisitos previos / cómo se activa
- **Plan mínimo**: `buy` (Crecimiento) o `full` (Premium).
- **Rol mínimo**: `admin`.
- Si el plan es `trial` o `try`, el módulo no está disponible.

## Paso a paso de las tareas principales

### Crear un usuario nuevo (solo admin)
1. Ir a **Menú lateral → Usuarios**.
2. Clic en **"+ Nuevo usuario"**.
3. Completar campos:
   - **Nombre completo**: ej. "Juan Pérez".
   - **Email**: debe ser único en el sistema.
   - **Rol**: seleccionar de la lista (admin, manager, cashier, waiter, kitchen).
   - **PIN** (opcional): 4-8 dígitos para login en POS.
4. Clic en **"Guardar"**.
5. El sistema envía email de bienvenida con credenciales.

### Editar un usuario existente (solo admin)
1. Ir a **Usuarios**.
2. Buscar el usuario.
3. Clic en **"Editar"**.
4. Modificar campos necesarios:
   - Cambiar nombre.
   - Cambiar email.
   - Cambiar rol.
   - Cambiar estado (activo/inactivo).
5. Clic en **"Guardar"**.

### Desactivar un usuario (solo admin)
1. Ir a **Usuarios**.
2. Buscar el usuario.
3. Clic en **"Desactivar"**.
4. Confirmar acción.
5. El usuario no podrá hacer login hasta reactivarse.

### Restablecer PIN de usuario (solo admin)
1. Ir a **Usuarios**.
2. Buscar el usuario.
3. Clic en **"Restablecer PIN"**.
4. Ingresar nuevo PIN (4-8 dígitos).
5. Clic en **"Guardar"**.
6. Comunicar nuevo PIN al usuario por canal seguro.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Nombre completo** | Nombre visible del usuario en la plataforma. |
| **Email** | Identificador único para login por email. |
| **Rol** | Define permisos: admin, manager, cashier, waiter, kitchen. |
| **PIN** | Código numérico para login rápido en POS (4-8 dígitos). |
| **Estado** | Activo o inactivo. Solo activos pueden hacer login. |
| **Tenant** | Negocio al que pertenece el usuario (multi-tenant). |

## Reglas de negocio y límites

- **Plan buy/full**: Requerido para gestionar usuarios.
- **Solo admin**: Único rol que puede crear/editar/desactivar usuarios.
- **Email único**: No se pueden crear dos usuarios con el mismo email.
- **PIN único por tenant**: El sistema usa HMAC para garantizar unicidad.
- **Roles válidos**: admin, manager, cashier, waiter, kitchen.
- **Multi-tenant**: Los usuarios solo pertenecen a un negocio.
- **Usuario inactivo**: No puede hacer login pero conserva historial.
- **Último admin**: El sistema previene desactivar al último admin activo.

## Relación con otros módulos

- **settings**: Los usuarios acceden a configuración según rol.
- **orders**: Los usuarios crean/gestionan órdenes según permisos.
- **audit**: Cada acción de usuario genera registro de auditoría.
- **cash-register**: Los usuarios abren/cierran caja según permisos.
- **posIntegration**: Los usuarios se autentican en POS con PIN.

## Preguntas frecuentes

1. **¿Cómo agrego un cajero nuevo al sistema?**
   → Usuarios → "+ Nuevo usuario" → nombre, email, rol "cashier", PIN opcional → Guardar.

2. **¿Puedo cambiar el rol de un usuario?**
   → Sí, en Usuarios → Editar → cambiar rol → Guardar.

3. **¿Cómo desactivo a un empleado que se fue?**
   → Usuarios → buscar → "Desactivar". No podrá hacer login.

4. **¿Se puede tener más de un admin?**
   → Sí, puedes crear múltiples usuarios con rol "admin".

5. **¿Cómo le doy acceso a un manager?**
   → Crear usuario con rol "manager". Tendrá permisos de gestión pero no de configuración avanzada.

6. **¿Qué hago si un empleado olvidó su PIN?**
   → Administrador → Usuarios → buscar → "Restablecer PIN" → nuevo PIN → guardar.

7. **¿Puedo ver qué acciones hizo un usuario?**
   → En módulo Auditoría (requiere plan buy/full) puedes ver el historial de acciones.

8. **¿Cuántos usuarios puedo tener?**
   → No hay límite técnico definido en el código. Depende del plan.

9. **¿Puedo crear un usuario sin email?**
   → No, el email es obligatorio y debe ser único.

10. **¿Qué pasa si desactivo al último admin?**
    → El sistema lo previene. Debe haber siempre al menos un admin activo.

## Errores y mensajes comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `Email already exists` | Email ya registrado. | Usar email diferente. |
| `Insufficient permissions for user:manage` | Rol no admin. | Pedir al admin que gestione usuarios. |
| `Cannot deactivate last admin` | Intento de desactivar último admin. | Mantener al menos un admin activo. |
| `Invalid role` | Rol no válido. | Seleccionar de la lista: admin, manager, cashier, waiter, kitchen. |
| `PIN must be 4-8 digits` | PIN fuera de rango. | Ingresar PIN de 4 a 8 dígitos. |
| `Plan does not allow users module` | Plan trial/try. | Actualizar plan a buy/full. |

## Recomendaciones y buenas prácticas

- **Asignar roles correctamente**: Cada empleado debe tener el rol mínimo necesario.
- **Usar PINs para POS**: Facilita login rápido en caja.
- **Desactivar usuarios que se van**: Inmediatamente al dar de baja.
- **No compartir credenciales**: Cada usuario debe tener sus propias.
- **Revisar permisos mensualmente**: Asegurar que roles sigan siendo correctos.
- **Mantener al menos 2 admins**: Evitar dependencia de un solo administrador.

## Qué hacer si no funciona

Si no puedes crear/editar usuarios o hay errores:
1. Verificar plan activo (buy/full).
2. Verificar que seas admin.
3. Verificar email único.
4. Verificar conexión a internet.
5. Si persiste, contactar soporte con: negocio, rol, qué intentó hacer, mensaje de error exacto.

## Descripción breve para negocios que NO lo tienen activo

El módulo de usuarios permite al administrador crear y gestionar los empleados del negocio, asignándoles roles (admin, manager, cashier, waiter, kitchen) que definen sus permisos en la plataforma. Es esencial para control de acceso. Disponible desde plan Crecimiento (buy) o Premium (full).