---
modulo: delivery
tipo: opcional
roles: [admin, manager, cashier]
version_doc: "2026-10-27"
---
# Delivery (Envío a Domicilio)

## Qué es y para qué sirve
El módulo de Delivery permite gestionar pedidos para envío a domicilio. Incluye cálculo de costos de envío por zona, seguimiento de estado desde preparación hasta entrega, y integración con flota propia o servicios externos.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Configurar zonas, costos de envío, gestionar repartidores, ver reportes. | — |
| **manager** | Gestionar pedidos delivery, asignar repartidores, ver seguimiento. | Configurar zonas y costos. |
| **cashier** | Crear/cobrar pedidos delivery, ver estado. | Configurar zonas, asignar repartidores. |
| **waiter** | — | Gestionar delivery. |

## Requisitos previos / cómo se activa
- **Plan mínimo**: `trial` y `full` (no disponible en `try`, `buy`, `anfitrion`).
- **Rol mínimo**: `admin/manager` (configuración), `cashier` (operación).
- Se activa en Configuración → Modo de operación → Delivery.

## Paso a paso de las tareas principales

### Activar delivery (solo admin)
1. Ir a **Configuración → Modo de operación**.
2. Activar **"Delivery"**.
3. Configurar **zonas de cobertura**:
   - Nombre de zona (ej. "Zona Norte").
   - Radio en km (ej. `5` km).
   - Costo de envío (ej. `$500`).
4. Clic en **"Guardar"**.

### Crear pedido delivery (admin/manager/cashier)
1. Ir a **Menú lateral → Órdenes → Nueva orden**.
2. Seleccionar **Modo: Delivery**.
3. Ingresar **datos de entrega**:
   - Nombre del cliente: ej. "Juan Pérez".
   - Dirección: ej. "Calle Falsa 123".
   - Teléfono: ej. "11-1234-5678".
   - Referencias: ej. "Portón negro, timbre 2".
4. Seleccionar **zona de entrega**.
5. Sistema calcula **costo de envío** automáticamente.
6. Agregar productos al carrito.
7. Cobrar (con envío incluido).
8. La orden pasa a estado `pending`.

### Asignar repartidor (admin/manager)
1. Ir a **Delivery → Pedidos en curso**.
2. Seleccionar pedido `confirmed` o `preparing`.
3. Clic en **"Asignar repartidor"**.
4. Seleccionar repartidor disponible.
5. Estado cambia a `ready` → `en_ruta`.

### Seguir pedido delivery (admin/manager)
1. Ir a **Delivery → En curso**.
2. Ver estado de cada pedido:
   - Preparando.
   - Listo para envío.
   - En ruta.
   - Llegó.
   - Entregado.
3. Ver ubicación del repartidor (si aplica).

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Zonas de cobertura** | Áreas geográficas donde se entrega. |
| **Costo de envío por zona** | Precio fijo o variable por zona. |
| **Radio de entrega** | Distancia máxima desde el local. |
| **Repartidores** | Personal asignado a entregas. |
| **Tiempo estimado de entrega** | Cuánto tarda en cada zona. |
| **Pedido mínimo** | Monto mínimo para delivery (opcional). |

## Reglas de negocio y límites

- **Plan trial/full**: No disponible en try, buy, anfitrion.
- **Zonas definidas**: Solo se entrega en zonas configuradas.
- **Costo variable**: Se calcula según zona del cliente.
- **Estados de orden**: pending → confirmed → preparing → ready → en_ruta → arrived → delivered.
- **Pedido mínimo**: Si se define, no se procesa pedidos menores.

## Relación con otros módulos

- **orders**: Los pedidos delivery son un tipo de orden.
- **menu**: Los productos se seleccionan del menú.
- **printers**: Impresión de ticket de preparación.
- **reports**: Reportes de ventas delivery.
- **dineIn**: Complementa con pedidos en local.
- **takeaway**: Complementa con pedidos para llevar.

## Preguntas frecuentes

1. **¿Cómo activo delivery?**
   → Configuración → Modo de operación → activar Delivery → guardar.

2. **¿Cómo configuro zonas de envío?**
   → Configuración → Delivery → zonas → nombre + radio + costo → guardar.

3. **¿Cómo sé el costo de envío?**
   → Se calcula automáticamente según zona del cliente.

4. **¿Puedo tener costo variable por zona?**
   → Sí, configurar diferente costo por cada zona.

5. **¿Puedo asignar repartidores?**
   → Sí, en Delivery → pedidos → asignar repartidor.

6. **¿Cómo sigue el cliente su pedido?**
   → Recibe notificación de estado (si está configurado).

7. **¿Puedo limitar radio de entrega?**
   → Sí, configurar radio en km por zona.

8. **¿Puedo pedir pedido mínimo?**
   → Sí, configurar monto mínimo en opciones de delivery.

9. **¿Puedo tener delivery y dine-in juntos?**
   → Sí, pueden estar activos simultáneamente.

10. **¿Cómo cierro un pedido delivery?**
    → Al cambiar estado a "Entregado", la orden se cierra.

## Errores y mensajes comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `Delivery not enabled` | Modo desactivado. | Activar en Configuración → Modo. |
| `Outside delivery zone` | Dirección fuera de zonas. | Verificar zonas configuradas. |
| `Minimum order not met` | Pedido menor al mínimo. | Agregar productos o reducir mínimo. |
| `Delivery not available in your plan` | Plan try/buy/anfitrion. | Cambiar de plan a trial o full. |
| `Insufficient permissions` | Rol sin permiso. | Pedir a admin/manager. |

## Recomendaciones y buenas prácticas

- **Mantener zonas actualizadas**: Actualizar costos y cobertura.
- **Entrenar repartidores**: Conocer zonas y procedimientos.
- **Monitorear tiempos**: Reducir tiempo de entrega.
- **Informar al cliente**: Notificar estado del pedido.
- **Revisar costos**: Asegurar que cubran gastos reales.
- **Usar con mapa**: Facilitar navegación de repartidores.

## Qué hacer si no funciona

Si delivery no carga o hay errores:
1. Verificar plan trial/full.
2. Verificar modo activado.
3. Verificar zonas configuradas.
4. Verificar dirección del cliente.
5. Si persiste, contactar soporte con: negocio, plan, pedido, error.

## Descripción breve para negocios que NO lo tienen activo

El módulo de Delivery permite gestionar pedidos para envío a domicilio con zonas de cobertura, costos variables y seguimiento en tiempo real. Incluye asignación de repartidores y estados de entrega. Disponible en planes trial y full.