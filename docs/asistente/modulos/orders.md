---
modulo: orders
tipo: siempre_activo
roles: [admin, manager, cashier, waiter]
version_doc: "2026-10-27"
---
# Órdenes

## Qué es y para qué sirve
El módulo de órdenes gestiona todos los pedidos del negocio: desde que un cliente realiza un pedido online o presencial hasta que se entrega. Permite crear, modificar, cancelar, cobrar y hacer seguimiento del estado de cada orden en tiempo real.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Crear, modificar, cancelar, cobrar, ver todas las órdenes, gestionar estados. | — |
| **manager** | Crear, modificar, cancelar, cobrar, ver todas las órdenes, gestionar estados. | — |
| **cashier** | Crear, modificar, cancelar, cobrar, ver todas las órdenes, gestionar estados. | — |
| **waiter** | Ver todas las órdenes, crear y modificar órdenes, asignar mesas a órdenes. | Cancelar órdenes ni procesar pagos. |
| **kitchen** | Ver todas las órdenes (para preparar platos). | Crear, modificar, cancelar o cobrar órdenes. |

## Requisitos previos / cómo se activa
No requiere activación. Siempre activo en planes `trial`, `try`, `buy`, `full`. Bloqueado en plan `anfitrion`.

## Paso a paso de las tareas principales

### Crear una orden (admin/manager/cashier)
1. Ir a **Menú lateral → Órdenes → Nueva orden**.
2. Seleccionar **Mesa** (si aplica) o indicar "Para llevar".
3. Agregar productos al carrito:
   - Buscar producto por nombre o categoría.
   - Clic en el producto para agregarlo.
   - Modificar cantidad si es necesario.
   - Seleccionar modificadores (si el producto los tiene).
   - Agregar notas especiales (si aplica).
4. Verificar **Total** de la orden.
5. Seleccionar **Método de pago**: cash, mercadopago, posnet_debit, posnet_credit, kripton, transfer.
6. Clic en **"Cobrar"** para procesar el pago.
7. La orden queda en estado `pending` y se envía a cocina.

### Modificar una orden en curso (admin/manager/cashier)
1. Ir a **Menú lateral → Órdenes → En curso**.
2. Buscar la orden por número o mesa.
3. Clic en **"Editar"**.
4. Realizar cambios (agregar/quitar productos, modificar cantidad, cambiar notas).
5. Clic en **"Guardar"**.
6. El sistema notifica a cocina de los cambios.

### Cancelar una orden (admin/manager/cashier)
1. Ir a **Menú lateral → Órdenes → En curso**.
2. Buscar la orden.
3. Clic en **"Cancelar"**.
4. Confirmar la cancelación con motivo (opcional).
5. La orden pasa a estado `cancelled`.
6. Si ya se cobró, se genera devolución automática.

### Cobrar una orden (admin/manager/cashier)
1. Ir a **Menú lateral → Órdenes → En curso**.
2. Seleccionar la orden.
3. Clic en **"Cobrar"**.
4. Seleccionar método de pago.
5. Si es efectivo: ingresar monto recibido, el sistema calcula vuelto.
6. Si es tarjeta: procesar en terminal posnet/mercadopago.
7. Si es transferencia: generar datos de cuenta para transferir.
8. Confirmar cobro.
9. La orden pasa a estado `confirmed` y se notifica a cocina.

### Ver historial de órdenes (todos los roles)
1. Ir a **Menú lateral → Órdenes → Historial**.
2. Filtrar por:
   - Fecha (día, semana, mes, rango personalizado).
   - Estado (pending, confirmed, preparing, ready, en_ruta, arrived, delivered, cancelled).
   - Método de pago.
   - Mesa.
   - Número de orden.
3. Ver detalle de cada orden clickeando en ella.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Métodos de pago habilitados** | Define qué métodos de pago acepta el negocio (cash, mercadopago, posnet, transfer, kripton). |
| **Recargos por método** | Porcentaje o monto fijo de recargo por usar tarjeta, débito, etc. |
| **Timeout de orden** | Tiempo antes de que una orden no cobrada se cancele automáticamente (transfer: 24h, MP/kripton: 10 min). |
| **Impresión automática** | Imprime ticket de cocina automáticamente al confirmar orden. |
| **Modos de pedido** | Habilitar/deshabilitar dine-in, takeaway, delivery, business. |
| **Canales de venta** | counter (presencial) o takeasygo (online/app). |

## Reglas de negocio y límites

- **Estados de orden**: `pending` → `confirmed` → `preparing` → `ready` → `en_ruta` → `arrived` → `delivered`. También puede ir a `cancelled`.
- **Timeout automático**: 
  - Transferencia bancaria: 24 horas para pagar.
  - MercadoPago/Kripton: 10 minutos para pagar.
  - Si no se paga a tiempo, la orden se cancela automáticamente.
