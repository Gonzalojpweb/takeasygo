---
modulo: tia
tipo: opcional
roles: [admin, manager]
version_doc: "2026-10-27"
---
# TIA — Inteligencia TakeasyGO

## Qué es y para qué sirve
TIA es el sistema de inteligencia artificial de TakEasyGo que analiza los datos del negocio y proporciona insights, anomalías detectadas y recomendaciones accionables para mejorar el rendimiento.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Ver todos los insights, anomalías, recomendaciones, exportar. | — |
| **manager** | Ver insights y recomendaciones básicas. | Ver sub-features avanzadas de TIA. |
| **cashier** | — | Ver TIA. |
| **waiter** | — | Ver TIA. |

## Requisitos previos / cómo se activa
- **Plan mínimo**: `buy` (Crecimiento) o `full` (Premium).
- **Rol mínimo**: `admin` o `manager` (limitado).
- **Sub-features Premium**: Algunas funciones (SIL, anomalías, recomendaciones) requieren plan `full`.

## Paso a paso de las tareas principales

### Ver insights de TIA (admin/manager)
1. Ir a **Menú lateral → TIA**.
2. Ver **insights del día/semana**:
   - Tendencias de ventas.
   - Oportunidades detectadas.
   - Alertas de rendimiento.

### Ver anomalías (admin, plan full)
1. Ir a **TIA → Anomalías**.
2. Ver desviaciones inesperadas:
   - Caída de ventas.
   - Aumento de cancelaciones.
   - Cambios en patrones de compra.

### Ver recomendaciones (admin, plan full)
1. Ir a **TIA → Recomendaciones**.
2. Ver sugerencias accionables:
   - Optimizar menú.
   - Ajustar horarios.
   - Promociones sugeridas.

### Configurar TIA (solo admin)
1. Ir a **Configuración → TIA**.
2. Activar/desactivar tipos de análisis.
3. Definir frecuencia de reportes.
4. Clic en **"Guardar"**.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Insights** | Análisis de tendencias y oportunidades. |
| **Anomalías** | Detección de desviaciones (plan full). |
| **Recomendaciones** | Sugerencias accionables (plan full). |
| **Frecuencia** | Cada cuánto se generan análisis. |
| **Alertas** | Notificación de hallazgos importantes. |

## Reglas de negocio y límites

- **Plan buy/full**: Requerido.
- **Sub-features Premium**: Anomalías, recomendaciones, SIL requieren plan `full`.
- **Solo admin/manager**: Roles operativos no acceden.
- **Datos del propio negocio**: Aislamiento multi-tenant.
- **Cálculo automático**: TIA analiza datos continuamente.

## Relación con otros módulos

- **orders**: TIA analiza datos de órdenes.
- **reports**: Complementa reportes estándar con IA.
- **analyticsAdv**: Métricas avanzadas (plan full).
- **ico**: TIA puede sugerir mejoras para ICO.
- **inventory**: Analiza consumo y stock.

## Preguntas frecuentes

1. **¿Qué es TIA?**
   → Sistema de inteligencia artificial que analiza tu negocio y da insights.

2. **¿Qué tipo de recomendaciones da?**
   → Optimización de menú, horarios, promociones, identificación de oportunidades.

3. **¿Puedo ver TIA en plan trial?**
   → No, requiere plan buy o full.

4. **¿Qué son las anomalías?**
   → Desviaciones inesperadas en ventas, cancelaciones o patrones de compra.

5. **¿Pueden managers ver TIA?**
   → Sí, insights y recomendaciones básicas. Sub-features premium son solo admin.

6. **¿Se actualiza en tiempo real?**
   → TIA analiza continuamente, pero insights pueden tener periodicidad.

7. **¿Puedo exportar las recomendaciones?**
   → Sí, como admin.

8. **¿Cómo sé si una recomendación es buena?**
   → TIA proporciona evidencia basada en tus datos históricos.

9. **¿Puedo configurar qué analiza TIA?**
   → Sí, en Configuración → TIA.

10. **¿Qué es SIL?**
    → Sub-feature de TIA disponible en plan full. [VERIFICAR: definición exacta de SIL en el código]

## Errores y mensajes comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `TIA requires buy plan` | Plan trial/try. | Actualizar plan a buy/full. |
| `TIA advanced requires full plan` | Plan buy para sub-features premium. | Actualizar plan a full. |
| `Insufficient permissions` | Rol sin permiso. | Pedir a admin. |
| `No data for analysis` | Sin datos suficientes. | Esperar a acumular datos. |

## Recomendaciones y buenas prácticas

- **Revisar insights regularmente**: No ignorar alertas.
- **Actuar sobre recomendaciones**: Implementar sugerencias.
- **Combinar con reportes**: Usar TIA junto con datos tradicionales.
- **Personalizar análisis**: Configurar según necesidades del negocio.
- **Compartir con equipo**: Discutir hallazgos y plan de acción.

## Qué hacer si no funciona

Si TIA no carga o no genera insights:
1. Verificar plan buy/full.
2. Verificar permisos.
3. Verificar datos suficientes para análisis.
4. Si persiste, contactar soporte con: negocio, plan, qué buscaba, error.

## Descripción breve para negocios que NO lo tienen activo

TIA es el sistema de inteligencia artificial de TakEasyGo que analiza los datos del negocio y proporciona insights, detección de anomalías y recomendaciones accionables. Ayuda a tomar decisiones basadas en datos. Disponible desde plan Crecimiento (buy) o Premium (full).