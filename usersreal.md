# Superadmin — Gestión de Usuarios Reales (Consumers)

## Diagnóstico Actual

### Estado
- **User model** (`models/User.ts`) ya existe con field `role: 'consumer'`
- Los usuarios **se crean automáticamente** al registrarse con Google (NextAuth `signIn` callback en `lib/auth.config.ts`)
- **No existe** ninguna página o API en superadmin para listar/ver TODOS los usuarios registrados
- Solo existe `superadmin/tenants/[tenantId]/users` que lista usuarios internos de cada tenant (roles: admin, manager, staff, cashier, seller)
- El dashboard de superadmin muestra un contador de "total users" pero sin detalle

### Flujo actual de creación de usuarios
```
Google Sign-In
  → signIn callback en auth.config.ts
  → User.findOne({ email }) — busca si existe
  → NO existe → User.create({ name, email, image, role: 'consumer' })
  → Existe → actualiza image si cambió
```

### Relaciones actuales
- `User` → `LoyaltyMember` a través de `LoyaltyMember.userId`
- Un `User` puede ser miembro de múltiples tenants (un `LoyaltyMember` por tenant)
- Un `User` NO es automáticamente `LoyaltyMember` — se afilia vía checkout, QR, admin o import

## Lo Que Falta

| Feature | Estado |
|---------|--------|
| Listar todos los usuarios (consumers) en superadmin | ❌ No existe |
| Ver detalle de un usuario (datos personales, membresías, órdenes) | ❌ No existe |
| Buscar usuarios por nombre, email, teléfono | ❌ No existe |
| Ver a qué tenants está vinculado un usuario | ❌ No existe |
| API endpoint para listar usuarios con filtros | ❌ No existe |
| Página en superadmin para gestión de usuarios | ❌ No existe |

## Plan de Implementación

### Fase 1 — API Endpoint: `GET /api/superadmin/users`

**Archivo nuevo:** `app/api/superadmin/users/route.ts` (reemplazar el POST existente o crear uno separado)

```
GET /api/superadmin/users
  - Query params: page, limit, search, role, isActive, tenantId
  - Autenticación: superadmin (requireAuth con role check)
  - Respuesta: { users: User[], pagination: { page, limit, total, pages } }
  - Filtros:
    - search → regex sobre name, email
    - role → filtrar por rol específico (default: todos)
    - isActive → filtrar por estado
    - tenantId → filtrar por tenant asignado
  - Excluir: superadmins de la lista (no se muestran a sí mismos)
  - No exponer: resetToken, resetTokenExpiry, password
```

**Campos a incluir en la respuesta:**
- `_id`, `name`, `email`, `image`, `role`, `isActive`
- `createdAt` (fecha de registro)
- `tenantCount` → cuántos tenants tiene como LoyaltyMember (join agregado o count)
- `lastLoginAt` → del token JWT o audit log (si está disponible)
- `provider` → "google" o "credentials" (deducido de si tiene password)

### Fase 2 — Página Superadmin: `/superadmin/usuarios`

**Archivo nuevo:** `app/superadmin/usuarios/page.tsx`
**Componente nuevo:** `components/superadmin/UsersList.tsx`

**Diseño sugerido:**

```
+------------------------------------------------------------------+
|  Usuarios Registrados          [Buscar...]  [Filtrar por rol]     |
+------------------------------------------------------------------+
|  Total: 1,234 usuarios | 1,100 activos | 134 inactivos           |
+------------------------------------------------------------------+
|  Avatar | Nombre    | Email              | Rol       | Miembro  |
|         |           |                    |           | desde    |
+------------------------------------------------------------------+
|  [img]  | Juan P.   | juan@email.com    | consumer  | 15/01/26 |
|  [img]  | María G.  | maria@email.com   | consumer  | 12/01/26 |
|  ...    |           |                    |           |          |
+------------------------------------------------------------------+
|  Páginas: < 1 2 3 ... 10 >                                       |
+------------------------------------------------------------------+
```

