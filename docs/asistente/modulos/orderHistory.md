---
modulo: orderHistory
tipo: siempre_activo
roles: [admin, manager, cashier, waiter]
version_doc: "2026-10-27"
---
# Historial de Órdenes

## Qué es y para qué sirve
El módulo de Historial de Órdenes permite consultar todas las órdenes pasadas con filtros avanzados por fecha, estado, método de pago, mesa, cliente y número de orden. Es esencial para resolver disputas, verificar cobros y analizar ventas históricas.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Ver todo el historial, filtrar, exportar, ver detalles completos. | — |
| **manager** | Ver todo el historial, filtrar, ver detalles completos. | Exportar datos masivos. |
| **cashier** | Ver historial de órdenes, filtrar, ver detalles. | Exportar datos masivos. |
| **waiter** | Ver historial de órdenes, filtrar por mesa. | Ver datos financieros sensibles. |
| **kitchen** | Ver historial de órdenes (para referencia). | Ver datos financieros sensibles. |

## Requisitos previos / cómo se activa
No requiere activación. Siempre activo en planes `trial`, `try`, `buy`, `full`. Bloqueado en plan `anfitrion`.

## Paso a paso de las tareas principales

### Ver historial de órdenes (todos los roles)
1. Ir a **Menú lateral → Órdenes → Historial**.
2. Ver listado de órdenes ordenado por fecha (más reciente primero).
3. Filtrar por:
   - **Fecha**: hoy, ayer, semana, mes, rango personalizado.
   - **Estado**: pending, confirmed, preparing, ready, en_ruta, arrived, delivered, cancelled.
   - **Método de pago**: cash, mercadopago, posnet, transfer, kripton.
   - **Mesa**: número de mesa.
   - **Modo**: dine-in, takeaway, delivery, business.
   - **Número de orden**: búsqueda por ID.
   - **Cliente**: nombre del cliente.

### Ver detalle de una orden (todos los roles)
1. En Historial, clic en la orden deseada.
2. Ver:
   - Número de orden.
   - Fecha y hora.
   - Estado actual.
   - Productos con cantidades y precios.
   - Modificadores aplicados.
   - Notas especiales.
   - Método de pago.
   - Total (con/sin recargo).
   - Mesa (si dine-in).
   - Cliente (si tiene datos).

### Exportar historial (solo admin)
1. Ir a **Órdenes → Historial**.
2. Aplicar filtros deseados.
3. Clic en **"Exportar"**.
4. Seleccionar formato (CSV, Excel).
5. Descargar archivo.

### Buscar orden específica (todos los roles)
1. Ir a **Historial**.
2. En el campo de búsqueda, ingresar:
   - Número de orden.
   - Nombre de cliente.
   - Número de mesa.
3. Se muestran resultados coincidentes.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Rango de fechas** | Filtra por período específico. |
| **Estado** | Filtra por estado de la orden. |
| **Método de pago** | Filtra por forma de pago. |
| **Mesa** | Filtra por número de mesa. |
| **Modo** | Filtra por dine-in/takeaway/delivery/business. |
| **Número de orden** | Búsqueda por ID exacto. |
| **Cliente** | Búsqueda por nombre. |
| **Exportación** | Descarga de datos (solo admin). |

## Reglas de negocio y límites

- **Siempre activo**: Disponible en todos los planes (excepto anfitrion).
- **Todos los roles pueden ver**: Al menos sus propias órdenes o todas (según permiso `order:view_all`).
- **order:view_all**: admin, manager, cashier, waiter, kitchen pueden ver todas las órdenes.
- **Exportación**: Solo admin puede exportar.
- **Multi-tenant**: Solo órdenes del propio negocio.
- **Multi-sede**: Se pueden filtrar por sede si aplica.
- **Histórico completo**: No hay límite de tiempo definido.

## Relación con otros módulos

- **orders**: El historial es una vista de las órdenes pasadas.
- **reports**: Los reportes se basan en datos del historial.
- **cash-register**: El cierre Z utiliza datos del historial.
- **audit**: Complementa con registro de acciones.
- **ico**: El ICO analiza datos históricos de órdenes.

## Preguntas frecuentes

1. **¿Cómo veo las órdenes de la semana pasada?**
   → Órdenes → Historial → filtrar por fecha "Semana pasada" o rango personalizado.

2. **¿Puedo buscar una orden por número?**
   → Sí, en Historial, ingresar el número de orden en el campo de búsqueda.

3. **¿Cómo filtro por método de pago?**
   → Historial → filtro "Método de pago" → seleccionar (ej. efectivo).

4. **¿Los cajeros pueden exportar el historial?**
   → No, solo admin puede exportar. Los cajeros pueden ver y filtrar.

5. **¿Puedo ver todas las órdenes canceladas?**
   → Sí, filtrar por estado "cancelled".

6. **¿Cuánto tiempo se conserva el historial?**
   → No hay límite definido. Se conserva indefinidamente.

7. **¿Puedo ver quién atendió cada orden?**
   → En el detalle de la orden se muestra información del operador.

8. **¿Cómo veo el historial de una mesa específica?**
   → Historial → filtro "Mesa" → ingresar número de mesa.

9. **¿Puedo ver órdenes de varias sedes?**
   → Sí, si tienes múltiples sedes, puedes filtrar o ver consolidado.

10. **¿Qué pasa si borro una orden?**
    → Las órdenes no se borran del historial. Si se anulan, quedan como "cancelled".

## Errores y mensajes comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `No orders found` | Sin resultados con filtros aplicados. | Cambiar filtros o rango de fechas. |
| `Order not found` | Orden específica no existe. | Verificar número de orden. |
| `Export not allowed` | Rol no admin intentando exportar. | Pedir al admin que exporte. |
| `History not available` | Plan anfitrion. | El plan anfitrion no incluye pedidos. |
| `Invalid date range` | Rango de fechas inválido. | Seleccionar rango válido. |

## Recomendaciones y buenas prácticas

- **Revisar historial al final del día**: Verificar que todo esté correcto.
- **Usar filtros**: Búsquedas específicas son más rápidas que revisar todo.
- **Exportar respaldos**: Admin debe exportar periódicamente.
- **Verificar disputas**: Usar historial para resolver reclamos de clientes.
- **Anular en vez de borrar**: Las órdenes canceladas se conservan para auditoría.

## Qué hacer si no funciona

Si el historial no carga, no muestra órdenes, o hay errores:
1. Verificar plan activo (excepto anfitrion).
2. Verificar conexión a internet.
3. Verificar filtros seleccionados (rango de fechas, estado).
4. Recargar la página.
5. Si persiste, contactar soporte con: negocio, rol, qué buscaba, filtros usados, mensaje de error exacto.

## Descripción breve para negocios que NO lo tienen activo

El módulo de Historial de Órdenes permite consultar todas las órdenes pasadas con filtros por fecha, estado, método de pago, mesa y cliente. Es esencial para resolver disputas y analizar ventas. Disponible en todos los planes excepto anfitrion.