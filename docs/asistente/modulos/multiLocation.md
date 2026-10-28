---
modulo: multiLocation
tipo: opcional
roles: [admin, manager]
version_doc: "2026-10-27"
---
# Múltiples Sedes

## Qué es y para qué sirve
El módulo de múltiples sedes permite a los negocios con más de una ubicación gestionar todas sus sedes desde un solo panel. Cada sede tiene su propio menú, caja, impresoras y configuración, pero se centraliza la administración.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Crear, editar, activar/desactivar sedes, configurar cada una, ver reportes consolidados. | — |
| **manager** | Ver sedes, operar en sedes asignadas, ver reportes por sede. | Crear/editar sedes (solo admin). |
| **cashier** | Operar en la sede donde está asignado. | Gestionar sedes. |
| **waiter** | Operar en la sede donde está asignado. | Gestionar sedes. |

## Requisitos previos / cómo se activa
- **Plan mínimo**: `buy` (Crecimiento) o `full` (Premium).
- **Rol mínimo**: `admin` (gestión) o `manager` (operación).
- Si el plan es `trial` o `try`, solo se permite 1 sede.

## Paso a paso de las tareas principales

### Crear una nueva sede (solo admin)
1. Ir a **Menú lateral → Configuración → Sedes**.
2. Clic en **"+ Nueva sede"**.
3. Completar campos:
   - **Nombre**: ej. "Café Demo - Sucursal Norte".
   - **Slug**: identificador único (ej. `cafe-demo-norte`).
   - **Dirección**: ej. "Av. Siempreviva 123, Buenos Aires".
   - **Configuración**: métodos de pago, impresoras, etc.
4. Clic en **"Guardar"**.
5. La sede queda activa y lista para operar.

### Editar una sede existente (solo admin)
1. Ir a **Configuración → Sedes**.
2. Seleccionar la sede.
3. Clic en **"Editar"**.
4. Modificar campos necesarios.
5. Clic en **"Guardar"**.

### Activar/desactivar sede (solo admin)
1. Ir a **Configuración → Sedes**.
2. Seleccionar sede.
3. Clic en **"Activar"** o **"Desactivar"**.
4. Confirmar.

### Asignar usuario a una sede (solo admin)
1. Ir a **Usuarios**.
2. Editar usuario.
3. Seleccionar **Sede asignada**.
4. Clic en **"Guardar"**.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Nombre** | Identificador visible de la sede. |
| **Slug** | URL única de la sede (ej. `cafe-demo-norte`). |
| **Dirección** | Ubicación física de la sede. |
| **Métodos de pago** | Formas de pago específicas de cada sede. |
| **Impresoras** | Impresoras asignadas a cada sede. |
| **Estado** | Activa o inactiva. |
| **Configuración fiscal** | Punto de venta AFIP específico por sede. |

## Reglas de negocio y límites

- **Plan buy/full**: Requerido para múltiples sedes.
- **Trial/try**: Máximo 1 sede.
- **Slug único**: No se pueden crear dos sedes con el mismo slug.
- **Usuario por sede**: Cada usuario puede estar asignado a una sede específica.
- **Reportes por sede**: Se pueden filtrar reportes por sede.
- **Multi-tenant**: Cada negocio tiene sus propias sedes aisladas.

## Relación con otros módulos

- **settings**: La configuración es por sede.
- **orders**: Cada orden pertenece a una sede.
- **printers**: Impresoras se asignan por sede.
- **users**: Usuarios se asignan a sedes.
- **reports**: Reportes se pueden filtrar por sede.
- **menu**: Cada sede puede tener menú propio o compartido.

## Preguntas frecuentes

1. **¿Cómo agrego una segunda sede?**
   → Configuración → Sedes → "+ Nueva sede" → completar datos → guardar.

2. **¿Puedo tener menús diferentes por sede?**
   → Sí, cada sede puede tener su propio menú o compartir el mismo.

3. **¿Cómo asigno un empleado a una sede?**
   → Usuarios → editar → sede asignada → guardar.

4. **¿Puedo ver reportes de todas las sedes juntas?**
   → Sí, en Reportes puedes ver consolidado o filtrar por sede.

5. **¿Cuántas sedes puedo tener?**
   → No hay límite técnico definido en el código. Depende del plan.

6. **¿Puedo desactivar una sede temporalmente?**
   → Sí, en Configuración → Sedes → seleccionar → "Desactivar".

7. **¿Los usuarios ven todas las sedes?**
   → No, solo la sede que tienen asignada (si está configurada).

8. **¿Puedo transferir un usuario de sede?**
   → Sí, en Usuarios → editar → cambiar sede → guardar.

9. **¿Cada sede tiene su propia caja?**
   → Sí, cada sede gestiona su propia caja y cierre Z.

10. **¿Puedo ver cuánto vende cada sede?**
    → Sí, en Reportes → filtrar por sede.

## Errores y mensajes comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `Plan does not allow multiLocation` | Plan trial/try. | Actualizar plan a buy/full. |
| `Slug already exists` | Slug duplicado. | Cambiar slug. |
| `Cannot delete last active location` | Última sede activa. | Mantener al menos una sede activa. |
| `Location not found` | Sede no existe o inactiva. | Verificar sede seleccionada. |
| `Insufficient permissions` | Rol sin permiso. | Pedir al admin que gestione sedes. |

## Recomendaciones y buenas prácticas

- **Configurar cada sede completamente**: Menú, impresoras, métodos de pago.
- **Asignar usuarios correctamente**: Cada empleado en su sede.
- **Revisar reportes por sede**: Comparar rendimiento entre ubicaciones.
- **Mantener datos actualizados**: Direcciones, contactos de cada sede.
- **Usar slugs descriptivos**: Facilita identificación y URLs.
- **Planificar expansión**: Agregar sedes gradualmente según crecimiento.

## Qué hacer si no funciona

Si no puedes crear sedes, asignar usuarios, o hay errores:
1. Verificar plan activo (buy/full).
2. Verificar que seas admin.
3. Verificar slug único.
4. Verificar conexión a internet.
5. Si persiste, contactar soporte con: negocio, rol, plan, qué intentó hacer, mensaje de error exacto.

## Descripción breve para negocios que NO lo tienen activo

El módulo de múltiples sedes permite a negocios con más de una ubicación gestionar todas sus sedes desde un solo panel, con menús, cajas, impresoras y reportes centralizados. Es esencial para cadenas y restaurantes con varias sucursales. Disponible desde plan Crecimiento (buy) o Premium (full).