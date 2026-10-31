---
modulo: multiPrinter
tipo: opcional
roles: [admin, manager]
version_doc: "2026-10-27"
---
# Múltiples Impresoras

## Qué es y para qué sirve
El módulo de múltiples impresoras permite configurar y gestionar varias impresoras en el mismo negocio. Ideal para restaurantes que necesitan imprimir tickets en diferentes estaciones (cocina, bar, postres, etc.).

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Configurar múltiples impresoras, asignar categorías, gestionar todas. | — |
| **manager** | Ver impresoras, asignar categorías. | Configurar conexión de impresoras. |
| **cashier** | — | Gestionar impresoras. |
| **waiter** | — | Gestionar impresoras. |

## Requisitos previos / cómo se activa
- **Plan mínimo**: `buy` (Crecimiento) o `full` (Premium).
- **Rol mínimo**: `admin` (configuración) o `manager` (asignación).
- Por sede: trial/try hasta 2 impresoras (una de comandas y una de caja), buy hasta 3, full hasta 4.

## Paso a paso de las tareas principales

### Agregar segunda impresora (admin)
1. Ir a **Configuración → Impresoras**.
2. Clic en **"+ Nueva impresora"**.
3. Completar datos (nombre, tipo, conexión, puerto/IP).
4. Asignar categorías específicas.
5. Clic en **"Guardar"**.

### Reasignar categorías entre impresoras (admin/manager)
1. Ir a **Configuración → Impresoras**.
2. Seleccionar impresora destino.
3. En **"Categorías asignadas"**, marcar categorías a mover.
4. Desasignar de impresora anterior si es necesario.
5. Clic en **"Guardar"**.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Nombre** | Identificador de cada impresora. |
| **Tipo** | Impresora térmica (ESC/POS). Sin soporte de controladores fiscales. |
| **Conexión** | Serial, USB o TCP. |
| **Puerto/IP** | Dirección de conexión. |
| **Categorías** | Qué productos imprime cada impresora. |

## Reglas de negocio y límites

- **Plan buy/full**: Requerido.
- **Límite por plan**: Por sede: trial/try hasta 2 impresoras (una de comandas y una de caja), buy hasta 3, full hasta 4.
- **Categorías únicas**: Una categoría solo puede estar en una impresora.
- **Tope**: el sistema no deja activar más impresoras que las del plan (por sede).

## Relación con otros módulos

- **printers**: Módulo base de impresoras.
- **menu**: Categorías de productos se asignan.
- **settings**: Configuración general.
- **orders**: Impresión automática al confirmar.

## Preguntas frecuentes

1. **¿Cómo agrego una segunda impresora?**
   → Configuración → Impresoras → "+ Nueva" → completar datos → guardar.

2. **¿Puedo imprimir platos en una y bebidas en otra?**
   → Sí, asignar categorías "Platos" a impresora 1 y "Bebidas" a impresora 2.

3. **¿Cuántas impresoras puedo tener?**
   → No hay límite técnico. Depende del plan (buy/full para múltiples).

4. **¿Puedo cambiar qué categoría va a cada impresora?**
   → Sí, en Configuración → Impresoras → reasignar categorías.

5. **¿Qué pasa si una impresora falla?**
   → El sistema intentará reintentar. Puedes reasignar categorías temporalmente.

6. **¿Puedo tener impresora fiscal y térmica juntas?**
   → No: TakeasyGo todavía no se conecta con controladores fiscales homologados. La factura electrónica (ARCA) se imprime en la impresora térmica de caja.

7. **¿Los managers pueden agregar impresoras?**
   → No, solo admin configura impresoras.

8. **¿Puedo imprimir un ticket en todas las impresoras?**
   → No, cada ticket va a la impresora asignada a su categoría.

9. **¿Cómo pruebo que ambas impriman?**
   → Probar cada impresora individualmente desde Configuración.

10. **¿Puedo desactivar una impresora sin borrarla?**
    → Sí, seleccionar → "Desactivar".

## Errores y mensajes comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `Plan limit: max 1 printer` | Plan trial/try. | Actualizar plan a buy/full. |
| `Category already assigned` | Categoría en otra impresora. | Desasignar primero. |
| `Printer connection failed` | Impresora no responde. | Verificar conexión. |
| `Insufficient permissions` | Rol sin permiso. | Pedir a admin. |

## Recomendaciones y buenas prácticas

- **Asignar por estación**: Cocina, bar, postres en impresoras separadas.
- **Probar cada impresora**: Verificar antes de operar.
- **Mantener IPs estáticas**: Para impresoras TCP.
- **Documentar asignaciones**: Anotar qué categoría va en cada impresora.
- **Tener repuestos**: Papel para cada impresora.

## Qué hacer si no funciona

Si no puedes agregar impresoras o asignar categorías:
1. Verificar plan buy/full.
2. Verificar permisos admin.
3. Verificar conexiones.
4. Si persiste, contactar soporte con: negocio, impresoras, configuración, error.

## Descripción breve para negocios que NO lo tienen activo

El módulo de múltiples impresoras permite configurar varias impresoras en el negocio para imprimir tickets en diferentes estaciones (cocina, bar, etc.). Es ideal para restaurantes con múltiples estaciones de preparación. Disponible desde plan Crecimiento (buy) o Premium (full).