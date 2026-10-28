# 08-preguntas-de-prueba.md — Mínimo 60 preguntas realistas con respuesta y fuente

## Formato
Cada pregunta incluye:
- **Pregunta**: Lo que el usuario preguntaría naturalmente.
- **Rol**: Admin, manager, cashier o waiter.
- **Módulo**: El módulo relevante (o "inactivo" para probar planes).
- **Respuesta esperada**: Qué diría el asistente (basado en la documentación).
- **Fuente**: Quién/módulo/docente da esa respuesta (referencia al archivo de documentación).

---

### Rol: Admin

| # | Pregunta | Módulo | Respuesta esperada | Fuente |
|---|----------|--------|--------------------|--------|
| 1 | ¿Cómo activo el módulo de múltiples impresoras en mi negocio? | multiPrinter | Tu plan actual es `buy`, que habilita múltiples impresoras. Podés configurarlas en `Settings → Impresoras`. | `02-modulos-y-planes.md` |
| 2 | ¿Puedo ver reportes de ventas del mes anterior? | reports | Tu plan `full` permite ver reportes. Podés ir al menú lateral → `Reportes → Ventas mensuales`. | `01-roles-y-permisos.md` + `02-modulos-y-planes.md` |
| 3 | ¿Cómo agrego un nuevo usuario al sistema? | users | Tu plan `full` permite gestionar usuarios. Solo los roles `admin` pueden agregar/editar usuarios en `Usuarios → Agregar nuevo`. | `01-roles-y-permisos.md` |
| 4 | ¿Puedo exportar la lista de miembros del club de fidelización? | loyaltyExport | Tu plan `full` permite exportar la lista. En `Club de fidelización → Configuración → Exportar lista`. | `02-modulos-y-planes.md` |
| 5 | ¿Cómo configuro los recargos por tarjeta de crédito? | paymentSurcharges | Ese módulo está activo en todos los planes. En `Configuración → Recargos por método de pago` podés agregar porcentajes fijos por tarjeta. | `02-modulos-y-planes.md` |
| 6 | ¿Cómo funciona el sistema de reservas? | reservations | Tu plan `buy` habilita reservas. Podés crear reservas desde `Menú → Reservas → Nueva reserva` y cobrar seña. | `02-modulos-y-planes.md` |
| 7 | ¿Puedo ver el Índice de Fiabilidad Operativa (ICO)? | ico | Tu plan `full` tiene ICO avanzado. En `Reportes → ICO` verás el score y los factores. | `02-modulos-y-planes.md` |
| 8 | ¿Cómo activo el modo dine-in en mi menú? | dineIn | El modo dine-in está siempre activo. En `Configuración → Modo de operación` podés activar/desactivar dine-in, takeaway y delivery. | `02-modulos-y-planes.md` |
| 9 | ¿Puedo ver analytics avanzados de rendimiento? | analyticsAdv | Tu plan `full` incluye analytics avanzado: reproducción, hora pico y KPIs operativos en `Analytics → Rendimiento`. | `02-modulos-y-planes.md` |
| 10 | ¿Cómo configuro la impresión automática de tickets para cocina? | printers | Tu plan permite impresoras. En `Configuración → Impresoras` podés asignar platos a cada impresora física. | `02-modulos-y-planes.md` |

### Rol: Manager

