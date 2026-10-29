---
modulo: printers
tipo: opcional
roles: [admin, manager]
version_doc: "2026-10-27"
---
# Impresoras

## Qué es y para qué sirve
El módulo de impresoras gestiona las impresoras térmicas y fiscales del negocio. Permite configurar conexiones, asignar categorías de productos a cada impresora y controlar la impresión automática de tickets para cocina, bar y comprobantes fiscales.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Configurar impresoras, asignar categorías, probar conexión, gestionar múltiples impresoras. | — |
| **manager** | Ver impresoras, asignar categorías (si multiPrinter habilitado). | Configurar conexión o gestionar impresoras (solo admin en algunos casos). |
| **cashier** | — | Configurar impresoras. |
| **waiter** | — | Configurar impresoras. |

## Requisitos previos / cómo se activa
- **Plan mínimo**: `trial`. Por sede: trial/try hasta 2 impresoras (una de comandas y una de caja), buy hasta 3, full hasta 4.
- **Rol mínimo**: `admin` (configuración) o `manager` (asignación de categorías).
- Por sede: trial/try hasta 2 impresoras (una de comandas y una de caja), buy hasta 3, full hasta 4.

## Paso a paso de las tareas principales

### Agregar una impresora (admin)
1. Ir a **Menú lateral → Configuración → Impresoras**.
2. Clic en **"+ Nueva impresora"**.
3. Completar campos:
   - **Nombre**: ej. "Impresora Cocina Principal".
   - **Tipo**: Térmica o Fiscal.
   - **Conexión**: Serial, USB o TCP.
   - **Puerto/IP**: según tipo de conexión.
     - Serial: `COM1`, `COM2`, etc.
     - USB: puerto USB detectado.
     - TCP: dirección IP (ej. `192.168.1.100`).
   - **Modelo**: modelo específico de la impresora.
4. Clic en **"Guardar"**.
5. Clic en **"Probar conexión"** para verificar.

### Asignar categorías a una impresora (admin/manager)
1. Ir a **Configuración → Impresoras**.
2. Seleccionar la impresora.
3. En **"Categorías asignadas"**, marcar las categorías que debe imprimir.
   - Ej: "Platos principales" → Impresora Cocina.
   - Ej: "Bebidas" → Impresora Bar.
4. Clic en **"Guardar"**.

### Probar impresora (admin)
1. Ir a **Configuración → Impresoras**.
2. Seleccionar impresora.
3. Clic en **"Probar"**.
4. Imprimir página de prueba.

### Desactivar impresora (admin)
1. Ir a **Configuración → Impresoras**.
2. Seleccionar impresora.
3. Clic en **"Desactivar"**.
4. Confirmar.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Nombre** | Identificador visible de la impresora. |
| **Tipo** | Térmica (tickets cocina/bar) o Fiscal (comprobantes AFIP). |
| **Conexión** | Serial, USB o TCP (red). |
| **Puerto/IP** | Dirección de conexión específica. |
| **Modelo** | Modelo de impresora para driver específico. |
| **Categorías asignadas** | Qué categorías de productos imprime cada impresora. |
| **Estado** | Activa o inactiva. |
| **Prueba** | Imprimir página de prueba para verificar conexión. |

## Reglas de negocio y límites

- **Límite por plan**: Por sede: trial/try hasta 2 impresoras (una de comandas y una de caja), buy hasta 3, full hasta 4. Si llegás al tope, desactivá una impresora o pasá a un plan superior.
- **buy/full**: Múltiples impresoras (`multiPrinter`).
- **Fiscal driver**: Requiere plan `full` para configuración avanzada.
- **Conexión TCP**: Requiere que la impresora esté en la misma red.
- **Categorías duplicadas**: Una categoría solo puede estar asignada a una impresora a la vez.
- **Offline**: Si la impresora no responde, el sistema intentará reintentar.

## Relación con otros módulos

