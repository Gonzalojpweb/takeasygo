# 04-flujos-comunes-por-rol.md — Día a día de cada rol

## Admin — Lo que ve y hace en un día típico

### Apertura de turno

1. **Login** con email y PIN o credentials completas.
2. El sistema asigna el dispositivo: `admin` → `hub` (terminal de caja).
3. Verificar sede (`locationId`) si el negocio tiene múltiples sedes.
4. **Abrir caja** (`cash_register:open`): menú lateral → "Caja" → "Abrir". El sistema solicita el monto inicial. El admin ingresa el monto y la caja queda abierta con estatus `open`.
5. **Configurar métodos de pago** si es necesario (aunque por défaut vienen definidos en la configuración del tenant).

### A lo largo del día

- **Gestión de usuarios**: `user:manage` — agregar, editar o dar de baja usuarios del negocio.
- **Configurar menú**: `menu:modify` — agregar, editar o quitar productos y categorías.
- **Ver reportes**: `reports:view` — menú lateral → "Reportes". Consultar ventas, comparativas mensuales, ICO, etc.
- **Gestión de club de fidelización**: si el plan lo permite (`buy`/`full`), dar de alta miembros, ver puntos, exportar lista (`loyaltyExport`).
- **Configurar recargos**: `paymentSurcharges` — establecer recargos por método de pago (todas las planes).
- **Ver métricas TIA**: si tiene plan `full`, acceder a inteligencia artificial (TIA) — KPIs, señales de anomalía, recomendaciones.
- **Gestión de reservas** (`reservations` si plan `buy`/`full`): crear, modificar, cancelar reservas.
- **Enviar notificaciones push** a él mismo/admin (`adminPushNotifications`): recibo de alerta cuando llega un nuevo pedido.

### Cierre de turno

1. **Cerrar caja** (`cash_register:close`): menú lateral → "Caja" → "Cerrar". El sistema pide verificar el monto esperado vs final, genera el Z Report de forma inmutable y muestra el resumen.
2. **Revisar eventos cash-sale** fallidos: en el panel, si hay eventos con status `failed`, gestionar reintentos.
3. **Logout** del hub dispositivo.

---

## Manager — Lo que ve y hace en un día típico

### Apertura de turno

1. **Login** con email y PIN o credentials.
2. Asignación de dispositivo: `manager` → `hub` (terminal de caja, misma funcionalidad que admin pero con permisos restringidos).
3. Verificar sede.

### A lo largo del día

- **Ver y modificar órdenes**: `order:create`, `order:modify`, `order:cancel` — puede crear órdenes manualmente, modificar estado o cancelar.
- **Procesar pagos** (`payment:process`): cobrar órdenes, procesar pagos con mercadopago, posnet, transferencia, cash.
- **Reembolsos** (`payment:refund`): procesar devoluciones de ventas (solo manager/Admin).
- **Asignar mesas** (`table:assign`): asignar comensales a mesas disponibles.
- **Fusionar/dividir mesas** (`table:merge_split`): combinar mesas o dividir una cuenta.
- **Ver reportes** (`reports:view`): ventas, rendimiento, métricas básicas.
- **Gestión de table assignments** y supervisión de flujo.
- **Configurar recargos** (`paymentSurcharges`): disponible en todos los planes.
- **Ver eventos cash-sale** y reintentarlos si fallaron.
- **Notificaciones push** cuando llegan pedidos nuevos (si el plan lo permite).

### Cierre de turno

1. **Supervisar** que la caja haya sido cerrada por el admin (o solicitarlo si no lo hizo).
2. **Logout** del dispositivo.

---

## Cashier (Cajero) — Lo que ve y hace en un día típico

### Apertura de turno

1. **Login** con PIN o email/password.
2. Asignación de dispositivo: `cashier` → `hub` (terminal de caja).
3. Si el negocio tiene múltiples sedes, el cajero puede no tener `locationId` (legacy single-sede) o elegirla si el sistema se lo permite.

### A lo largo del día