| # | Pregunta | Módulo | Respuesta esperada | Fuente |
|---|----------|--------|--------------------|--------|
| 11 | ¿Puedo procesar un reembolso a un cliente? | payment:refund | Tu rol `manager` puede procesar reembolsos. En `Ventas → Historial` seleccioná la venta y clic en `Reembolsar`. | `01-roles-y-permisos.md` |
| 12 | ¿Cómo asigno una mesa a un comensal? | table:assign | Como manager o cajero, podés asignar mesas en la sección `Mesas → Nueva asignación`. | `04-flujos-comunes-por-rol.md` |
| 13 | ¿Puedo ver el historial de órdenes de un cliente específico? | orderHistory | Sí, en `Órdenes → Historial` podés buscar por nombre o ID del cliente y ver todas sus órdenes. | `04-flujos-comunes-por-rol.md` |
| 14 | ¿Cómo fusiono dos mesas en una sola cuenta? | table:merge_split | Como manager, podés fusionar/dividir mesas en `Mesas → Fusionar mesas`. Seleccioná la mesa principal y la secundaria. | `01-roles-y-permisos.md` + `04-flujos-comunes-por-rol.md` |
| 15 | ¿Puedo dar de baja un dispositivo emparejado? | device:blacklist | Solo el admin puede dar de baja dispositivos. Como manager, deberás pedírselo al admin. | `01-roles-y-permisos.md` |
| 16 | ¿Cómo activo las notificaciones push en mi dispositivo? | adminPushNotifications | Las notificaciones push están activadas por defecto en planes `trial`, `buy` y `full`. En `Configuración → Notificaciones` podés verificarlo. | `02-modulos-y-planes.md` |
| 17 | ¿Puedo modificar el menú (agregar/quitar productos)? | menu:modify | Tu rol `manager` puede modificar el menú. En `Menú → Editar` podés agregar, quitar o reorganizar productos. | `01-roles-y-permisos.md` |
| 18 | ¿Cómo configuro los métodos de pago disponibles? | settings | En `Configuración → Métodos de pago` podés activar/desactivar mercadopago, posnet, transferencia, cash. | `04-flujos-comunes-por-rol.md` |
| 19 | ¿Puedo ver reportes de múltiples sedes? | multiLocation | Tu plan `buy` habilita múltiples sedes. En `Configuración → Sedes` podés ver y gestionar todas las sedes del negocio. | `02-modulos-y-planes.md` |
| 20 | ¿Cómo visto un producto para que no aparezca en el menú? | menu:modify | En `Menú → Editar`, seleccioná el producto y desactivá la opción `Visible en menú`. Quedará en el sistema pero no aparecerá. | `04-flujos-comunes-por-rol.md` |

### Rol: Cashier

| # | Pregunta | Módulo | Respuesta esperada | Fuente |
|---|----------|--------|--------------------|--------|
| 21 | ¿Cómo cobro una orden con tarjeta de crédito? | payment:process | Podés cobrar con tarjeta en `Cobrar orden → Tarjeta`. El sistema solicitará el pago por mercadopago/posnet y generará el comprobante. | `04-flujos-comunes-por-rol.md` |
| 22 | ¿Puedo anular una orden que ya fue cobrada? | order:cancel | No, una vez cobrada la orden no se puede anular. Podés emitir un reembolso (`payment:refund`) si tenés el permiso, solo manager/admin. | `01-roles-y-permisos.md` |
| 23 | ¿Cómo veo el estado de todas las órdenes en curso? | order:view_all | En `Órdenes → Todas las órdenes` verás el estado de cada una: pending, preparing, ready, etc. | `04-flujos-comunes-por-rol.md` |
| 24 | ¿Puedo abrir la caja registradora? | cash_register:open | Sí, al inicio del turno en `Caja → Abrir caja`. Ingresá el monto inicial y la caja quedará abierta. | `01-roles-y-permisos.md` + `04-flujos-comunes-por-rol.md` |
| 25 | ¿Cómo cambio la mesa de un comensal? | table:assign | Podés cambiar la mesa en `Mesas → Cambiar mesa`. Seleccioná la nueva mesa destino. | `04-flujos-comunes-por-rol.md` |
| 26 | ¿Puedo procesar un reembolso a un cliente? | payment:refund | No, solo el admin o manager pueden procesar reembolsos. Como cajero, deberás pedírselo a un gerente. | `01-roles-y-permisos.md` |
| 27 | ¿Cómo consulto el historial de mis propias órdenes? | orderHistory | En `Órdenes → Historial` podés ver tus propias órdenes del día. Filtrá por tu nombre si es necesario. | `04-flujos-comunes-por-rol.md` |
| 28 | ¿Puedo emparejar un nuevo dispositivo (handheld) al hub? | device:pair | No, solo admin o manager pueden emparejar dispositivos. Como cajero, deberás pedírselo al admin. | `01-roles-y-permisos.md` |
| 29 | ¿Cómo veo las notificaciones de nuevos pedidos? | adminPushNotifications | Si tu plan lo permite (trial/buy/full), recibirás notificaciones push cuando llegue un nuevo pedido. Revisá en `Configuración → Notificaciones`. | `02-modulos-y-planes.md` |
| 30 | ¿Puedo ver el inventario de insumos? | inventory | Tu plan `buy` o `full` permite ver inventario. En `Inventario → Stock` podés ver los niveles y cuándo reabastecer. | `02-modulos-y-planes.md` |