- **Anulación**: Solo admin y manager pueden procesar reembolsos (`payment:refund`).
- **Multi-sede**: Cada orden pertenece a una sede específica.
- **Idempotencia**: El sistema evita duplicados de órdenes por el unique index en (orderId, tenantId).
- **Offline**: Si el POS pierde conexión, las órdenes se guardan localmente y se sincronizan al reconectar.
- **Compliance/SLA**: El sistema monitorea tiempos de respuesta y genera alertas si una orden tarda demasiado en cambiar de estado.

## Relación con otros módulos

- **menu**: Las órdenes se crean con productos del menú.
- **cash-sale**: Cuando se confirma el pago, se genera un evento cash-sale para notificar al POS.
- **inventory**: Al confirmar orden, se descuenta stock de ingredientes (si inventory activo).
- **reports**: Las órdenes alimentan los reportes de ventas, ICO, etc.
- **printers**: Cada orden puede imprimir tickets en impresoras asignadas.
- **dineIn**: Los pedidos dine-in incluyen mesa y comensales.
- **delivery**: Las órdenes delivery incluyen dirección y costo de envío.
- **reservations**: Las reservas pueden generar órdenes asociadas.
- **loyaltyClub**: Los puntos se acumulan al pagar órdenes.

## Preguntas frecuentes

1. **¿Cómo veo todas las órdenes del día?**
   → Ir a Órdenes → Historial, filtrar por fecha de hoy.

2. **¿Puedo modificar una orden que ya se envió a cocina?**
   → Sí, pero cocina recibirá notificación de los cambios. Ir a Órdenes → En curso → Editar.

3. **¿Qué hago si un cliente quiere cancelar después de pagar?**
   → Como admin/manager, ir a la orden → Cancelar. El sistema generará devolución automática.

4. **¿Cómo cobro una orden con transferencia bancaria?**
   → Seleccionar método "transfer". El sistema muestra los datos de cuenta. El cliente transfiere y sube comprobante. El timeout es de 24 horas.

5. **¿Puedo ver qué órdenes están en la cocina ahora?**
   → Sí, en Órdenes → En curso, filtrar por estado "preparing".

6. **¿Cómo sé si una orden está lista para entregar?**
   → El estado cambia a "ready" cuando cocina termina. Aparece en notificaciones push si el plan lo permite.

7. **¿Puedo crear una orden sin cobrarla aún?**
   → Sí, la orden queda en estado "pending" hasta que se cobre. Hay timeout automático.

8. **¿Qué pasa si el cliente no paga en el tiempo límite?**
   → La orden se cancela automáticamente según el timeout configurado.

9. **¿Puedo imprimir el ticket de una orden manualmente?**
   → Sí, desde la orden → Imprimir ticket.

10. **¿Cómo veo el total de ventas del día?**
    → Ir a Reportes → Ventas del día (requiere plan buy/full y rol admin/manager).

## Errores y mensajes comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `Order not found` | La orden no existe o ID incorrecto. | Verificar número de orden y negocio. |
| `status required` | Falta el campo status al actualizar. | Incluir status en la petición. |
| `Order already cancelled` | Intento de modificar orden cancelada. | No se puede modificar orden cancelada. Crear nueva si es necesario. |
| `Payment method not enabled` | El método de pago no está habilitado en configuración. | Habilitar el método en Configuración → Métodos de pago. |
| `Insufficient permissions for refund` | Rol sin permiso `payment:refund`. | Pedir a admin/manager que procese el reembolso. |
| `Timeout exceeded` | Se superó el tiempo de pago de la orden. | La orden se canceló automáticamente. Crear nueva si el cliente aún quiere. |
| `Location not active` | La sede de la orden ya no está activa. | Verificar sede o contactar admin. |

## Recomendaciones y buenas prácticas

- **Revisar órdenes pendientes regularmente**: No dejar órdenes en "pending" por mucho tiempo.
- **Actualizar estados promptly**: Mantener estados actualizados para mejor seguimiento.
- **Usar notas especiales**: Anotar alergias, preferencias, o instrucciones especiales del cliente.
- **Cobrar rápido**: Reducir tiempo de espera mejora experiencia del cliente.
- **Revisar historial al final del día**: Verificar que todas las órdenes estén en estado correcto.
- **Configurar timeouts adecuados**: Ajustar según volumen del negocio.

## Qué hacer si no funciona

Si las órdenes no aparecen, no se pueden crear, o hay errores:
1. Verificar conexión a internet.
2. Recargar página.
3. Verificar que el menú tenga productos disponibles.
4. Verificar método de pago habilitado.
5. Si persiste, contactar soporte con: negocio, rol, qué intentó hacer, mensaje de error exacto.

## Descripción breve para negocios que NO lo tienen activo

El módulo de órdenes permite recibir, gestionar y hacer seguimiento de todos los pedidos del negocio en tiempo real. Incluye creación, modificación, cobro, cancelación y estados de cada orden. Es esencial para operar el restaurante. Está activo por defecto en todos los planes excepto `anfitrion`.