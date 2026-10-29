---
modulo: menu
tipo: siempre_activo
roles: [admin, manager]
version_doc: "2026-10-27"
---
# Menú (Productos y Categorías)

## Qué es y para qué sirve
El módulo de menú es el catálogo digital del negocio. Permite crear, editar, organizar y mostrar los productos (platos, bebidas, combos) y sus categorías a los clientes. Es la base de todo el sistema de pedidos: sin menú no se pueden recibir pedidos online ni presenciales.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Crear, editar, eliminar, reorganizar productos y categorías, asignar precios, subir imágenes, configurar modificadores (ej. "sin cebolla"), pausar visibilidad. | — |
| **manager** | Crear, editar, reorganizar productos y categorías, asignar precios, subir imágenes, configurar modificadores, pausar visibilidad. | — |
| **cashier** | Ver el menú completo (necesario para cobrar). | Crear, editar, eliminar o pausar productos. |
| **waiter** | Ver el menú completo para consultar precios y disponibilidad. | Crear, editar, eliminar o pausar productos. |
| **kitchen** | Ver el menú completo (necesario para preparar platos). | Crear, editar, eliminar o pausar productos. |

## Requisitos previos / cómo se activa
No requiere activación. Está siempre activo en todos los planes (`trial`, `try`, `buy`, `full`, `anfitrion`). Sin embargo, el plan `anfitrion` solo permite menú y configuración; los pedidos están bloqueados.

## Paso a paso de las tareas principales

### Crear un producto nuevo (admin/manager)
1. Ir al menú lateral → **Menú** → **Productos**.
2. Clic en **"+ Nuevo producto"**.
3. Completar los campos obligatorios:
   - **Nombre**: ej. "Hamburguesa Clásica".
   - **Precio**: en centavos (ej. `850000` = $8.500,00 ARS).
   - **Categoría**: seleccionar una existente o crear una nueva.
4. Completar campos opcionales:
   - **Descripción**: texto descriptivo para el cliente.
   - **Precio medio** (`halfPrice`): si aplica porciones.
   - **Imagen**: subir foto del plato.
   - **Modificadores**: agregar grupos de opciones (ej. "Punto de cocción" con opciones: "Jugoso", "Bien cocido").
   - **Orden** (`sortOrder`): posición en la categoría.
5. Clic en **"Guardar"**.

### Crear una categoría nueva (admin/manager)
1. Ir a **Menú** → **Categorías**.
2. Clic en **"+ Nueva categoría"**.
3. Ingresar **Nombre** (ej. "Platos principales").
4. Definir **Orden** de aparición.
5. Activar **Visible en menú** si quieres que los clientes la vean.
6. Clic en **"Guardar"**.

### Pausar visibilidad de un producto (admin/manager)
1. Ir a **Menú** → **Productos**.
2. Buscar el producto y clic en **"Editar"**.
3. Desactivar la opción **"Visible en menú"**.
4. Clic en **"Guardar"**.

El producto seguirá en el sistema pero no aparecerá en el catálogo del cliente.

### Reorganizar productos en categorías
1. Ir a **Menú** → **Productos**.
2. Arrastrar y soltar los productos para cambiar su orden.
3. Guardar cambios automáticamente al soltar.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Nombre** | Nombre visible del producto para el cliente. |
| **Precio** | Precio en centavos. El sistema divide por 100 para mostrar en pesos. |
| **Precio medio** | Precio para media porción (opcional, para platos compartibles). |
| **Descripción** | Texto descriptivo que ve el cliente en el menú. |
| **Categoría** | Agrupación del producto en el menú. |
| **Subcategoría** | Sub-agrupación dentro de una categoría (opcional). |
| **Imagen** | Foto del producto (recomendado 800×600px, formato JPEG/PNG). |
| **Modificadores** | Grupos de opciones personalizables (ej. "Extra queso", "Sin gluten"). |
| **Tipo de modificador** | `single` (una opción), `multiple` (varias), `fixed` (cantidad fija). |
| **Precio del modificador** | Precio adicional por cada opción. |
| **Regla de precio** | Cómo se calcula el precio total con modificadores: `sum` (suma), `max` (máximo), `average` (promedio). |
| **Disponible** | Estado del producto: disponible o no disponible para pedir. |
| **Orden** | Posición en la categoría (para ordenamiento). |
| **Subcategoría visible** | Si la subcategoría aparece en el menú. |

## Reglas de negocio y límites

- **Precio mínimo**: $0.00 ARS (no se permiten precios negativos).
- **Precio máximo**: No hay límite técnico, pero el sistema valida que sea un número entero positivo.
- **Máximo de modificadores por producto**: No hay límite técnico definido en el código.
- **Máximo de opciones por modificador**: No hay límite técnico definido en el código.
- **Límite de productos por categoría**: No hay límite técnico definido en el código.
- **Imágenes**: Formatos aceptados JPEG y PNG. Tamaño recomendado máximo 5MB por imagen.
- **Productos no disponibles**: Pueden tener razón `manual` (pausado por rol) o `stock` (inventario insuficiente). El sistema muestra "Faltante" o "Sin inventario" según corresponda.
- **Multi-sede**: Cada sede puede tener su propio menú o compartir el mismo. Los productos se filtran por `tenantId` y opcionalmente por `locationId`.

