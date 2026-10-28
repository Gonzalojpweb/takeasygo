---
modulo: loyaltyAnalytics
tipo: opcional
roles: [admin]
version_doc: "2026-10-27"
---
# Loyalty Analytics (Analytics del Club)

## Qué es y para qué sirve
El módulo Loyalty Analytics proporciona métricas avanzadas del Club de Fidelización. Analiza comportamiento de miembros, frecuencia de visita, tasa de recompra y efectividad del programa de puntos.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Ver todas las métricas del club, analizar tendencias, exportar. | — |
| **manager** | — | Ver analytics del club (solo admin en algunos casos). |
| **cashier** | — | Ver analytics del club. |

## Requisitos previos / cómo se activa
- **Plan mínimo**: `full` (Premium).
- **Rol mínimo**: `admin`.
- Requiere `loyaltyClub` activo.
- Si el plan es `buy` o inferior, el módulo no está disponible.

## Paso a paso de las tareas principales

### Ver métricas del club (solo admin)
1. Ir a **Menú lateral → Club de fidelización → Analytics**.
2. Ver métricas:
   - **Miembros activos**: Cuántos compraron en los últimos 90 días.
   - **Tasa de recompra**: % de miembros que vuelven.
   - **Puntos promedio**: Promedio de puntos por miembro.
   - **Canjes realizados**: Cantidad total de canjes.
   - **Valor promedio de compra**: Gasto medio de miembros vs no miembros.

### Ver segmentación de miembros (solo admin)
1. Ir a **Club → Analytics → Segmentación**.
2. Ver segmentos:
   - Nuevos miembros.
   - Recurrentes.
   - VIP (mayor gasto).
   - En riesgo (sin comprar hace tiempo).
   - Perdidos (sin comprar hace mucho).

### Exportar métricas (solo admin)
1. Ir a **Club → Analytics**.
2. Clic en **"Exportar"**.
3. Descargar CSV/Excel.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Miembros activos** | Cuántos compraron en 90 días. |
| **Tasa de recompra** | % que vuelve a comprar. |
| **Puntos promedio** | Promedio de puntos por miembro. |
| **Canjes** | Cantidad de canjes realizados. |
| **Segmentación** | Clasificación por comportamiento. |
| **Comparativa** | Miembros vs no miembros. |

## Reglas de negocio y límites

- **Plan full**: Requerido.
- **Requiere loyaltyClub**: Debe estar activo.
- **Solo admin**: Único rol con acceso.
- **Datos en tiempo real**: Métricas se actualizan automáticamente.
- **Multi-tenant**: Solo datos del propio negocio.

## Relación con otros módulos

- **loyaltyClub**: Fuente de datos de miembros.
- **loyaltyExport**: Complementa con exportación de datos.
- **store**: Métricas de canjes en tienda.
- **sos**: Métricas de uso de préstamo de puntos.
- **orders**: Datos de compra de miembros.

## Preguntas frecuentes

1. **¿Qué métricas muestra?**
   → Miembros activos, recompra, puntos promedio, canjes, segmentación.

2. **¿Puedo ver analytics en plan buy?**
   → No, requiere plan full (Premium).

3. **¿Qué es segmentación?**
   → Clasificación de miembros por comportamiento (VIP, en riesgo, etc.).

4. **¿Puedo exportar las métricas?**
   → Sí, como admin.

5. **¿Cómo mejoro la tasa de recompra?**
   → Usar promociones, recompensas atractivas, comunicación.

6. **¿Puedo comparar miembros vs no miembros?**
   → Sí, en comparativa de valor de compra.

7. **¿Se actualiza en tiempo real?**
   → Sí, las métricas se actualizan automáticamente.

8. **¿Pueden managers verlo?**
   → No, solo admin.

9. **¿Qué es "en riesgo"?**
   → Miembros que no compran hace tiempo y podrían perderse.

10. **¿Puedo ver métricas por sede?**
    → Si tienes múltiples sedes, puedes filtrar por sede.

## Errores y mensajes comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `Loyalty Analytics requires full plan` | Plan buy o inferior. | Actualizar plan a full. |
| `Loyalty club not active` | club no habilitado. | Activar club de fidelización. |
| `Insufficient permissions` | Rol no admin. | Pedir al admin. |
| `No data for analytics` | Sin miembros suficientes. | Esperar a acumular datos. |

## Recomendaciones y buenas prácticas

- **Revisar métricas semanalmente**: Identificar tendencias.
- **Actuar sobre "en riesgo"**: Contactar miembros inactivos.
- **Premiar VIPs**: Ofrecer beneficios exclusivos.
- **Medir impacto**: Comparar ventas antes/después del club.
- **Compartir con equipo**: Discutir métricas en reuniones.

## Qué hacer si no funciona

Si analytics del club no carga:
1. Verificar plan full.
2. Verificar loyaltyClub activo.
3. Verificar rol admin.
4. Si persiste, contactar soporte con: negocio, plan, mensaje de error.

## Descripción breve para negocios que NO lo tienen activo

El módulo Loyalty Analytics proporciona métricas avanzadas del Club de Fidelización como miembros activos, tasa de recompra y segmentación por comportamiento. Ayuda a optimizar el programa de fidelización. Disponible exclusivamente en plan Premium (full).