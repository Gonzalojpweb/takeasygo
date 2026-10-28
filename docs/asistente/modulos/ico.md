---
modulo: ico
tipo: opcional
roles: [admin, manager]
version_doc: "2026-10-27"
---
# ICO — Índice de Fiabilidad Operativa

## Qué es y para qué sirve
El ICO (Índice de Fiabilidad Operativa) es un score de 0 a 100 que mide la salud operativa del restaurante. Evalúa factores como tiempo de preparación, tasa de cancelación, cumplimiento de SLA y otros indicadores de eficiencia.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Ver score ICO, analizar factores, ver tendencias, exportar. | — |
| **manager** | Ver score ICO, analizar factores básicos. | Exportar datos (solo admin). |
| **cashier** | — | Ver ICO (requiere plan buy/full y rol admin/manager). |
| **waiter** | — | Ver ICO. |

## Requisitos previos / cómo se activa
- **Plan mínimo**: `buy` (Crecimiento) para ICO simplificado, `full` (Premium) para ICO avanzado.
- **Rol mínimo**: `admin` o `manager`.
- **icoTrial**: Solo disponible en plan `trial` (al llegar a 30 pedidos).

## Paso a paso de las tareas principales

### Ver score ICO (admin/manager)
1. Ir a **Menú lateral → Reportes → ICO**.
2. Ver score actual (0-100).
3. Analizar factores contribuyentes:
   - Tiempo promedio de preparación (TPP).
   - Tasa de cancelación.
   - Cumplimiento de SLA.
   - Otras métricas operativas.

### Ver tendencia ICO (admin/manager)
1. Ir a **Reportes → ICO**.
2. Ver gráfica de tendencia temporal.
3. Analizar mejoras o deterioros.

### Ver diagnóstico avanzado (solo plan full)
1. Ir a **Reportes → ICO**.
2. Ver desglose por factores específicos.
3. Recomendaciones de mejora.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Score actual** | Valor de 0 a 100 de salud operativa. |
| **Tendencia** | Evolución temporal del score. |
| **Factores** | Desglose de métricas que componen el score. |
| **Diagnóstico** | Análisis detallado (plan full). |
| **Recomendaciones** | Sugerencias de mejora (plan full). |

## Reglas de negocio y límites

- **buy**: ICO simplificado (score y factores básicos).
- **full**: ICO avanzado (diagnóstico completo con factores y recomendaciones).
- **trial**:icoTrial (informe de contexto al llegar a 30 pedidos).
- **Cálculo automático**: El score se recalcula con cada nueva orden.
- **Multi-tenant**: Solo datos del propio negocio.

## Relación con otros módulos

- **orders**: Alimenta ICO con datos de órdenes.
- **reports**: ICO es parte del módulo de reportes.
- **analyticsAdv**: Analytics avanzado complementa ICO (plan full).
- **icoAdvanced**: Versión avanzada del ICO (plan full).
- **icoTrial**: Versión trial del ICO (plan trial).

## Preguntas frecuentes

1. **¿Qué es el ICO?**
   → Índice de Fiabilidad Operativa: score 0-100 que mide salud operativa.

2. **¿Cómo mejoro mi ICO?**
   → Reducir tiempos de preparación, bajar tasa de cancelación, cumplir SLA.

3. **¿Puedo ver ICO en plan trial?**
   → SoloicoTrial (informe de contexto al llegar a 30 pedidos).

4. **¿Qué diferencia hay entre buy y full?**
   → buy: score y factores. full: diagnóstico completo con recomendaciones.

5. **¿Cómo sé qué está bajando mi ICO?**
   → En full, ver desglose por factores para identificar problema.

6. **¿Puedo exportar el ICO?**
   → Solo como admin.

7. **¿Se actualiza en tiempo real?**
   → Sí, se recalcula con cada nueva orden.

8. **¿Puedo ver ICO por sede?**
   → Sí, si tienes múltiples sedes, filtrar por sede.

9. **¿Qué es TPP en el ICO?**
   → Tiempo Promedio de Preparación: promedio de tiempo que tarda un plato.

10. **¿Puedo ver ICO histórico?**
    → Sí, ver tendencia temporal en la gráfica.

## Errores y mensajes comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `ICO not available in your plan` | Plan trial/try. | Actualizar plan a buy/full. |
| `Insufficient permissions` | Rol sin permiso. | Pedir a admin/manager. |
| `No data for ICO calculation` | Sin órdenes suficientes. | Esperar a acumular datos. |
| `ICO advanced requires full plan` | Plan buy para ICO avanzado. | Actualizar plan a full. |

## Recomendaciones y buenas prácticas

- **Revisar ICO diariamente**: Mantener salud operativa alta.
- **Identificar factores bajos**: Enfocarse en mejorar esos aspectos.
- **Comparar con meses anteriores**: Ver tendencia de mejora.
- **Usar recomendaciones**: En plan full, seguir sugerencias.
- **Compartir con equipo**: Discutir ICO en reuniones.

## Qué hacer si no funciona

Si el ICO no carga o muestra datos incorrectos:
1. Verificar plan activo (buy/full).
2. Verificar permisos (admin/manager).
3. Verificar que haya órdenes suficientes para cálculo.
4. Si persiste, contactar soporte con: negocio, plan, mensaje de error.

## Descripción breve para negocios que NO lo tienen activo

El módulo ICO (Índice de Fiabilidad Operativa) es un score de 0 a 100 que mide la salud operativa del restaurante, evaluando tiempos de preparación, cancelaciones y cumplimiento de SLA. Ayuda a identificar áreas de mejora. Disponible desde plan Crecimiento (buy) o Premium (full).