## Relación con otros módulos

- **orders**: Sin menú no se pueden crear pedidos.
- **inventory**: Cuando el inventario está activo, los productos muestran stock disponible y automáticamente marcan "Faltante" si no hay stock.
- **hiddenRewards**: Las recompensas ocultas son productos del menú que no se muestran al cliente pero se activan por lógica de puntos.
- **loyaltyClub**: Los puntos de fidelización se acumulan por compras de productos del menú.
- **posIntegration**: El POS sincroniza el snapshot del menú para funcionar offline.
- **printers**: Cada producto puede tener una impresora asignada (para cocina/bar).
- **ico**: El módulo ICO analiza la performance del menú (productos más/menos vendidos).

## Preguntas frecuentes

1. **¿Cómo agrego un nuevo plato al menú?**
   → Ir a Menú → Productos → "+ Nuevo producto". Completar nombre, precio y categoría. Guardar.

2. **¿Puedo poner una imagen a cada plato?**
   → Sí, en la edición del producto, en el campo "Imagen" podés subir una foto desde tu dispositivo.

3. **¿Cómo hago un combo de dos platos?**
   → Crear un producto nuevo llamado "Combo [nombre]" con el precio del combo y agregar modificadores con las opciones de los platos incluidos.

4. **¿Puedo cambiar el precio de un plato en horario pico?**
   → No hay opción nativa de precios dinámicos por horario. Podés crear un producto duplicado con precio diferente y pausar/despausar según el momento.

5. **¿Cómo hago que un plato no aparezca en el menú sin borrarlo?**
   → Editar el producto y desactivar "Visible en menú". Seguirá en el sistema pero no aparecerá.

6. **¿Puedo ordenar cómo se ven los platos en el menú?**
   → Sí, en Menú → Productos podés arrastrar y soltar para reordenar, o cambiar el campo "Orden".

7. **¿Cómo creo una subcategoría?**
   → Al crear/editar una categoría, definir la categoría padre. Las subcategorías se anidan bajo ella en el menú.

8. **¿Se pueden aplicar descuentos por producto?**
   → No directamente en el módulo de menú. Los descuentos se aplican a nivel de orden desde el POS o módulos promocionales.

9. **¿Puedo duplicar un producto existente?**
   → No hay botón de duplicar. Podés crear uno nuevo y copiar manualmente los datos.

10. **¿Cómo borro un producto que ya no vendo?**
    → Editar el producto y activar "No disponible". No se recomienda eliminar permanentemente para conservar historial de ventas.

## Errores y mensajes comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `Validation failed: name is required` | No se ingresó nombre del producto. | Completar el campo "Nombre". |
| `Validation failed: price must be positive` | El precio ingresado es 0 o negativo. | Ingresar un precio mayor a 0. |
| `Validation failed: category is required` | No se seleccionó categoría. | Seleccionar o crear una categoría. |
| `Image upload failed: file too large` | La imagen supera el tamaño máximo. | Redimensionar o comprimir la imagen. |
| `Product not found` | El producto no existe o fue eliminado. | Verificar que el producto exista y esté en el negocio correcto. |
| `Cannot modify menu: insufficient permissions` | El rol no tiene permiso `menu:modify`. | Pedir a un admin o manager que realice la modificación. |
| `Duplicate product name` | Ya existe un producto con el mismo nombre. | Cambiar el nombre o verificar si es un duplicado. |

## Recomendaciones y buenas prácticas

- **Usar imágenes de calidad**: Un buen plato vendido con buena foto. Subí imágenes nítidas y bien iluminadas.
- **Mantener precios actualizados**: Revisar precios semanalmente para evitar pérdidas.
- **Usar categorías claras**: Agrupar platos por tipo (entradas, platos principales, postres, bebidas) para facilitar la navegación del cliente.
- **Pausar platos agotados**: Si un plato se termina, marcar como "No disponible" en lugar de borrarlo, para conservar historial.
- **Configurar modificadores**: Permitir que los clientes personalicen (sin cebolla, extra queso, etc.) mejora la experiencia.
- **Subir fotos de todos los platos**: Los productos con imagen tienen mayor tasa de conversión.

## Qué hacer si no funciona

Si el menú no carga, los productos no aparecen, o hay errores al editar:
1. Verificar conexión a internet.
2. Recargar la página.
3. Intentar con otro navegador o dispositivo.
4. Si persiste, contactar a soporte humano con: nombre del negocio, qué producto/categoría falla, y mensaje de error exacto.

## Descripción breve para negocios que NO lo tienen activo

El módulo de menú es el catálogo digital donde se muestran los productos, precios, imágenes y categorías a los clientes. Es esencial para recibir pedidos online y presenciales. Está activo por defecto en todos los planes. Si no lo ves, contactá al equipo de soporte para verificar tu configuración.