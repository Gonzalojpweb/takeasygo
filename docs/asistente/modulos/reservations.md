---
modulo: reservations
tipo: opcional
roles: [admin, manager]
version_doc: "2026-10-27"
---
# Reservas

## Qué es y para qué sirve
El módulo de Reservas permite gestionar las reservas de mesas del negocio. Los clientes pueden reservar con anticipación, el sistema notifica al restaurante y las mesas se marcan como reservadas hasta la llegada del cliente.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Crear, editar, cancelar reservas, configurar reglas, ver reportes. | — |
| **manager** | Crear, editar, cancelar reservas, asistir a clientes. | Configurar reglas avanzadas. |
| **cashier** | Ver reservas del día, marcar llegada. | Crear/cancelar reservas. |
| **waiter** | Ver reservas del día, marcar llegada, asignar mesa. | Crear/cancelar reservas. |

## Requisitos previos / cómo se activa
- **Plan mínimo**: `buy` (Crecimiento) o `full` (Premium).
- **Rol mínimo**: `admin` o `manager` (gestión).
- Si el plan es `trial` o `try`, el módulo no está disponible.

## Paso a paso de las tareas principales

### Crear una reserva (admin/manager)
1. Ir a **Menú lateral → Reservas**.
2. Clic en **"+ Nueva reserva"**.
3. Completar campos:
   - **Nombre del cliente**: ej. "Juan Pérez".
   - **Teléfono**: ej. "11-1234-5678".
   - **Fecha**: fecha de la reserva.
   - **Hora**: hora de llegada.
   - **Cantidad de comensales**: ej. `4`.
   - **Mesa asignada** (opcional): seleccionar mesa específica.
   - **Notas especiales**: ej. "Cumpleaños, llevar pastel".
4. Clic en **"Guardar"**.
5. La mesa se marca como "Reservada".

### Editar una reserva (admin/manager)
1. Ir a **Reservas**.
2. Buscar reserva por nombre o fecha.
3. Clic en **"Editar"**.
4. Modificar campos necesarios.
5. Clic en **"Guardar"**.

### Cancelar una reserva (admin/manager)
1. Ir a **Reservas**.
2. Buscar reserva.
3. Clic en **"Cancelar"**.
4. Ingresar motivo (opcional).
5. La mesa se libera.

### Marcar llegada de cliente (admin/manager/cashier/waiter)
1. Ir a **Reservas → Del día**.
2. Buscar reserva.
3. Clic en **"Llegó"**.
4. El estado cambia a "En mesa".
5. Mesa pasa a "Ocupada".

### Ver reservas del día (todos los roles)
1. Ir a **Reservas → Del día**.
2. Ver listado ordenado por hora.
3. Estado de cada reserva: Pendiente, Llegó, Cancelada, No presentó.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Nombre del cliente** | Identificación del reservante. |
| **Teléfono** | Contacto para confirmaciones. |
| **Fecha y hora** | Cuándo viene el cliente. |
| **Comensales** | Cantidad de personas. |
| **Mesa asignada** | Mesa específica reservada (opcional). |
| **Notas especiales** | Instrucciones adicionales. |
| **Estado** | Pendiente, Llegó, Cancelada, No presentó. |

## Reglas de negocio y límites

- **Plan buy/full**: Requerido.
- **Mesa disponible**: No se puede reservar mesa ocupada.
- **Sin límite de reservas**: No hay máximo definido en código.
- **Multi-sede**: Reservas por sede.
- **Notificación**: El sistema notifica al llegar la hora.
- **No presentó**: El admin/manager puede marcar "No presentó" si el cliente no llega.

## Relación con otros módulos

- **mesas**: Las reservas asignan mesas específicas.
- **orders**: Al llegar, se genera orden dine-in.
- **dineIn**: Reservas son parte del flujo dine-in.
- **reports**: Reportes de ocupación por reservas.

## Preguntas frecuentes

1. **¿Cómo creo una reserva?**
   → Reservas → "+ Nueva reserva" → completar datos → guardar.

2. **¿Puedo asignar mesa específica?**
   → Sí, en el campo "Mesa asignada" seleccionar la mesa deseada.

3. **¿Cómo cancelo una reserva?**
   → Reservas → buscar → "Cancelar" → confirmar.

4. **¿Qué hago si el cliente no llega?**
   → Marcar "No presentó" y liberar mesa.

5. **¿Los clientes pueden reservar online?**
   → Depende de la configuración del negocio. Contactar admin.

6. **¿Puedo ver reservas de la semana?**
   → Sí, en Reservas → filtrar por fecha.

7. **¿Se notifica al cliente la confirmación?**
   → Depende de configuración. Verificar con admin.

8. **¿Puedo reservar mesa para grupo grande?**
   → Sí, indicar cantidad de comensales. El sistema asigna mesa adecuada.

9. **¿Qué pasa si quiero cambiar la hora?**
   → Editar reserva → cambiar hora → guardar.

10. **¿Puedo ver historial de reservas?**
    → Sí, en Reservas → Historial.

## Errores y mensajes comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `Reservations requires buy plan` | Plan trial/try. | Actualizar plan a buy/full. |
| `Table not available` | Mesa ocupada/reservada. | Elegir otra mesa. |
| `Insufficient permissions` | Rol sin permiso. | Pedir a admin/manager. |
| `Invalid date/time` | Fecha u hora incorrecta. | Corregir datos. |
| `Reservation already cancelled` | Reserva ya cancelada. | Crear nueva si es necesario. |

## Recomendaciones y buenas prácticas

- **Confirmar reservas**: Llamar al cliente para confirmar.
- **Llegar puntual**: Informar al equipo sobre reservas del día.
- **Gestionar no presentados**: Liberar mesa rápidamente.
- **Actualizar disponibilidad**: Mantener mesas actualizadas.
- **Usar notas especiales**: Anotar preferencias del cliente.

## Qué hacer si no funciona

Si las reservas no cargan o hay errores:
1. Verificar plan buy/full.
2. Verificar permisos.
3. Verificar mesas disponibles.
4. Si persiste, contactar soporte con: negocio, plan, reserva, error.

## Descripción breve para negocios que NO lo tienen activo

El módulo de Reservas permite gestionar las reservas de mesas, notificando al restaurante la llegada de clientes y manteniendo el control de disponibilidad. Es esencial para restaurantes con demanda alta. Disponible desde plan Crecimiento (buy) o Premium (full).