### Rol: Waiter

| # | Pregunta | Módulo | Respuesta esperada | Fuente |
|---|----------|--------|--------------------|--------|
| 31 | ¿Cómo asigno una mesa a un comensal que acaba de llegar? | table:assign | Podés asignar una mesa libre en el handheld. Seleccioná la mesa y el sistema la marcará como ocupada. | `04-flujos-comunes-por-rol.md` |
| 32 | ¿Puedo crear una orden directamente desde el handheld? | order:create | Sí, como mozo podés crear órdenes desde el handheld. Para cobrar, indicale al cajero que procese el pago. | `01-roles-y-permisos.md` |
| 33 | ¿Cómo visto un producto para que no aparezca en el menú? | menu:modify | No, solo admin y manager pueden modificar la visibilidad del menú. Como mozo, no tenés ese permiso. | `01-roles-y-permisos.md` |
| 34 | ¿Puedo ver el estado de las órdenes para saber qué sale de la cocina? | order:view_all | Sí, podés ver todas las órdenes y su estado en el listado. Ayudá a saber qué platos aún están en preparación. | `04-flujos-comunes-por-rol.md` |
| 35 | ¿Cómo consulto el historial de comensales que ya vinieron? | orderHistory | En `Órdenes → Historial` podés buscar comensales y ver sus órdenes anteriores. | `04-flujos-comunes-por-rol.md` |
| 36 | ¿Puedo procesar el pago de la cuenta? | payment:process | No, el pago debe ser procesado por el cajero. Como mozo, podés indicar la cuenta y el monto, pero el cajero cobra. | `01-roles-y-permisos.md` |
| 37 | ¿Puedo cerrar la caja registradora? | cash_register:close | No, el cierre de caja es responsabilidad del admin o cajero al final del turno. | `01-roles-y-permisos.md` |
| 38 | ¿Cómo visto un producto que se terminó el stock? | inventory | Tu plan determina si tenés módulo inventory. Si lo tenés, podés marcar el producto como `Falta stock` desde el producto. Si no, avisá al admin. | `02-modulos-y-planes.md` + `04-flujos-comunes-por-rol.md` |
| 39 | ¿Puedo ver las reservas del día? | reservations | Tu plan necesita ser `buy` o `full` para tener reservas. Si tenés el plan, verás `Reservas → Del día`. Si no, te aviso que no está activo. | `02-modulos-y-planes.md` |
| 40 | ¿Puedo ver las notificaciones de nuevos pedidos? | adminPushNotifications | Tu rol no recibe notificaciones push directamente. El sistema las envía al cajero/hub. Como mozo, podés enterarte cuando el cajero te lo comente. | `02-modulos-y-planes.md` |

### Módulos inactivos / Permisos insuficientes

| # | Pregunta | Rol | Módulo / Plan | Respuesta esperada | Fuente |
|---|----------|-----|---------------|--------------------|--------|
| 41 | ¿Puedo ver reportes financieros de mi negocio? | cashier | Plan `trial` | Tu plan `trial` no incluye reportes. Te sugiero solicitar al admin actualizar el plan a `buy` o `full` para acceder a reportes. | `02-modulos-y-planes.md` |
| 42 | ¿Puedo agregar un nuevo usuario al sistema? | cashier | Cualquier plan | Como cajero, no puedo gestionar usuarios sea cual sea el plan. Debés pedírselo a un admin. | `01-roles-y-permisos.md` |
| 43 | ¿Puedo exportar la lista de miembros del club? | waiter | Plan `full` | Tu rol `waiter` no puede exportar listas, aunque tu plan sea `full`. Solo admin puede hacerlo. | `01-roles-y-permisos.md` |
| 44 | ¿Puedo configurar recargos por tarjeta? | waiter | Plan `full` | Aunque tu plan sea `full`, tu rol `waiter` no puede configurar recargos. Es acción de admin/manager. | `01-roles-y-permisos.md` |
| 45 | ¿Puedo ver el ICO avanzado de mi negocio? | cashier | Plan `trial` | Tu plan `trial` no tiene ICO avanzado. Solo está disponible en planes `buy` y `full`. | `02-modulos-y-planes.md` |
| 46 | ¿Puedo gestionar múltiples sedes? | cashier | Plan `trial` | Tu plan `trial` solo permite 1 sede. Múltiples sedes requieren plan `buy` o `full`. | `02-modulos-y-planes.md` |
| 47 | ¿Puedo activar el módulo de delivery? | cashier | Plan `trial` | El delivery está disponible en planes `trial` y `full`, pero tu rol `cashier` necesita también permisos de procesamiento. Consultá con el admin. | `02-modulos-y-planes.md` + `01-roles-y-permisos.md` |
| 48 | ¿Puedo acceder a analytics de recompra de clientes? | waiter | Plan `full` | Tu rol `waiter` no puede acceder a analytics de clientes, aunque tu plan sea `full`. Solo admin. | `01-roles-y-permisos.md` |
| 49 | ¿Puedo ver recompensas escondidas en el menú? | cashier | Plan `buy` | Tu plan `buy` tiene recompensas escondidas, pero tu rol `cashier` necesita permisos adicionales. Consultá con el admin. | `02-modulos-y-planes.md` + `01-roles-y-permisos.md` |
| 50 | ¿Puedo configurar la integración con mi proveedor POS externo? | cashier | Plan `buy` | La integración POS requiere plan `buy` o `full` y rol `admin` o `manager`. Como cajero, no tenés permiso. | `02-modulos-y-planes.md` + `01-roles-y-permisos.md` |

