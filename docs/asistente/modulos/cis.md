---
modulo: cis
tipo: opcional
roles: [admin, manager]
version_doc: "2026-10-27"
---
# CIS — Customer Intelligence System

## Qué es y para qué sirve
El CIS (Customer Intelligence System) es un sistema de inteligencia de clientes que proporciona métricas avanzadas, segmentación detallada, health score, insights y señales de comportamiento de los consumidores.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Ver todas las métricas, segmentaciones, health score, insights, señales, exportar. | — |
| **manager** | Ver métricas y segmentaciones básicas. | Insights avanzados, señales, exportar. |
| **cashier** | — | Ver CIS. |
| **waiter** | — | Ver CIS. |

## Requisitos previos / cómo se activa
- **Plan mínimo**: `buy` (Crecimiento) o `full` (Premium).
- **Rol mínimo**: `admin` o `manager` (limitado).
- Si el plan es `trial` o `try`, el módulo no está disponible.

## Paso a paso de las tareas principales

### Ver métricas de clientes (admin/manager)
1. Ir a **Menú lateral → CIS → Métricas**.
2. Ver:
   - Total de consumidores activos.
   - Nuevo vs recurrente.
   - Valor de vida del cliente (LTV).
   - Frecuencia de visita promedio.

### Ver health score de clientes (admin/manager)
1. Ir a **CIS → Health Score**.
2. Ver score de salud de cada cliente:
   - Alto: clientes comprometidos.
   - Medio: clientes regulares.
   - Bajo: clientes en riesgo de pérdida.

### Ver segmentación avanzada (admin)
1. Ir a **CIS → Segmentación**.
2. Ver segmentos detallados con criterios:
   - Por gasto.
   - Por frecuencia.
   - Por recencia.
   - Por canal de adquisición.

### Ver insights y señales (admin, plan full)
1. Ir a **CIS → Insights**.
2. Ver hallazgos automáticos:
   - Tendencias de comportamiento.
   - Señales de fidelización o pérdida.
   - Oportunidades de venta cruzada.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Métricas** | Indicadores clave de clientes. |
| **Health Score** | Score de salud individual por cliente. |
| **Segmentación** | Clasificación avanzada por múltiples criterios. |
| **Insights** | Hallazgos automáticos (plan full). |
| **Señales** | Alertas de comportamiento (plan full). |
| **LTV** | Valor de vida del cliente. |

## Reglas de negocio y límites

- **Plan buy/full**: Requerido.
- **Sub-features Premium**: Insights y señales pueden requerir plan `full`.
- **Solo admin/manager**: Roles operativos no acceden.
- **Datos del propio negocio**: Aislamiento multi-tenant.
- **Cálculo automático**: Métricas se actualizan con nuevas interacciones.

## Relación con otros módulos

- **crm**: Fuente de datos de consumidores.
- **orders**: Historial de compras alimenta CIS.
- **loyaltyClub**: Datos de miembros del club.
- **reports**: Complementa reportes estándar.
- **analyticsAdv**: Métricas de rendimiento complementarias.

## Preguntas frecuentes

1. **¿Qué es CIS?**
   → Sistema de inteligencia de clientes con métricas, segmentación y health score.

2. **¿Qué es health score?**
   → Score que mide la salud de la relación con cada cliente (alto/medio/bajo).

3. **¿Puedo ver CIS en plan trial?**
   → No, requiere plan buy o full.

4. **¿Qué son las señales?**
   → Alertas automáticas de comportamiento (ej. cliente inactivo).

5. **¿Los managers pueden ver insights avanzados?**
   → No, algunos sub-features requieren plan full y rol admin.

6. **¿Puedo exportar métricas?**
   → Sí, como admin.

7. **¿Qué es LTV?**
   → Lifetime Value: valor total que un cliente ha aportado al negocio.

8. **¿Se actualiza en tiempo real?**
   → Las métricas se actualizan con nuevas interacciones.

9. **¿Puedo ver clientes en riesgo?**
   → Sí, en health score bajo o segmento "en riesgo".

10. **¿Puedo comparar segmentos?**
    → Sí, la segmentación permite comparación entre grupos.

## Errores y mensajes comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `CIS requires buy plan` | Plan trial/try. | Actualizar plan a buy/full. |
| `CIS advanced requires full plan` | Plan buy para sub-features. | Actualizar plan a full. |
| `Insufficient permissions` | Rol sin permiso. | Pedir a admin. |
| `No data for CIS analysis` | Sin consumidores suficientes. | Esperar a acumular datos. |

## Recomendaciones y buenas prácticas

- **Revisar health score**: Priorizar clientes en riesgo.
- **Actuar sobre señales**: Responder a alertas de comportamiento.
- **Usar segmentos**: Personalizar comunicación.
- **Medir LTV**: Enfocarse en clientes de alto valor.
- **Combinar con CRM**: Usar datos junto con información detallada.

## Qué hacer si no funciona

Si CIS no carga o no genera métricas:
1. Verificar plan buy/full.
2. Verificar permisos.
3. Verificar que haya consumidores con datos.
4. Si persiste, contactar soporte con: negocio, plan, qué buscaba, error.

## Descripción breve para negocios que NO lo tienen activo

El CIS (Customer Intelligence System) es un sistema de inteligencia de clientes con métricas avanzadas, segmentación detallada, health score e insights de comportamiento. Ayuda a entender y fidelizar clientes. Disponible desde plan Crecimiento (buy) o Premium (full).