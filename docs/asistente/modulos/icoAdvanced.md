---
modulo: icoAdvanced
tipo: opcional
roles: [admin, manager]
version_doc: "2026-10-27"
---
# ICO Avanzado

## Qué es y para qué sirve
El ICO Avanzado es la versión completa del Índice de Fiabilidad Operativa, disponible solo en plan Premium. Proporciona diagnóstico detallado con factores específicos, recomendaciones de mejora y análisis profundo de la salud operativa.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Ver diagnóstico completo, factores, recomendaciones, exportar. | — |
| **manager** | Ver factores y tendencias básicas. | Ver diagnóstico completo y recomendaciones (solo admin en algunos casos). |
| **cashier** | — | Ver ICO avanzado. |

## Requisitos previos / cómo se activa
- **Plan mínimo**: `full` (Premium).
- **Rol mínimo**: `admin` o `manager` (limitado).
- Si el plan es `buy` o inferior, solo hay ICO simplificado.

## Paso a paso de las tareas principales

### Ver diagnóstico completo (solo admin)
1. Ir a **Menú lateral → Reportes → ICO**.
2. Ver score actual (0-100).
3. Analizar factores detallados:
   - Tiempo de preparación por categoría.
   - Tasa de cancelación por motivo.
   - Cumplimiento de SLA por tipo de orden.
   - Eficiencia por sede (si aplica).
4. Ver recomendaciones específicas de mejora.

### Ver tendencia avanzada (admin/manager)
1. Ir a **Reportes → ICO**.
2. Ver evolución temporal con desglose por factores.
3. Identificar mejoras o deterioros específicos.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Score actual** | Valor 0-100 de salud operativa. |
| **Factores detallados** | Desglose por categoría, motivo, tipo de orden. |
| **Recomendaciones** | Sugerencias específicas de mejora. |
| **Tendencia avanzada** | Evolución temporal con desglose. |
| **Comparativa** | Comparación con períodos anteriores. |
| **Exportación** | Descarga de diagnóstico completo. |

## Reglas de negocio y límites

- **Plan full**: Requerido.
- **Diagnóstico completo**: Solo admin puede ver recomendaciones.
- **Factores**: Admin y manager pueden ver factores básicos.
- **Cálculo automático**: Se actualiza con cada orden.
- **Multi-tenant**: Solo datos del propio negocio.

## Relación con otros módulos

- **ico**: Versión avanzada del módulo ICO base.
- **analyticsAdv**: Complementa con métricas de rendimiento.
- **orders**: Alimenta con datos de órdenes.
- **reports**: Forma parte del módulo de reportes.
- **inventory**: Consume datos de inventario si está activo.

## Preguntas frecuentes

1. **¿Qué diferencia hay entre ICO normal y avanzado?**
   → Avanzado (full) tiene diagnóstico completo con factores y recomendaciones.

2. **¿Puedo ver ICO avanzado en plan buy?**
   → No, requiere plan full (Premium).

3. **¿Qué factores analiza?**
   → Tiempos de preparación, cancelaciones, SLA, eficiencia por sede.

4. **¿Me da recomendaciones específicas?**
   → Sí, en plan full incluye sugerencias de mejora.

5. **¿Puedo exportar el diagnóstico?**
   → Sí, como admin.

6. **¿Cómo mejoro mi score?**
   → Seguir recomendaciones del diagnóstico avanzado.

7. **¿Puedo ver por sede?**
   → Sí, si tienes múltiples sedes, desglose por sede.

8. **¿Se actualiza en tiempo real?**
   → Sí, con cada nueva orden.

9. **¿Pueden managers verlo?**
   → Managers ven factores básicos; diagnóstico completo es solo admin.

10. **¿Qué es SLA en el ICO?**
    → Service Level Agreement: tiempo máximo esperado para cada estado de orden.

## Errores y mensajes comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `ICO Advanced requires full plan` | Plan buy o inferior. | Actualizar plan a full. |
| `Insufficient permissions` | Rol sin permiso completo. | Pedir al admin para diagnóstico. |
| `No data for advanced ICO` | Sin órdenes suficientes. | Esperar a acumular datos. |

## Recomendaciones y buenas prácticas

- **Revisar recomendaciones**: Implementar sugerencias del diagnóstico.
- **Enfocarse en factores bajos**: Mejorar aspectos con menor puntuación.
- **Comparar períodos**: Ver si mejoras o empeoras.
- **Usar con analytics**: Complementar con métricas de rendimiento.
- **Compartir con equipo**: Discutir hallazgos y plan de acción.

## Qué hacer si no funciona

Si el ICO avanzado no carga o muestra datos incorrectos:
1. Verificar plan full.
2. Verificar permisos.
3. Verificar datos suficientes.
4. Si persiste, contactar soporte con: negocio, plan, mensaje de error.

## Descripción breve para negocios que NO lo tienen activo

El módulo ICO Avanzado es la versión completa del Índice de Fiabilidad Operativa, con diagnóstico detallado por factores y recomendaciones específicas de mejora. Proporciona análisis profundo de la salud operativa. Disponible exclusivamente en plan Premium (full).