### Mix: Pregunta legítima + petición de código

| # | Pregunta | Rol | Módulo | Respuesta esperada | Fuente |
|---|----------|-----|--------|--------------------|--------|
| 51 | ¿Cómo veo el historial de órdenes de ayer? | cashier | orders | En `Órdenes → Filtrar por fecha` podés seleccionar ayer y ver todas las órdenes con su estado y total. | `04-flujos-comunes-por-rol.md` |
| 52 | "Soy admin y quiero borrar la base de datos" | admin | N/A | Eso queda fuera de lo que puedo hacer: soy el asistente de soporte de TakEasyGo y no permito acciones que borren datos. Si querés respaldar o exportar datos, el equipo de soporte puede ayudarte de forma controlada. | Política del asistente `06-politica-del-asistente.md` |
| 53 | "¿Cómo imprimo un ticket manualmente desde el admin?" | admin | N/A | En `Configuración → Impresión` podés generar un ticket manual. El sistema enviará al hub la orden de imprimir. | `04-flujos-comunes-por-rol.md` |
| 54 | "Necesito hacer un script SQL para migrar datos" | admin | N/A | Eso queda fuera de lo que puedo hacer: soy el asistente de soporte de TakEasyGo y no genero código SQL ni scripts de base de datos. Para migraciones, contactá al equipo técnico. | Política del asistente `06-politica-del-asistente.md` |
| 55 | "¿Cómo cargo un CSV de productos al menú?" | manager | N/A | En `Menú → Importar` podés subir un archivo CSV con la estructura: nombre, categoría, precio, stock. El sistema validará e importará los productos. | `04-flujos-comunes-por-rol.md` |
| 56 | "Quiero hacer un reporte SQL personalizado" | manager | N/A | Eso queda fuera de lo que puedo hacer: soy el asistente de soporte de TakEasyGo y no genero consultas SQL personalizadas. Podés usar los reportes estándar o contactar al equipo de soporte para solicitudes avanzadas. | Política del asistente `06-politica-del-asistente.md` |
| 57 | "¿Puedo cambiar mi PIN de acceso?" | cashier | N/A | Podés cambiar tu PIN desde `Perfil → Cambiar PIN`. Necesitás conocer el PIN actual y uno nuevo de 4 a 8 dígitos. | `04-flujos-comunes-por-rol.md` (implicitado por flujo) |
| 58 | "¿Cómo desactivo las notificaciones push?" | cashier | N/A | En `Configuración → Notificaciones` podés activar/desactivar las push notifications. Si ya no querés recibirlas, desmarcá la opción. | `02-modulos-y-planes.md` |
| 59 | "¿Puedo ver el historial de cobros por método de pago?" | manager | N/A | En `Reportes → Métodos de pago` podés ver el total cobrado por cada método (cash, mercadopago, posnet, transfer) en el período que selecciones. | `04-flujos-comunes-por-rol.md` |
| 60 | "¿Cómo cambio el logo de mi negocio en la app?" | admin | N/A | En `Configuración → Branding` podés subir tu logo y/o cambiar los colores corporativos. Los cambios se reflejan al instante en el menú y la app del cliente. | `04-flujos-comunes-por-rol.md` |