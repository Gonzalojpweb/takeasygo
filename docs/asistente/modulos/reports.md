---
modulo: reports
tipo: opcional
roles: [admin, manager]
version_doc: "2026-10-27"
---
# Reportes

## Qué es y para qué sirve
El módulo de reportes proporciona análisis de ventas, rendimiento y métricas del negocio. Permite visualizar datos históricos, comparativas mensuales, exportar información y tomar decisiones basadas en datos reales.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Ver todos los reportes, exportar datos, configurar métricas. | — |
| **manager** | Ver reportes de ventas, rendimiento, métodos de pago. | Exportar datos completos (solo admin). |
| **cashier** | — | Ver reportes (requiere plan buy/full y rol admin/manager). |
| **waiter** | — | Ver reportes. |
| **kitchen** | — | Ver reportes. |

## Requisitos previos / cómo se activa
- **Plan mínimo**: `buy` (Crecimiento) o `full` (Premium).
- **Rol mínimo**: `admin` o `manager`.
- Si el plan es `trial` o `try`, el módulo no está disponible. Se muestra mensaje: "Reportes disponibles desde plan Crecimiento".

## Paso a paso de las tareas principales

### Ver reporte de ventas del día (admin/manager)
1. Ir a **Menú lateral → Reportes → Ventas**.
2. Seleccionar rango de fechas (hoy, ayer, semana, mes, personalizado).
3. El sistema muestra:
   - Total de ventas.
   - Cantidad de órdenes.
   - Ticket promedio.
   - Desglose por método de pago.
   - Gráfica de tendencia.
4. Clic en **"Exportar"** para descargar CSV/Excel (solo admin).

### Ver comparativa mensual (admin/manager)
1. Ir a **Reportes → Comparativa**.
2. Seleccionar meses a comparar (ej. Octubre vs Noviembre).
3. Ver diferencias en ventas, órdenes, ticket promedio.

### Ver reporte de métodos de pago (admin/manager)
1. Ir a **Reportes → Métodos de pago**.
2. Ver total cobrado por cada método:
   - Efectivo
   - MercadoPago
   - POSNET Débito
   - POSNET Crédito
   - Kripton
   - Transferencia

### Ver ICO (Índice de Fiabilidad Operativa) (admin/manager)
1. Ir a **Reportes → ICO**.
2. Ver score de 0-100 que mide salud operativa.
3. Analizar factores contribuyentes (si plan es full).

### Exportar datos (solo admin)
1. Ir a **Reportes**.
2. Clic en **"Exportar"**.
3. Seleccionar formato (CSV, Excel).
4. Seleccionar rango de fechas.
5. Descargar archivo.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Rango de fechas** | Filtra datos por período específico. |
| **Comparativa mensual** | Compara métricas entre meses. |
| **Métodos de pago** | Desglose de ventas por forma de pago. |
| **Exportación** | Descarga de datos en CSV/Excel (solo admin). |
| **ICO** | Score de confiabilidad operativa (0-100). |
| **Gráficas** | Visualización de tendencias temporales. |

## Reglas de negocio y límites

- **Plan buy/full**: Requerido para acceder.
- **Exportación**: Solo rol `admin` puede exportar (`loyaltyExport` o función equivalente).
- **Datos aislados**: Solo se ven datos del propio negocio (multi-tenant).
- **Histórico**: Los datos se conservan indefinidamente para reportes.
- **Tiempo real**: Los reportes se actualizan automáticamente.

## Relación con otros módulos

- **orders**: Alimenta los reportes con datos de órdenes.
- **cash-sale**: Contribuye a reportes de métodos de pago.
- **ico**: El módulo ICO es parte de los reportes avanzados.
- **analyticsAdv**: Analytics avanzado (plan full) incluye métricas adicionales.
- **inventory**: Reportes de consumo de insumos (si inventory activo).
- **loyaltyClub**: Métricas de miembros del club.
- **posIntegration**: Datos de ventas presenciales.

## Preguntas frecuentes

1. **¿Cómo veo las ventas de la semana pasada?**
   → Reportes → Ventas → seleccionar "Semana pasada" o rango de fechas.

2. **¿Puedo exportar los datos a Excel?**
   → Sí, pero solo rol admin. Clic en "Exportar" y descargar.

3. **¿Cómo sé qué método de pago tiene más ventas?**
   → Reportes → Métodos de pago → ver desglose.

4. **¿Qué es el ICO?**
   → Índice de Fiabilidad Operativa: score 0-100 que mide la salud operativa del restaurante.

5. **¿Puedo ver reportes en mi plan trial?**
   → No, reportes requieren plan Crecimiento (buy) o Premium (full).

6. **¿Cómo comparo este mes con el anterior?**
   → Reportes → Comparativa → seleccionar meses a comparar.

7. **¿Puedo ver el ticket promedio?**
   → Sí, en Reportes → Ventas → Ticket promedio.

8. **¿Los reportes se actualizan en tiempo real?**
   → Sí, los datos se actualizan automáticamente.

9. **¿Puedo ver reportes de una sede específica?**
   → Sí, si tienes múltiples sedes, filtrar por sede en los reportes.

10. **¿Cómo veo la tendencia de ventas?**
    → Reportes → Ventas → gráfica de tendencia temporal.

## Errores y mensajes comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `Reportes no disponibles en tu plan` | Plan trial/try. | Actualizar plan a buy/full. |
| `Insufficient permissions for reports:view` | Rol sin permiso. | Pedir a admin/manager que vea el reporte. |
| `Export not allowed for this role` | Rol manager intentando exportar. | Solo admin puede exportar. |
| `No data for selected period` | No hay ventas en el rango. | Cambiar rango de fechas. |
| `Location filter not available` | Plan sin múltiples sedes. | Actualizar plan a buy/full. |

## Recomendaciones y buenas prácticas

- **Revisar reportes diariamente**: Mantener control del rendimiento.
- **Exportar datos mensualmente**: Respaldo de información importante.
- **Usar comparativas**: Entender tendencias y estacionalidad.
- **Analizar métodos de pago**: Optimizar según preferencias del cliente.
- **Revisar ICO regularmente**: Mantener salud operativa alta.
- **Compartir insights**: Discutir reportes en reuniones de equipo.

## Qué hacer si no funciona

Si los reportes no cargan, muestran datos incorrectos, o hay errores:
1. Verificar plan activo (buy/full).
2. Verificar permisos del rol (admin/manager).
3. Verificar rango de fechas seleccionado.
4. Verificar conexión a internet.
5. Si persiste, contactar soporte con: negocio, rol, plan, qué reporte, mensaje de error exacto.

## Descripción breve para negocios que NO lo tienen activo

El módulo de reportes permite analizar ventas, rendimiento y métricas del negocio con gráficas, comparativas y exportación de datos. Es esencial para tomar decisiones basadas en datos. Disponible desde plan Crecimiento (buy) o Premium (full). Si necesitás reportes, contactá al equipo comercial para actualizar tu plan.