- **Crear orden** (`order:create`): agregar productos del menú, seleccionar mesa, indicar cantidad y forma de pago.
- **Modificar orden** (`order:modify`): agregar o quitar productos, modificar cantidades o notas.
- **Cancelar orden** (`order:cancel`): anular una orden antes de pagada.
- **Ver todas las órdenes** (`order:view_all`): ver el estado de todas las órdenes del local.
- **Procesar pagos** (`payment:process`): cobrar la orden con el método correspondiente (cash, mercadopago, posnet, transfer).
- **Abrir caja** (`cash_register:open`): solo si aún no está abierta (al inicio del turno).
- **Ver productos del menú**: disponibles y con stock.
- **Asignar mesas** (`table:assign`): junto con el mozo.
- **Consultar reportes básicos** — solo si tiene plan que lo permite (`reports:view` requiere `buy`/`full`). En planes inferiores, le indican que pida al admin.
- **Ver historial de órdenes** (`orderHistory`): siempre disponible.

### Restricciones por rol

- **NO puede** gestionar usuarios (`user:manage` — solo admin).
- **NO puede** procesar reembolsos (`payment:refund` — solo admin/manager).
- **NO puede** configurar fiscal (`fiscal:configure` — solo admin).
- **NO puede** emparejar dispositivos (`device:pair` — solo admin/manager).
- **NO puede** dar de baja dispositivos (`device:blacklist` — solo admin).
- **NO puede** cerrar caja si ya fue abierta por otro turno (turno sucesivo).

### Cierre de turno

1. **Cerrar caja** (`cash_register:close`): solo si abrió la caja al inicio del turno. Si el admin ya la cerró, el cajero solo puede verificar el resumen.
2. **Logout** del hub.

---

## Waiter (Mozo) — Lo que ve y hace en un día típico

### Apertura de turno

1. **Login** con PIN o email/password.
2. Asignación de dispositivo: `waiter` → `handheld` (celular/device móvil).
3. El sistema lo empareja automáticamente al hub de la sede.

### A lo largo del día

- **Ver órdenes** (`order:view_all`): ver todas las órdenes del local para conocer el estado de las mesas.
- **Crear órdenes** (`order:create`): crear nuevas órdenes desde el handheld.
- **Modificar órdenes** (`order:modify`): agregar o quitar productos, cambiar cantidades.
- **Asignar mesas** (`table:assign`): asignar un comensal a una mesa libre.
- **Ver menú y productos**: consultar disponibilidad y precios.
- **Ver órdenes por estado**: seguir el progreso de las órdenes desde `pending` hasta `delivered`.
- **No puede** cancelar órdenes (`order:cancel`).
- **No puede** procesar pagos (`payment:process`).
- **No puede** cerrar caja (`cash_register:close`).
- **No puede** emparejar ni dar de baja dispositivos.

### Restricciones

- Puede crear y modificar órdenes, pero no cancelarlas ni cobrarlas.
- Toda acción de pago o cancelación debe ser hecha por un cajero, gerente o admin.
- Si necesita cancelar una orden, debe avisar al cajero/admin.

### Cierre de turno

1. **Logout** del handheld. El dispositivo se desconecta suavemente.
2. No tiene intervención en el cierre de caja (es responsabilidad del admin/cajero).

---

## Kitchen (Cocina) — Lo que ve y hace en un día típico

### Durante el servicio

1. **Ver todas las órdenes** (`order:view_all`): ver el listado completo de órdenes y sus estados.
2. **Filtrar por estado**: ver qué órdenes están `preparing`, `ready`, `en_ruta`, `arrived`, `delivered`.
3. **No puede** crear, modificar ni cancelar órdenes.
4. **No puede** procesar pagos.
5. **No puede** asignar mesas ni interactuar con el frente de casa más allá de ver el estado.

### Restricciones

- Rol de solo lectura para el flujo de órdenes.
- Toda información que necesite compartir con el frente (tiempos, modificaciones) debe comunicarse vía cajero o sistema de tickets.

### Cierre de turno

- Sin acciones propias. El personal de cocina deja de recibir órdenes cuando la caja se cierra y el sistema cambia el estado general.