**Funcionalidades:**
- Listado paginado (15 por página)
- Búsqueda por nombre o email
- Filtro por rol (consumer, admin, seller, etc.)
- Filtro por estado (activo/inactivo)
- Click en fila → modal con detalle del usuario
- Botón para desactivar/activar usuario
- Ver membresías (a qué tenants está afiliado como LoyaltyMember)

### Fase 3 — Detalle de Usuario (Modal o Página)

**Modal de detalle** (o página dedicada `/superadmin/usuarios/[userId]`):

```
+----------------------------------------------------------+
|  [Avatar]  Juan Pérez                                     |
|  juan@email.com                                           |
|  Registrado: 15/01/2026 · Último acceso: 14/05/2026      |
|  Estado: ✅ Activo                                        |
+----------------------------------------------------------+
|  Membresías Club (tenants donde es LoyaltyMember):        |
|  • Pizzaland — 150 pts · Nivel Bronze                     |
|  • SushiGO — 320 pts · Nivel Silver                       |
|  • Café Martínez — 0 pts · Nivel None                     |
+----------------------------------------------------------+
|  Órdenes realizadas: 12                                   |
|  Gasto total: $45,600                                     |
+----------------------------------------------------------+
|  [Desactivar usuario]  [Cambiar rol]                      |
+----------------------------------------------------------+
```

**API de detalle:** `GET /api/superadmin/users/[userId]`
- Devuelve datos del usuario + sus LoyaltyMemberships (con datos de cada tenant)
- Stats agregados: total órdenes, gasto total

### Fase 4 — Vincular User ↔ LoyaltyMember existentes

Muchos `LoyaltyMember` pueden no tener `userId` vinculado (los creados antes de esta feature o por checkout sin auth). Se necesita un script one-time:

```
POST /api/superadmin/users/link-members
  - Busca LoyaltyMembers sin userId
  - Busca User por email (si existe)
  - Si encuentra match, asigna userId al LoyaltyMember
```

## API Routes Summary

| Método | Ruta | Propósito |
|--------|------|-----------|
| `GET` | `/api/superadmin/users` | Listar usuarios (con filtros y paginación) |
| `GET` | `/api/superadmin/users/[userId]` | Detalle de usuario + membresías |
| `PATCH` | `/api/superadmin/users/[userId]` | Actualizar usuario (status, role) |
| `POST` | `/api/superadmin/users/link-members` | Vincular LoyaltyMembers sin userId |

## Archivos a Crear/Modificar

### Crear
| Archivo | Propósito |
|---------|-----------|
| `app/api/superadmin/users/route.ts` | API listar usuarios GET + crear POST |
| `app/api/superadmin/users/[userId]/route.ts` | API detalle/actualizar usuario |
| `app/api/superadmin/users/link-members/route.ts` | Script vinculación |
| `app/superadmin/usuarios/page.tsx` | Página de gestión de usuarios |
| `components/superadmin/UsersList.tsx` | Componente de listado |
| `components/superadmin/UserDetailModal.tsx` | Modal de detalle |

### Modificar
| Archivo | Cambio |
|---------|--------|
| `components/superadmin/Sidebar.tsx` | Agregar link a "Usuarios" en navegación |
| `app/superadmin/layout.tsx` | Si es necesario |

## Notas Técnicas

- **User.password** es `select: false` por defecto en el schema → no se expone
- **User.resetToken/resetTokenExpiry** son `select: false` → no se exponen
- La relación `User` ↔ `LoyaltyMember` es: `LoyaltyMember.userId` → `User._id`
- Los `LoyaltyMember` se crean durante checkout (con o sin `userId` si el usuario está autenticado)
- El endpoint `/api/[tenant]/loyalty/me` ya vincula por email → muchos miembros antiguos pueden no tener `userId`
- Para el contador "usuarios registrados", usar `User.countDocuments({ role: 'consumer' })`
- La autenticación superadmin se verifica con `requireAuth` + comparación de rol
