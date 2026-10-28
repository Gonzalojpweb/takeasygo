---
modulo: audit
tipo: opcional
roles: [admin]
version_doc: "2026-10-27"
---
# Auditoría

## Qué es y para qué sirve
El módulo de auditoría registra todas las acciones importantes realizadas por los usuarios del negocio. Proporciona un historial inalterable de quién hizo qué, cuándo y desde dónde, para control de seguridad y trazabilidad.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Ver todo el historial de auditoría, filtrar por usuario, acción, fecha. | — |
| **manager** | — | Ver auditoría (solo admin). |
| **cashier** | — | Ver auditoría. |
| **waiter** | — | Ver auditoría. |

## Requisitos previos / cómo se activa
- **Plan mínimo**: `buy` (Crecimiento) o `full` (Premium).
- **Rol mínimo**: `admin`.
- Si el plan es `trial` o `try`, el módulo no está disponible.

## Paso a paso de las tareas principales

### Ver historial de auditoría (solo admin)
1. Ir a **Menú lateral → Auditoría**.
2. Filtrar por:
   - **Fecha**: rango de fechas.
   - **Usuario**: quién realizó la acción.
   - **Categoría**: authentication, authorization, fiscal, payment, security, system, pairing.
   - **Acción**: tipo específico de acción.
3. Ver detalle de cada registro:
   - Timestamp exacto.
   - Usuario.
   - Acción realizada.
   - IP de origen.
   - Detalles adicionales.

### Exportar auditoría (solo admin)
1. Ir a **Auditoría**.
2. Aplicar filtros deseados.
3. Clic en **"Exportar"**.
4. Descargar CSV/Excel.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Filtro por fecha** | Muestra registros en un rango específico. |
| **Filtro por usuario** | Filtra acciones de un usuario específico. |
| **Filtro por categoría** | Filtra por tipo: authentication, authorization, fiscal, payment, security, system, pairing. |
| **Filtro por acción** | Filtra por acción específica. |
| **Exportación** | Descarga de datos filtrados. |

## Reglas de negocio y límites

- **Plan buy/full**: Requerido.
- **Solo admin**: Único rol con acceso.
- **Registro automático**: Todas las acciones importantes se registran automáticamente.
- **Inalterable**: Los registros de auditoría no se pueden modificar ni eliminar.
- **Multi-tenant**: Solo se ven registros del propio negocio.

## Relación con otros módulos

- **users**: Cada acción de usuario genera registro.
- **orders**: Creación/modificación de órdenes se registra.
- **settings**: Cambios de configuración se registran.
- **payment**: Transacciones de pago se registran.
- **fiscal**: Emisión de comprobantes se registra.
- **pairing**: Emparejamiento de dispositivos se registra.

## Preguntas frecuentes

1. **¿Cómo veo quién modificó un producto?**
   → Auditoría → filtrar por "menu:modify" y fecha → ver usuario.

2. **¿Puedo ver quién canceló una orden?**
   → Sí, en Auditoría → filtrar por "order:cancel" → ver usuario y timestamp.

3. **¿Puedo exportar el historial de auditoría?**
   → Sí, como admin. Clic en "Exportar" y descargar.

4. **¿Cuánto tiempo se conserva la auditoría?**
   → No hay límite definido en el código. Se conserva indefinidamente.

5. **¿Puedo ver auditoría de otra sede?**
   → Sí, si tienes múltiples sedes, puedes filtrar por sede.

6. **¿Qué acciones se registran?**
   → Autenticación, autorización, fiscal, pagos, seguridad, sistema, pairing.

7. **¿Puedo ver la IP desde donde se hizo una acción?**
   → Sí, cada registro incluye IP de origen.

8. **¿Los managers pueden ver auditoría?**
   → No, solo admin.

9. **¿Puedo ver auditoría en plan trial?**
   → No, requiere plan buy/full.

10. **¿Cómo busco una acción específica?**
    → Usar filtros por fecha, usuario, categoría y acción.

## Errores y mensajes comuntos

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `Plan does not allow audit module` | Plan trial/try. | Actualizar plan a buy/full. |
| `Insufficient permissions` | Rol no admin. | Pedir al admin que vea auditoría. |
| `No audit records found` | Sin registros en filtros seleccionados. | Cambiar filtros. |
| `Export not available` | Rol manager intentando exportar. | Solo admin puede exportar. |

## Recomendaciones y buenas prácticas

- **Revisar auditoría regularmente**: Detectar acciones sospechosas.
- **Exportar respaldos mensuales**: Conservar copias de seguridad.
- **Usar filtros**: Buscar acciones específicas eficientemente.
- **Compartir hallazgos**: Discutir incidentes de seguridad.
- **Mantener roles actualizados**: Asegurar que solo personal autorizado tenga admin.

## Qué hacer si no funciona

Si la auditoría no carga, no muestra datos, o hay errores:
1. Verificar plan activo (buy/full).
2. Verificar que seas admin.
3. Verificar filtros seleccionados.
4. Verificar conexión a internet.
5. Si persiste, contactar soporte con: negocio, rol, plan, qué buscaba, mensaje de error exacto.

## Descripción breve para negocios que NO lo tienen activo

El módulo de auditoría registra todas las acciones importantes realizadas por los usuarios del negocio, proporcionando un historial inalterable de quién hizo qué y cuándo. Es esencial para control de seguridad y trazabilidad. Disponible desde plan Crecimiento (buy) o Premium (full), solo para rol admin.