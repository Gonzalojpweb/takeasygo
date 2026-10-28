---
modulo: sos
tipo: opcional
roles: [admin, manager]
version_doc: "2026-10-27"
---
# SOS (Reward Advance)

## Qué es y para qué sirve
El módulo SOS (Reward Advance) permite a los miembros del Club de Fidelización "tomar prestados" puntos en el checkout para completar un canje cuando no tienen puntos suficientes. Los puntos prestados se descuentan de futuras compras.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Configurar reglas de préstamo, ver uso, gestionar límites. | — |
| **manager** | Ver uso de SOS, asistir a miembros. | Configurar reglas (solo admin). |
| **cashier** | Asistir a miembros en el checkout al usar SOS. | Configurar reglas. |
| **waiter** | — | Configurar o gestionar SOS. |

## Requisitos previos / cómo se activa
- **Plan mínimo**: `buy` (Crecimiento) o `full` (Premium).
- **Rol mínimo**: `admin` (configuración) o `manager` (uso).
- Requiere `loyaltyClub` activo.
- Se activa en Configuración → Club de fidelización → SOS.

## Paso a paso de las tareas principales

### Activar SOS (solo admin)
1. Ir a **Configuración → Club de fidelización → SOS**.
2. Activar **"Permitir préstamo de puntos"**.
3. Configurar **límite máximo de préstamo** (ej. `500` puntos).
4. Configurar **método de devolución** (descuento automático en próxima compra).
5. Clic en **"Guardar"**.

### Usar SOS en checkout (cashier/manager asistiendo)
1. Al cobrar orden de miembro del club.
2. Si no tiene puntos suficientes para premio deseado:
   - Mostrar opción **"Tomar prestado puntos"**.
   - Sistema calcula puntos faltantes.
   - Miembro acepta préstamo.
   - Se descuenta en checkout.
   - Se registra deuda de puntos.
3. En próxima compra, se descuentan automáticamente.

### Ver uso de SOS (admin/manager)
1. Ir a **Club de fidelización → SOS → Historial**.
2. Ver préstamos realizados:
   - Miembro.
   - Puntos prestados.
   - Fecha.
   - Estado (pendiente/pagado).

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Activar/desactivar** | Habilita o deshabilita el sistema SOS. |
| **Límite de préstamo** | Máximo de puntos que se pueden prestar por operación. |
| **Método de devolución** | Cómo se devuelven los puntos (automático en próxima compra). |
| **Tasa de devolución** | Porcentaje de puntos futuros que se destina a pagar la deuda (opcional). |

## Reglas de negocio y límites

- **Plan buy/full**: Requerido.
- **Requiere loyaltyClub**: Debe estar activo.
- **Límite por operación**: No se puede prestar más allá del límite configurado.
- **Deuda automática**: Los puntos prestados se descuentan en futuras compras.
- **Solo miembros del club**: Solo usuarios registrados en el club pueden usar SOS.
- **No acumula intereses**: No hay recargo por préstamo.

## Relación con otros módulos

- **loyaltyClub**: Base de puntos y miembros.
- **store**: Los préstamos se usan para canjes en tienda.
- **orders**: Los pagos generan puntos para devolver deuda.
- **loyaltyAnalytics**: Métricas de uso de SOS.

## Preguntas frecuentes

1. **¿Qué es SOS?**
   → Sistema que permite tomar prestados puntos para completar canjes.

2. **¿Cómo lo activo?**
   → Configuración → Club → SOS → activar → configurar límite → guardar.

3. **¿Cuánto puedo prestar?**
   → Lo configuras tú como límite máximo por operación.

4. **¿Cómo se devuelven los puntos?**
   → Automáticamente en la próxima compra, descontando de los puntos ganados.

5. **¿Cobra intereses?**
   → No, no hay recargo por préstamo.

6. **¿Quién puede usarlo?**
   → Solo miembros del Club de Fidelización.

7. **¿Puedo limitar quién usa SOS?**
   → El sistema está disponible para todos los miembros si está activo.

8. **¿Qué pasa si no compro más?**
   → La deuda queda pendiente hasta la próxima compra.

9. **¿Puedo ver quién debe puntos?**
   → Sí, en Historial de SOS, ver estado de cada préstamo.

10. **¿Puedo desactivar SOS temporalmente?**
    → Sí, en Configuración → Club → SOS → desactivar.

## Errores y mensajes comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `SOS not enabled` | Módulo desactivado. | Activar en Configuración → Club → SOS. |
| `SOS requires loyalty club` | loyaltyClub no activo. | Activar club de fidelización. |
| `Exceeds loan limit` | Supera límite de préstamo. | Reducir monto o esperar a acumular puntos. |
| `Not a club member` | Usuario no es miembro. | Registrarse en el club primero. |
| `Plan does not allow SOS` | Plan trial/try. | Actualizar plan a buy/full. |

## Recomendaciones y buenas prácticas

- **Configurar límite razonable**: No demasiado alto para evitar abusos.
- **Informar a miembros**: Explicar cómo funciona el préstamo.
- **Monitorear uso**: Revisar quién usa SOS frecuentemente.
- **Promover recompra**: Incentivar compras para pagar deudas.
- **Revisar límites**: Ajustar según volumen de negocio.

## Qué hacer si no funciona

Si SOS no aparece o hay errores:
1. Verificar plan buy/full.
2. Verificar loyaltyClub activo.
3. Verificar SOS habilitado en configuración.
4. Verificar que el usuario sea miembro del club.
5. Si persiste, contactar soporte con: negocio, plan, miembro, configuración, error.

## Descripción breve para negocios que NO lo tienen activo

El módulo SOS (Reward Advance) permite a miembros del Club de Fidelización tomar prestados puntos cuando no tienen suficientes para un canje. Los puntos se devuelven automáticamente en futuras compras. Fomenta la fidelización al permitir canjes inmediatos. Disponible desde plan Crecimiento (buy) o Premium (full).