---
modulo: dineIn
tipo: siempre_activo
roles: [admin, manager, cashier, waiter]
version_doc: "2026-10-27"
---
# Dine-In (Consumo en el Local)

## Qué es y para qué sirve
El módulo Dine-In permite gestionar pedidos para consumo en el local. Los clientes ven el menú digital en su celular y hacen pedidos desde su mesa, sin necesidad de un camarero. Ideal para restaurantes que quieren agilizar el servicio.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Configurar modo dine-in, gestionar mesas, ver reportes. | — |
| **manager** | Gestionar mesas, ver órdenes dine-in, asistir a clientes. | Configurar modo (en algunos casos). |
| **cashier** | Cobrar órdenes dine-in, ver estado de mesas. | Configurar modo. |
| **waiter** | Asignar mesas, ver órdenes dine-in. | Cobrar órdenes. |

## Requisitos previos / cómo se activa
- **Plan mínimo**: Todos (`trial`, `try`, `buy`, `full`, `anfitrion`).
- **Rol mínimo**: Todos pueden ver; `admin/manager` configuran.
- Se activa en Configuración → Modo de operación → Dine-in.

## Paso a paso de las tareas principales

### Activar modo dine-in (admin/manager)
1. Ir a **Configuración → Modo de operación**.
2. Activar **"Dine-in"**.
3. Configurar opciones (si aplica):
   - **QR por mesa**: Generar código QR único para cada mesa.
   - **Tiempo de sesión**: Cuánto dura la sesión del cliente en la mesa.
4. Clic en **"Guardar"**.

### Cliente hace pedido dine-in
1. Escanea QR de su mesa (o ingresa a la URL del menú).
2. Ve menú digital con productos disponibles.
3. Agrega productos al carrito.
4. Confirma pedido.
5. El sistema notifica al restaurante.
6. La orden aparece en el POS como dine-in.

### Gestionar mesas (admin/manager)
1. Ir a **Menú lateral → Mesas**.
2. Ver estado de cada mesa:
   - Libre.
   - Ocupada (con orden activa).
   - Reservada.
3. Asignar comensales a mesas.
4. Liberar mesa al finalizar.

### Ver órdenes dine-in (todos los roles)
1. Ir a **Órdenes → En curso**.
2. Filtrar por **Modo: Dine-in**.
3. Ver estado de cada orden.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Activar/Dine-in** | Habilita o deshabilita pedidos para consumo en local. |
| **QR por mesa** | Genera código QR único para cada mesa. |
| **Tiempo de sesión** | Duración de la sesión del cliente en la mesa. |
| **Menú visible** | Qué productos se muestran en modo dine-in. |

## Reglas de negocio y límites

- **Siempre activo**: Disponible en todos los planes.
- **Multi-sede**: Cada sede puede configurar dine-in independientemente.
- **Mesas obligatorias**: Las órdenes dine-in requieren mesa asignada.
- **Sin límite de comensales**: No hay máximo definido por mesa.
- **Idempotencia**: Evita duplicados de pedidos.

## Relación con otros módulos

- **orders**: Las órdenes dine-in son un tipo de orden.
- **menu**: El menú digital se muestra al cliente.
- **mesas**: Gestión de mesas y comensales.
- **printers**: Impresión de tickets de cocina al confirmar.
- **delivery**: Complementa con pedidos a domicilio.
- **takeaway**: Complementa con pedidos para llevar.

## Preguntas frecuentes

1. **¿Cómo activo dine-in?**
   → Configuración → Modo de operación → activar Dine-in → guardar.

2. **¿Cómo hacen pedidos los clientes?**
   → Escanean QR de mesa o ingresan a la URL del menú.

3. **¿Puedo tener dine-in y takeaway juntos?**
   → Sí, pueden estar activos simultáneamente.

4. **¿Los camareros ven las órdenes dine-in?**
   → Sí, en Órdenes → filtrar por dine-in.

5. **¿Puedo limitar la cantidad de comensales por mesa?**
   → No hay límite definido en el código.

6. **¿Cómo libero una mesa?**
   → En Mesas, seleccionar mesa ocupada → "Liberar".

7. **¿Los clientes pueden personalizar productos?**
   → Sí, si el producto tiene modificadores configurados.

8. **¿Puedo ver qué mesas están ocupadas?**
   → Sí, en Mesas, ver estado de cada una.

9. **¿El sistema imprime automáticamente?**
   → Sí, al confirmar pedido dine-in, imprime en impresora asignada.

10. **¿Puedo cambiar la URL del menú?**
    → La URL se genera automáticamente según el slug del negocio.

## Errores y mensajes comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `Dine-in not enabled` | Modo desactivado. | Activar en Configuración → Modo. |
| `Table required for dine-in` | Sin mesa asignada. | Asignar mesa al pedido. |
| `QR not generated` | QR no disponible. | Regenerar QR de mesa. |
| `Menu not visible` | Menú no configurado para dine-in. | Verificar menú y visibilidad. |

## Recomendaciones y buenas prácticas

- **Colocar QRs visibles**: En cada mesa, fácil de escanear.
- **Mantener menú actualizado**: Productos y precios al día.
- **Entrenar al personal**: Que sepan asistir a clientes con dudas.
- **Revisar mesas**: Liberar mesas al finalizar servicio.
- **Promocionar**: Informar a clientes sobre la opción dine-in.

## Qué hacer si no funciona

Si dine-in no carga o hay errores:
1. Verificar modo activado en configuración.
2. Verificar menú visible y con productos.
3. Verificar QR de mesa generado.
4. Verificar conexión a internet.
5. Si persiste, contactar soporte con: negocio, mesa, mensaje de error.

## Descripción breve para negocios que NO lo tienen activo

El módulo Dine-In permite a los clientes hacer pedidos desde su mesa escaneando un QR, agilizando el servicio sin necesidad de camareros. Ideal para restaurantes que quieren modernizar la experiencia. Disponible en todos los planes.