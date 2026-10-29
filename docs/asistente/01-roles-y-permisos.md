# 01-roles-y-permisos.md — Matriz completa rol × módulo × acción

## Roles existentes

El sistema define los siguientes roles (fuente: `packages/types/src/index.ts` y `packages/business/src/authorization.ts`):

| Rol | Descripción |
|-----|-------------|
| `admin` | Administrador completo del negocio |
| `manager` | Gerente de operación |
| `cashier` | Cajero / operador de caja |
| `waiter` | Mozo / camarero |
| `kitchen` | Personal de cocina |

> **Nota:** El modelo de base de datos `packages/db/src/models/user.ts` usa additionally: `superadmin`, `staff`, `consumer`, `seller`. Pero los roles con permisos definidos en la matriz son los 5 arriba. El rol `superadmin` hereda todos los permisos. El rol `staff` no tiene permisos propios en la matriz actual. Los roles `consumer` y `seller` son para clientes externos y no acceden al panel admin.

## Matriz rol × módulo × acción

Las siguientes acciones están definidas en `packages/business/src/authorization.ts` (`PERMISSIONS`):

| Permiso | admin | manager | cashier | waiter | kitchen |
|---------|-------|---------|---------|--------|---------|
| `order:create` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `order:modify` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `order:cancel` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `order:view_all` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `payment:process` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `payment:refund` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `cash_register:open` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `cash_register:close` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `table:assign` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `table:merge_split` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `fiscal:emit` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `fiscal:configure` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `user:manage` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `device:pair` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `device:blacklist` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `reports:view` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `menu:modify` | ✅ | ✅ | ❌ | ❌ | ❌ |

### Qué NO puede hacer cada rol (y qué debe hacer en su lugar)

| Rol | Restricción | Qué hacer en su lugar |
|-----|-------------|----------------------|
| `cashier` | No puede gestionar usuarios (`user:manage`). | Pídelo a un administrador. |
| `cashier` | No puede procesar reembolsos (`payment:refund`). | Solo puede procesar pagos normales; para reembolsos, pídale a un administrador o gerente. |
| `cashier` | No puede configurar fiscal (`fiscal:configure`). | Solo puede emitir comprobantes si tiene el permiso correspondiente; configuración es exclusiva de admin. |
| `waiter` | No puede cancelar órdenes (`order:cancel`) ni procesar pagos (`payment:process`). | Puede crear, modificar, ver todas las órdenes (`order:create`, `order:modify`, `order:view_all`) y asignar mesas (`table:assign`). Para cancelar, pídelo a un cajero, gerente o admin. |
| `waiter` | No puede cerrar caja (`cash_register:close`). | El gerente o administrador debe cerrar la caja. |
| `kitchen` | No puede crear/ modificar ni cancelar órdenes. | Puede ver todas las órdenes (`order:view_all`) para preparar los platos. |
| `cashier` | No puede emparejar dispositivos (`device:pair`). | Pídalo a un administrador o gerente. |
| `cashier` | No puede dar de baja dispositivos (`device:blacklist`). | Solo el admin puedeblacklist un dispositivo. |

### Restricciones por negocio (multi-tenant)

- Cada negocio (tenant) solo ve sus propios datos. El filtrado por `tenantId` se aplica automáticamente en todas las rutas API (middleware `tenantMiddleware` en `apps/sync/src/middleware/tenant.ts`).
- El rol del usuario se valida vía JWT en cada petición (middleware `authMiddleware`).
- Un usuario solo puede operar dentro de los negocios (sedes) que le sean asignados. Si el usuario tiene `auth.locationId`, solo verá datos de esa sede; si no tiene `locationId`, es single-sede (legacy) y verá todo dentro de su tenant.
- Los permisos se verifican individualmente con `canPerformAction(role, permission)` — no se heredan automáticamente los permisos de un rol superior, cada acción debe estar explícitamente permitida.

### Módulos opcionales por plan

Módulos que requieren un plan mínimo para activarse (fuente: `packages/business/src/plans.ts` `PLAN_ACCESS`):

| Módulo | Plan mínimo | Roles que pueden usarlo (generalmente todos los del negocio con el plan activo) |
|--------|-------------|-------------------------------|
| `reports` | `buy` | admin, manager |
| `users` | `buy` | admin solo |
| `audit` | `buy` | admin |
| `multiLocation` | `buy` | admin, manager |
| `multiPrinter` | `buy` | admin, manager |
| `ico` | `buy` (simplificado) / `full` (avanzado) | admin, manager |
| `analyticsAdv` | `full` | admin |
| `icoAdvanced` | `full` | admin |
| `store` | `full` | admin |
| `sos` | `buy` | admin, manager |
| `inventory` | `buy` | admin, manager |
| `business` | `buy` | admin |
| `loyaltyExport` | `buy` | admin |
| `loyaltyAnalytics` | `full` | admin |
| `posIntegration` | `buy` | admin, manager |
| `cashPayment` | `full` | admin |
| `hiddenRewards` | `buy` | admin, manager |