---
modulo: settings
tipo: siempre_activo
roles: [admin, manager]
version_doc: "2026-10-27"
---
# Configuración

## Qué es y para qué sirve
El módulo de configuración es el panel de control central del negocio. Permite definir parámetros generales como métodos de pago, recargos, zona horaria, moneda, notificaciones, impresoras, sedes y otras opciones que afectan el funcionamiento de toda la plataforma.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Ver y modificar todas las configuraciones del negocio. | — |
| **manager** | Ver configuraciones, modificar métodos de pago, recargos, notificaciones. | Modificar configuración fiscal avanzada (solo admin). |
| **cashier** | Ver configuraciones básicas (métodos de pago habilitados). | Modificar cualquier configuración. |
| **waiter** | Ver configuraciones mínimas (si las necesita para operar). | Modificar cualquier configuración. |

## Requisitos previos / cómo se activa
No requiere activación. Siempre activo en todos los planes. Trial/try limitan a 1 ubicación.

## Paso a paso de las tareas principales

### Acceder a configuración (admin/manager)
1. Ir al **menú lateral → Configuración**.
2. Seleccionar la sección a modificar.

### Configurar métodos de pago (admin/manager)
1. Ir a **Configuración → Métodos de pago**.
2. Activar/desactivar cada método:
   - **Efectivo** (`cash`)
   - **MercadoPago** (`mercadopago`)
   - **POSNET Débito** (`posnet_debit`)
   - **POSNET Crédito** (`posnet_credit`)
   - **Kripton** (`kripton`)
   - **Transferencia** (`transfer`)
3. Clic en **"Guardar"**.

### Configurar recargos por método de pago (admin/manager)
1. Ir a **Configuración → Recargos por método de pago**.
2. Para cada método habilitado, definir:
   - **Porcentaje**: ej. `2.5` para 2.5% de recargo.
   - **Monto fijo**: ej. `$500` de recargo fijo.
3. Clic en **"Guardar"**.

### Configurar notificaciones push (admin/manager)
1. Ir a **Configuración → Notificaciones**.
2. Activar/desactivar notificaciones push al admin para nuevos pedidos.
3. Clic en **"Guardar"**.

### Configurar zona horaria y moneda (admin)
1. Ir a **Configuración → General**.
2. Seleccionar **Zona horaria** (ej. `America/Argentina/Buenos_Aires`).
3. Seleccionar **Moneda** (ej. `ARS`).
4. Clic en **"Guardar"**.

### Configurar branding (admin)
1. Ir a **Configuración → Branding**.
2. Subir **Logo** del negocio.
3. Cambiar **Colores corporativos**.
4. Clic en **"Guardar"**.

### Configurar impresoras (admin/manager)
1. Ir a **Configuración → Impresoras**.
2. Agregar impresora:
   - **Nombre**: ej. "Impresora Cocina".
   - **Tipo**: impresora térmica (ESC/POS).
   - **Conexión**: Serial, USB o TCP.
   - **Puerto/IP**: según conexión.
3. Asignar categorías de productos a cada impresora.
4. Clic en **"Guardar"**.

### Configurar modo de operación (admin/manager)
1. Ir a **Configuración → Modo de operación**.
2. Activar/desactivar:
   - **Dine-in** (consumo en el local)
   - **Takeaway** (para llevar)
   - **Delivery** (envío a domicilio)
   - **Business** (venta corporativa)
3. Clic en **"Guardar"**.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Métodos de pago** | Define qué formas de pago acepta el negocio. |
| **Recargos por método** | Porcentaje o monto fijo de recargo por usar cada método. |
| **Zona horaria** | Hora local del negocio para mostrar en reportes y tickets. |
| **Moneda** | Moneda de referencia (ARS, USD, etc.). |
| **Notificaciones push** | Alertas al admin cuando llega un pedido nuevo. |
| **Impresoras** | Configuración de impresoras térmicas y fiscales. |
| **Asignación de impresoras** | Qué categorías de productos se imprimen en cada impresora. |
| **Modo de operación** | Habilita/deshabilita dine-in, takeaway, delivery, business. |
| **Branding** | Logo, colores y nombre visual del negocio. |
| **Timeout offline** | Tiempo antes de cancelar orden no pagada (segundos). |
| **Sedes/Ubicaciones** | Gestión de múltiples sedes (si plan lo permite). |

## Reglas de negocio y límites

