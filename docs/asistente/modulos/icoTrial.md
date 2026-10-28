---
modulo: icoTrial
tipo: opcional
roles: [admin]
version_doc: "2026-10-27"
---
# ICO Trial

## Qué es y para qué sirve
El ICO Trial es una versión limitada del Índice de Fiabilidad Operativa disponible solo para negocios en plan `trial`. Proporciona un informe de contexto operativo cuando el negocio alcanza 30 pedidos, ayudando a evaluar el potencial antes de contratar un plan de pago.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Ver informe de contexto ICO al llegar a 30 pedidos. | — |
| **manager** | — | Ver ICO Trial (solo admin). |
| **cashier** | — | Ver ICO Trial. |

## Requisitos previos / cómo se activa
- **Plan mínimo**: `trial` (exclusivo).
- **Rol mínimo**: `admin`.
- Se activa automáticamente al alcanzar 30 pedidos.

## Paso a paso de las tareas principales

### Ver informe ICO Trial (solo admin)
1. Al alcanzar 30 pedidos, el sistema notifica: "¡Conseguiste tu informe ICO de contexto!".
2. Ir a **Reportes → ICO**.
3. Ver informe de contexto operativo:
   - Score estimado.
   - Indicadores básicos.
   - Recomendación de plan.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Informe de contexto** | Resumen operativo al llegar a 30 pedidos. |
| **Score estimado** | Valor aproximado de salud operativa. |
| **Recomendación** | Sugerencia de plan según resultados. |

## Reglas de negocio y límites

- **Solo plan trial**: No disponible en otros planes.
- **30 pedidos**: Se activa al alcanzar ese umbral.
- **Solo admin**: Único rol con acceso.
- **Una sola vez**: Se genera una vez al alcanzar 30 pedidos.

## Relación con otros módulos

- **ico**: Versión trial del módulo ICO completo.
- **orders**: Se activa con 30 pedidos.
- **reports**: Forma parte del módulo de reportes.

## Preguntas frecuentes

1. **¿Qué es el ICO Trial?**
   → Informe de contexto operativo disponible al llegar a 30 pedidos en plan trial.

2. **¿Cuándo lo recibo?**
   → Automáticamente al alcanzar 30 pedidos.

3. **¿Puedo verlo si no llegué a 30 pedidos?**
   → No, se activa solo al alcanzar ese umbral.

4. **¿Qué me dice el informe?**
   → Score estimado, indicadores básicos y recomendación de plan.

5. **¿Puedo exportarlo?**
   → No hay exportación definida para ICO Trial.

6. **¿Qué pasa si cambio de plan?**
   → Al salir de trial, pierdes acceso a ICO Trial.

7. **¿Pueden managers verlo?**
   → No, solo admin.

8. **¿Se actualiza después de 30 pedidos?**
   → Es un informe puntual, no se actualiza en tiempo real.

9. **¿Me ayuda a decidir si contratar?**
   → Sí, muestra tu operación actual para evaluar potencial.

10. **¿Hay límite de tiempo para verlo?**
    → No hay límite definido. Puedes verlo mientras estés en trial.

## Errores y mensajes comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `ICO Trial not available` | Plan no trial o rol incorrecto. | Verificar plan trial y rol admin. |
| `Not enough orders for ICO Trial` | Menos de 30 pedidos. | Alcanzar 30 pedidos. |
| `ICO Trial already generated` | Ya se generó. | Ver informe existente. |

## Recomendaciones y buenas prácticas

- **Alcanzar 30 pedidos rápido**: Para obtener el informe.
- **Revisar recomendaciones**: Aprender de los resultados.
- **Evaluar planes**: Usar informe para decidir upgrade.
- **Compartir con socio**: Discutir resultados.

## Qué hacer si no funciona

Si el ICO Trial no aparece:
1. Verificar plan trial.
2. Verificar que tengas 30 pedidos.
3. Verificar rol admin.
4. Si persiste, contactar soporte con: negocio, plan, pedidos realizados.

## Descripción breve para negocios que NO lo tienen activo

El ICO Trial es un informe de contexto operativo disponible solo en plan trial, que se genera automáticamente al alcanzar 30 pedidos. Muestra un score estimado y recomendación de plan para ayudar a evaluar la plataforma. Exclusivo para negocios en período de prueba.