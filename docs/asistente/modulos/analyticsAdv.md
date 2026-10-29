---
modulo: analyticsAdv
tipo: opcional
roles: [admin]
version_doc: "2026-10-27"
---
# Analytics Avanzado

## Qué es y para qué sirve
El módulo de Analytics Avanzado proporciona métricas detalladas de rendimiento del negocio. Incluye análisis de recompra, hora pico, distribución horaria de pedidos y KPIs operativos como TPP y tasa de cancelación.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Ver todas las métricas avanzadas, exportar, analizar tendencias. | — |
| **manager** | — | Ver analytics avanzado (solo admin en algunos casos). |
| **cashier** | — | Ver analytics avanzado. |

## Requisitos previos / cómo se activa
- **Plan mínimo**: `full` (Premium).
- **Rol mínimo**: `admin`.
- Si el plan es `buy` o inferior, el módulo no está disponible.

## Paso a paso de las tareas principales

### Ver métricas de rendimiento (solo admin)
1. Ir a **Menú lateral → Analytics → Rendimiento**.
2. Ver métricas:
   - **Recompra**: Porcentaje de clientes que vuelven en 90 días.
   - **Hora pico**: Período del día con mayor volumen.
   - **Distribución horaria**: Pedidos por hora.
   - **TPP**: Tiempo Promedio de Preparación.
   - **Tasa de cancelación**: % de órdenes canceladas.

### Ver análisis de clientes (solo admin)
1. Ir a **Analytics → Clientes**.
2. Ver segmentación:
   - Nuevos.
   - Recurrentes.
   - VIP.
   - En riesgo.
   - Perdidos.

### Exportar métricas (solo admin)
1. Ir a **Analytics**.
2. Clic en **"Exportar"**.
3. Descargar CSV/Excel.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Recompra** | % de clientes que compran nuevamente en 90 días. |
| **Hora pico** | Período de mayor demanda. |
| **Distribución horaria** | Gráfica de pedidos por hora. |
| **TPP** | Tiempo promedio de preparación. |
| **Tasa cancelación** | % de órdenes canceladas. |
| **Segmentación** | Clasificación de clientes por comportamiento. |
| **Exportación** | Descarga de métricas. |

## Reglas de negocio y límites

- **Plan full**: Requerido.
- **Solo admin**: Único rol con acceso completo.
- **Datos en tiempo real**: Métricas se actualizan automáticamente.
- **Multi-tenant**: Solo datos del propio negocio.

## Relación con otros módulos

- **ico**: Analytics complementa el ICO.
- **orders**: Alimenta métricas con datos de órdenes.
- **crm**: Datos de clientes para segmentación.
- **cis**: Customer Intelligence System complementa.
- **reports**: Forma parte del módulo de reportes.

## Preguntas frecuentes

1. **¿Qué es la hora pico?**
   → Período del día con mayor volumen de pedidos.

2. **¿Cómo sé si mis clientes vuelven?**
   → En Analytics → Rendimiento → Recompra ( % en 90 días).

3. **¿Puedo ver analytics en plan buy?**
   → No, requiere plan full (Premium).

4. **¿Qué es TPP?**
   → Tiempo Promedio de Preparación de los platos.

5. **¿Puedo exportar las métricas?**
   → Sí, como admin.

6. **¿Cómo mejoro la recompra?**
   → Usar club de fidelización, promociones, mejorar experiencia.

7. **¿Puedo ver métricas por sede?**
   → Sí, si tienes múltiples sedes, filtrar por sede.

8. **¿Qué es tasa de cancelación?**
   → Porcentaje de órdenes canceladas sobre el total.

9. **¿Se actualizan en tiempo real?**
   → Sí, las métricas se actualizan automáticamente.

10. **¿Puedo ver tendencias temporales?**
    → Sí, en las gráficas de distribución horaria y tendencia.

## Errores y mensajes comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `Analytics requires full plan` | Plan buy o inferior. | Actualizar plan a full. |
| `Insufficient permissions` | Rol no admin. | Pedir al admin. |
| `No data for analytics` | Sin órdenes suficientes. | Esperar a acumular datos. |

## Recomendaciones y buenas prácticas

- **Revisar métricas semanalmente**: Identificar tendencias.
- **Enfocarse en hora pico**: Optimizar personal en ese período.
- **Mejorar recompra**: Usar club de fidelización y promociones.
- **Reducir cancelaciones**: Analizar causas y mejorar.
- **Compartir con equipo**: Discutir métricas en reuniones.

## Qué hacer si no funciona

Si analytics no carga o muestra datos incorrectos:
1. Verificar plan full.
2. Verificar rol admin.
3. Verificar que haya datos suficientes.
4. Si persiste, contactar soporte con: negocio, plan, mensaje de error.

## Descripción breve para negocios que NO lo tienen activo

El módulo de Analytics Avanzado proporciona métricas detalladas de rendimiento como recompra, hora pico, TPP y tasa de cancelación. Ayuda a tomar decisiones basadas en datos. Disponible exclusivamente en plan Premium (full) para rol admin.