- **settings**: Las impresoras se configuran desde Configuración.
- **menu**: Las categorías de productos se asignan a impresoras.
- **orders**: Al confirmar orden, se imprime en impresora asignada.
- **fiscal**: Impresora fiscal para comprobantes AFIP.
- **multiPrinter**: Módulo que habilita múltiples impresoras (plan buy/full).

## Preguntas frecuentes

1. **¿Cómo agrego una impresora de cocina?**
   → Configuración → Impresoras → "+ Nueva" → tipo Térmica → conexión USB → guardar → probar.

2. **¿Puedo tener dos impresoras para la misma categoría?**
   → No, cada categoría se asigna a una sola impresora. Puedes crear una categoría duplicada si necesitas dos impresoras.

3. **¿Cómo asigno la impresora fiscal?**
   → Configuración → Impresoras → "+ Nueva" → tipo Fiscal → configurar driver WSFE o impresora fiscal.

4. **¿Qué hago si la impresora no imprime?**
   → Verificar conexión, probar impresora, reiniciar. Si persiste, contactar soporte.

5. **¿Puedo desactivar una impresora temporalmente?**
   → Sí, en Configuración → Impresoras → seleccionar → "Desactivar".

6. **¿Cómo cambio la impresora asignada a una categoría?**
   → Configuración → Impresoras → seleccionar impresora → cambiar categorías → guardar.

7. **¿Cuántas impresoras puedo tener?**
   → Por sede: trial/try hasta 2 impresoras (una de comandas y una de caja), buy hasta 3, full hasta 4.

8. **¿Puedo imprimir un ticket manualmente?**
   → Sí, desde la orden → Imprimir ticket.

9. **¿Cómo configuro la impresora por TCP/IP?**
   → Seleccionar conexión TCP, ingresar dirección IP de la impresora en la red.

10. **¿Qué pasa si cambió la IP de la impresora?**
    → Actualizar la IP en Configuración → Impresoras → editar → guardar.

## Errores y mensajes comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `Printer connection failed` | Impresora no responde. | Verificar conexión física/puerto. |
| `Invalid port` | Puerto incorrecto. | Verificar puerto correcto (COM, USB, IP). |
| `Printer already exists` | Nombre duplicado. | Cambiar nombre de impresora. |
| `Category already assigned` | Categoría ya en otra impresora. | Desasignar de la anterior primero. |
| `Plan limit: max 1 printer` | Plan trial/try. | Actualizar plan a buy/full. |
| `Insufficient permissions` | Rol sin permiso. | Pedir a admin que configure. |

## Recomendaciones y buenas prácticas

- **Probar antes de operar**: Verificar impresora antes del primer servicio.
- **Asignar categorías lógicamente**: Cocina para platos, bar para bebidas.
- **Mantener IP estática**: Para impresoras TCP, asignar IP fija en router.
- **Tener repuesto de papel**: Evitar interrupciones por falta de rollo.
- **Documentar configuración**: Anotar IP, puerto, modelo de cada impresora.
- **Revisar conexiones diariamente**: Asegurar que impriman correctamente.

## Qué hacer si no funciona

Si la impresora no conecta, no imprime, o hay errores:
1. Verificar conexión física (cable, encendido).
2. Verificar puerto/IP configurado.
3. Probar impresora desde configuración.
4. Reiniciar impresora.
5. Verificar que esté en la misma red (si TCP).
6. Si persiste, contactar soporte con: negocio, impresora, modelo, conexión, mensaje de error exacto.

## Descripción breve para negocios que NO lo tienen activo

El módulo de impresoras gestiona las impresoras térmicas y fiscales del negocio, permitiendo imprimir tickets de cocina, bar y comprobantes automáticamente al confirmar pedidos. Es esencial para operar con control de preparación. Por sede: trial/try hasta 2 impresoras (una de comandas y una de caja), buy hasta 3, full hasta 4.