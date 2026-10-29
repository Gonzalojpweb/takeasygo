---
modulo: inventory
tipo: opcional
roles: [admin, manager]
version_doc: "2026-10-27"
---
# Inventario (Insumos y Recetas)

## Qué es y para qué sirve
El módulo de Inventario permite controlar los insumos, recetas y consumo de ingredientes por venta. Ayuda a mantener stock actualizado, reducir mermas y saber cuándo reabastecer cada producto.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Crear/editar insumos, recetas, ver consumo, configurar alertas, exportar. | — |
| **manager** | Ver insumos, recetas, consumo, actualizar stock. | Configurar alertas avanzadas, exportar. |
| **cashier** | — | Gestionar inventario. |
| **waiter** | — | Gestionar inventario. |

## Requisitos previos / cómo se activa
- **Plan mínimo**: `buy` (Crecimiento) o `full` (Premium).
- **Rol mínimo**: `admin` o `manager`.
- Si el plan es `trial` o `try`, el módulo no está disponible.

## Paso a paso de las tareas principales

### Crear insumo nuevo (admin)
1. Ir a **Menú lateral → Inventario → Insumos**.
2. Clic en **"+ Nuevo insumo"**.
3. Completar campos:
   - **Nombre**: ej. "Harina 000".
   - **Unidad**: ej. "kg", "litros", "unidades".
   - **Stock actual**: ej. `50` kg.
   - **Stock mínimo**: ej. `10` kg (para alertas).
   - **Proveedor** (opcional): ej. "Distribuidora Demo".
   - **Precio por unidad** (opcional): ej. `$850` por kg.
4. Clic en **"Guardar"**.

### Crear receta (admin)
1. Ir a **Inventario → Recetas**.
2. Clic en **"+ Nueva receta"**.
3. Seleccionar **producto del menú** (ej. "Hamburguesa Clásica").
4. Agregar ingredientes:
   - **Insumo**: ej. "Carne picada".
   - **Cantidad**: ej. `0.2` kg.
   - Repetir para cada ingrediente.
5. Clic en **"Guardar"**.

### Actualizar stock (admin/manager)
1. Ir a **Inventario → Insumos**.
2. Buscar insumo.
3. Clic en **"Actualizar stock"**.
4. Ingresar nueva cantidad o ajuste.
5. Seleccionar motivo:
   - Compra.
   - Merma.
   - Ajuste manual.
6. Clic en **"Guardar"**.

### Ver consumo (admin/manager)
1. Ir a **Inventario → Consumo**.
2. Filtrar por:
   - Fecha.
   - Producto.
   - Insumo.
3. Ver qué insumos se consumieron y cuánto queda.

### Ver alertas de stock bajo (admin/manager)
1. Ir a **Inventario → Alertas**.
2. Ver insumos por debajo del stock mínimo.
3. Planificar reabastecimiento.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Nombre** | Identificador del insumo. |
| **Unidad** | kg, litros, unidades, etc. |
| **Stock actual** | Cantidad disponible. |
| **Stock mínimo** | Nivel para alertas de reabastecimiento. |
| **Proveedor** | Quién provee el insumo. |
| **Precio por unidad** | Costo por unidad de medida. |
| **Recetas** | Ingredientes necesarios por producto. |
| **Consumo** | Registro de uso por venta. |

## Reglas de negocio y límites

- **Plan buy/full**: Requerido.
- **Multi-tenant**: Inventario por negocio.
- **Stock negativo**: No se permite (excepto ajuste manual con justificación).
- **Consumo automático**: Al confirmar orden, se descuenta stock según receta.
- **Alertas**: Notificación cuando stock < mínimo.
- **Sin límite de insumos**: No hay máximo definido en código.

## Relación con otros módulos

- **menu**: Los productos del menú tienen recetas asociadas.
- **orders**: Al confirmar orden, se consume stock.
- **reports**: Reportes de consumo y mermas.
- **ico**: El inventario afecta el score ICO (faltantes).

## Preguntas frecuentes

1. **¿Cómo agrego un insumo?**
   → Inventario → Insumos → "+ Nuevo" → completar datos → guardar.

2. **¿Cómo asigno ingredientes a un plato?**
   → Inventario → Recetas → "+ Nueva" → producto + ingredientes → guardar.

3. **¿El stock se descuenta automáticamente?**
   → Sí, al confirmar orden se descuenta según receta.

4. **¿Cómo sé cuándo reabastecer?**
   → En Alertas, ver insumos bajo stock mínimo.

5. **¿Puedo registrar una compra?**
   → Sí, en Insumos → "Actualizar stock" → motivo "Compra".

6. **¿Cómo registro una merma?**
   → Insumos → "Actualizar stock" → motivo "Merma" → cantidad perdida.

7. **¿Puedo ver cuánto consumí este mes?**
   → Sí, en Consumo → filtrar por fecha.

8. **¿Qué pasa si no tengo stock de un insumo?**
   → El producto del menú se marca como "Sin inventario" automáticamente.

9. **¿Puedo exportar datos de inventario?**
   → Sí, como admin.

10. **¿Puedo tener recetas para combos?**
    → Sí, crear receta para el producto combo con todos los ingredientes.

## Errores y mensajes comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `Inventory requires buy plan` | Plan trial/try. | Actualizar plan a buy/full. |
| `Insufficient stock` | Stock insuficiente para consumo. | Reabastecer insumo. |
| `Invalid unit` | Unidad no reconocida. | Seleccionar de la lista. |
| `Stock cannot be negative` | Intento de dejar stock negativo. | Corregir cantidad. |
| `Insufficient permissions` | Rol sin permiso. | Pedir a admin/manager. |

## Recomendaciones y buenas prácticas

- **Mantener stock actualizado**: Registrar compras y mermas diariamente.
- **Configurar stock mínimo**: Para recibir alertas oportunas.
- **Revisar consumo**: Identificar mermas altas.
- **Actualizar recetas**: Si cambian ingredientes o cantidades.
- **Usar proveedores**: Registrar para facilitar reabastecimiento.
- **Auditar stock**: Conteo físico periódico.

## Qué hacer si no funciona

Si inventario no carga o hay errores:
1. Verificar plan buy/full.
2. Verificar permisos.
3. Verificar recetas configuradas.
4. Si persiste, contactar soporte con: negocio, plan, insumo, error.

## Descripción breve para negocios que NO lo tienen activo

El módulo de Inventario permite controlar insumos, recetas y consumo de ingredientes por venta. Ayuda a mantener stock actualizado, reducir mermas y saber cuándo reabastecer. Disponible desde plan Crecimiento (buy) o Premium (full).