- **Trial/try**: Máximo 1 ubicación/sede.
- **buy/full**: Múltiples sedes permitidas (`multiLocation`).
- **Fiscal config**: Requiere rol admin. Solo plan `full` tiene configuración avanzada (`fiscal:configure`).
- **Recargos**: Aplican automáticamente al cobrar según método seleccionado.
- **Timeout offline**: Por defecto 180 segundos (3 minutos). Configurable.
- **Multi-tenant**: Cada negocio tiene su propia configuración aislada.

## Relación con otros módulos

- **orders**: Los métodos de pago y recargos afectan el cobro de órdenes.
- **printers**: La configuración de impresoras define dónde se imprimen tickets.
- **multiLocation**: La configuración de sedes depende de este módulo.
- **paymentSurcharges**: Sub-módulo de configuración para recargos.
- **transferPayment**: Configuración de datos de cuenta para transferencias.
- **adminPushNotifications**: Configuración de notificaciones push.
- **fiscal**: Configuración de facturación (driver, certificados AFIP).

## Preguntas frecuentes

1. **¿Cómo cambio el logo de mi negocio?**
   → Configuración → Branding → subir nueva imagen.

2. **¿Puedo habilitar solo efectivo y transferencia?**
   → Sí, en Métodos de pago, desactivar los demás y dejar solo efectivo y transferencia.

3. **¿Cómo agrego un recargo por tarjeta de crédito?**
   → Configuración → Recargos → Tarjeta Crédito → ingresar porcentaje (ej. 2.5%).

4. **¿Puedo cambiar la zona horaria?**
   → Sí, en Configuración → General → Zona horaria. Solo admin.

5. **¿Cómo configuro la impresora de cocina?**
   → Configuración → Impresoras → "+ Nueva" → tipo Térmica → asignar categorías.

6. **¿Puedo activar solo dine-in sin delivery?**
   → Sí, en Modo de operación, activar dine-in y desactivar delivery.

7. **¿Cómo veo qué método de pago tiene más ventas?**
   → En Reportes → Métodos de pago (requiere plan buy/full).

8. **¿Puedo cambiar el nombre visible del negocio?**
   → Sí, en Configuración → General → Nombre del negocio.

9. **¿Cómo hago que lleguen alertas de pedidos al celular?**
   → Configuración → Notificaciones → activar Push notifications (disponible en trial/buy/full).

10. **¿Puedo configurar dos impresoras para la misma categoría?**
    → Sí, asignar la categoría a ambas impresoras en Configuración → Impresoras.

## Errores y mensajes comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `Insufficient permissions for fiscal:configure` | Rol no admin intentando configurar fiscal. | Pedir al admin que configure fiscal. |
| `Location limit reached` | Plan trial/try con 1 sede ya creada. | Actualizar plan a buy/full para múltiples sedes. |
| `Printer connection failed` | Impresora no responde. | Verificar conexión física/puerto. |
| `Invalid timezone` | Zona horaria no reconocida. | Seleccionar de la lista desplegable. |
| `Surcharge must be positive` | Recargo ingresado como negativo. | Ingresar valor positivo (ej. 2.5 para 2.5%). |
| `Plan does not allow multiLocation` | Plan sin acceso a múltiples sedes. | Actualizar plan a buy/full. |

## Recomendaciones y buenas prácticas

- **Revisar configuración mensualmente**: Asegurar que métodos de pago y recargos estén actualizados.
- **Mantener branding actualizado**: Logo y colores profesionales generan confianza.
- **Configurar impresoras antes de operar**: Verificar que funcionen antes del primer servicio.
- **Usar zona horaria correcta**: Evita confusiones en reportes y tickets.
- **Revisar notificaciones**: Asegurar que lleguen al dispositivo correcto.
- **Documentar configuración**: Mantener registro de qué se configuró y cuándo.

## Qué hacer si no funciona

Si la configuración no guarda, no carga, o hay errores:
1. Verificar conexión a internet.
2. Recargar página.
3. Verificar permisos del rol (solo admin/manager pueden modificar).
4. Verificar plan activo para módulos específicos.
5. Si persiste, contactar soporte con: negocio, rol, qué configuró, mensaje de error exacto.

## Descripción breve para negocios que NO lo tienen activo

El módulo de configuración es el panel central donde se definen métodos de pago, recargos, impresoras, notificaciones y opciones generales del negocio. Es esencial para personalizar cómo opera la plataforma según las necesidades del restaurante. Está activo por defecto en todos los planes.