# Funcionalidad de Pausar/Reactivar Tenants

## Resumen

Se implementó una funcionalidad completa para pausar tenants temporalmente en lugar de eliminarlos definitivamente. Esto permite preservar toda la información (menús, pedidos históricos, configuración) para posibles reactivaciones futuras.

## Estados del Tenant

### Estados Disponibles
- `active`: Funciona normalmente, recibe pedidos, visible en explore
- `paused`: No recibe pedidos nuevos, no visible en explore, admin ve página especial
- `deleted`: Eliminado definitivamente

### Transiciones
- `active` ↔ `paused`: Permitidas con APIs específicas
- Cualquier estado → `deleted`: Solo eliminación definitiva
- `deleted` → cualquier estado: No permitida (requiere recrear)

## Modelo de Datos

### Cambios en `models/Tenant.ts`

```typescript
interface ITenant {
  // ... campos existentes
  status: 'active' | 'paused' | 'deleted'
  pausedAt?: Date | null
  pausedReason?: string
  // isActive sigue existiendo por compatibilidad
}
```

### Schema Updates
- Campo `status` con valores enum
- Campo `pausedAt` para timestamp de pausa
- Campo `pausedReason` para auditoría
- Virtual `computedIsActive` para compatibilidad

## APIs Implementadas

### POST `/api/superadmin/tenants/[tenantId]/pause`
Pausa un tenant activamente.

**Request:**
```json
{
  "reason": "Demo expirado - esperando decisión del cliente"
}
```

**Validaciones:**
- Tenant debe existir y estar `active`
- Razón obligatoria y no vacía
- Solo superadmin autorizado

### POST `/api/superadmin/tenants/[tenantId]/resume`
Reactiva un tenant pausado.

**Validaciones:**
- Tenant debe existir y estar `paused`
- Solo superadmin autorizado

### Auditoría
Todas las acciones de pause/resume se loguean en `AuditLog` con:
- `tenant.paused`
- `tenant.resumed`

## Comportamiento por Estado

### Estado `active`
- ✅ Recibe pedidos nuevos
- ✅ Visible en explore
- ✅ Admin accede normalmente al panel
- ✅ Todas las funcionalidades disponibles

### Estado `paused`
- ❌ No recibe pedidos nuevos (error 503)
- ❌ No visible en explore
- ❌ Admin ve página especial de "cuenta pausada"
- ✅ Pedidos existentes siguen accesibles para tracking
- ✅ Datos preservados completamente

### Estado `deleted`
- ❌ Eliminado definitivamente
- ❌ No accesible de ninguna forma

## Cambios en Queries

### Endpoints Actualizados
Se cambió `isActive: true` por `status: { $in: ['active', 'paused'] }` en:

#### Admin Endpoints
- `/api/[tenant]/orders` - Crear/listar pedidos
- `/api/[tenant]/orders/history` - Historial de pedidos
- `/api/[tenant]/orders/[orderId]/track` - Tracking público

#### Explore Endpoints
- `/api/explore/restaurant/[id]` - Detalles de restaurante
- `/api/explore/nearby` - Búsqueda de restaurantes

### Validación de Pedidos
En `/api/[tenant]/orders` (POST):
```typescript
if (tenant.status !== 'active') {
  return NextResponse.json({
    error: 'Este restaurante no está aceptando pedidos en este momento'
  }, { status: 503 })
}
```

## UI de Superadmin

### Vista de Tenants
- **Badge de estado**: Activo/Pausado/Eliminado con colores
- **Filtros**: Nuevo filtro por estado (activo/pausado/eliminado)
- **Botones de acción**:
  - 🔄 Pausar (solo para activos)
  - ▶️ Reactivar (solo para pausados)

### Modal de Pausa
- Campo obligatorio: "Razón para pausar"
- Confirmación: "El tenant seguirá siendo visible para admin pero no podrá recibir pedidos"

## Página Especial para Admin de Tenant Pausado

### Ubicación
`app/[tenant]/paused/page.tsx`

### Características
- Página dedicada que reemplaza el panel admin
- Mensaje claro: "Tu cuenta está temporalmente pausada"
- Botones de WhatsApp para contacto:
  - Soporte: +5491160019734
  - Comercial: +5491138795976
- Diseño profesional y responsivo
- Bloqueo de navegación (evita volver atrás)

### Redirección Automática
En `app/[tenant]/layout.tsx`:
```typescript
if (tenant.status === 'paused') {
  redirect(`/${tenantSlug}/paused`)
}
```

## Migración de Datos

### Script de Migración
`lib/migrations/migrate-tenant-status.ts`

Ejecutar una sola vez para actualizar tenants existentes:
```bash
npx ts-node lib/migrations/migrate-tenant-status.ts
```

### Cambios Aplicados
- Tenants existentes: `status = 'active'`
- Mantiene `isActive = true` por compatibilidad

## Seguridad

### Autorización
- Solo superadmin puede pausar/reactivar
- Validación de estado antes de operaciones

### Auditoría
- Logs detallados de cambios de estado
- Incluye razón de pausa y timestamps

## Testing

### Casos a Probar
1. **Flujo de pausa**:
   - Pausar tenant activo → debe mostrar página especial
   - Intentar crear pedido → debe fallar con 503

2. **Flujo de reactivación**:
   - Reactivar tenant pausado → debe volver al panel normal
   - Crear pedido → debe funcionar

3. **Explore**:
   - Tenant pausado no aparece en búsqueda
   - Tenant activo sí aparece

4. **Admin**:
   - Filtros funcionan correctamente
   - Badges muestran estados correctos

## Riesgos y Mitigaciones

### Queries Rotas
- **Riesgo**: Olvidar actualizar algún `isActive: true`
- **Mitigación**: Buscar todos los usos y actualizar sistemáticamente

### Tenants Pausados Recibiendo Pedidos
- **Riesgo**: Webhooks o endpoints sin validar estado
- **Mitigación**: Validación explícita en creación de pedidos

### Complejidad en UI
- **Riesgo**: Confusión entre estados
- **Mitigación**: Colores y labels claros, documentación

## Beneficios

- ✅ **Recuperación rápida**: Reactivar tenant preserva toda configuración
- ✅ **Mejor experiencia de demos**: Pausar en lugar de eliminar
- ✅ **Reducción de tiempo de setup**: No recargar datos al reactivar
- ✅ **Preservación de datos**: Historial de pedidos y métricas intactos

## Checklist de Implementación

- [x] Modificar modelo Tenant.ts
- [x] Crear APIs pause/resume
- [x] Actualizar queries críticas
- [x] Crear página especial para admin pausado
- [x] Actualizar UI de superadmin
- [x] Validación en creación de pedidos
- [x] Script de migración
- [x] Documentación completa

## Próximos Pasos

1. Ejecutar migración en producción
2. Probar flujos completos
3. Monitorear logs de auditoría
4. Actualizar documentación de usuario si es necesario

---

*Implementado: Abril 2026*
*Versión: 1.0*