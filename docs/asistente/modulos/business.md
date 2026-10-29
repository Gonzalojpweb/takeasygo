---
modulo: business
tipo: opcional
roles: [admin, manager]
version_doc: "2026-10-27"
---
# Business (Precios Corporativos)

## Qué es y para qué sirve
El módulo Business permite gestionar precios corporativos y menús especiales para empresas clientes. Ofrece catálogos personalizados, precios negociados y condiciones especiales para ventas B2B.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Crear/editar empresas clientes, menús corporativos, precios, condiciones. | — |
| **manager** | Ver empresas clientes, procesar pedidos corporativos. | Configurar precios y condiciones. |
| **cashier** | Cobrar pedidos corporativos. | Gestionar empresas clientes. |
| **waiter** | — | Gestionar módulo business. |

## Requisitos previos / cómo se activa
- **Plan mínimo**: `buy` (Crecimiento) o `full` (Premium).
- **Rol mínimo**: `admin` (configuración) o `manager` (operación).
- Si el plan es `trial` o `try`, el módulo no está disponible.

## Paso a paso de las tareas principales

### Crear empresa cliente (solo admin)
1. Ir a **Menú lateral → Business → Empresas**.
2. Clic en **"+ Nueva empresa"**.
3. Completar campos:
   - **Nombre**: ej. "Empresa Demo S.A.".
   - **CUIT**: ej. "30-12345678-9".
   - **Contacto**: nombre del responsable.
   - **Teléfono**: ej. "11-1234-5678".
   - **Email**: ej. "contacto@empresademo.com".
   - **Condiciones de pago**: ej. "30 días".
4. Clic en **"Guardar"**.

### Crear menú corporativo (solo admin)
1. Ir a **Business → Menús corporativos**.
2. Clic en **"+ Nuevo menú"**.
3. Asignar a empresa cliente.
4. Seleccionar productos del menú principal.
5. Definir **precio corporativo** por producto (diferente al precio normal).
6. Clic en **"Guardar"**.

### Procesar pedido corporativo (manager/cashier)
1. Ir a **Business → Pedidos**.
2. Clic en **"+ Nuevo pedido"**.
3. Seleccionar empresa cliente.
4. Agregar productos del menú corporativo.
5. Ver **precio corporativo** aplicado automáticamente.
6. Cobrar según condiciones de la empresa.
7. Clic en **"Confirmar"**.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Nombre empresa** | Identificación del cliente corporativo. |
| **CUIT** | Identificación fiscal. |
| **Contacto** | Persona de referencia. |
| **Condiciones de pago** | Términos de pago acordados. |
| **Menú corporativo** | Catálogo con precios negociados. |
| **Precio corporativo** | Precio especial por producto. |
| **Límite de crédito** | Monto máximo de deuda (opcional). |

## Reglas de negocio y límites

- **Plan buy/full**: Requerido.
- **Multi-tenant**: Empresas por negocio.
- **Precios especiales**: Solo visibles para la empresa asignada.
- **Sin límite de empresas**: No hay máximo definido en código.
- **Condiciones de pago**: Configurables por empresa.

## Relación con otros módulos

- **menu**: Los productos corporativos derivan del menú principal.
- **orders**: Los pedidos corporativos son un tipo de orden.
- **reports**: Reportes de ventas B2B.
- **crm**: Datos de empresas clientes.

## Preguntas frecuentes

1. **¿Cómo agrego una empresa cliente?**
   → Business → Empresas → "+ Nueva" → completar datos → guardar.

2. **¿Puedo tener precios diferentes por empresa?**
   → Sí, crear menú corporativo con precios negociados.

3. **¿Cómo hago un pedido corporativo?**
   → Business → Pedidos → "+ Nuevo" → empresa + productos → cobrar.

4. **¿Puedo ver debo empresas?**
   → Sí, en Business → Empresas → saldo pendiente.

5. **¿Puedo exportar facturación B2B?**
   → Sí, como admin.

6. **¿Las empresas ven el menú normal?**
   → No, ven su menú corporativo con precios negociados.

7. **¿Puedo limitar crédito por empresa?**
   → Sí, configurar límite de crédito al crear empresa.

8. **¿Cómo cambio precios corporativos?**
   → Business → Menús corporativos → editar precios → guardar.

9. **¿Puedo tener varias empresas con el mismo menú?**
   → Sí, duplicar menú y asignar a otra empresa.

10. **¿Los managers pueden crear empresas?**
    → No, solo admin configura empresas y precios.

## Errores y mensajes comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `Business requires buy plan` | Plan trial/try. | Actualizar plan a buy/full. |
| `Company not found` | Empresa no existe. | Verificar nombre/ID. |
| `Credit limit exceeded` | Supera límite de crédito. | Reducir pedido o aumentar límite. |
| `Insufficient permissions` | Rol sin permiso. | Pedir a admin. |

## Recomendaciones y buenas prácticas

- **Mantener datos actualizados**: Contactos y condiciones de pago.
- **Revisar precios negociados**: Actualizar según acuerdos.
- **Monitorear saludos**: Asegurar cobro oportuno.
- **Usar CUIT**: Para facturación correcta.
- **Documentar acuerdos**: Términos comerciales claros.

## Qué hacer si no funciona

Si business no carga o hay errores:
1. Verificar plan buy/full.
2. Verificar permisos.
3. Verificar empresa creada.
4. Si persiste, contactar soporte con: negocio, plan, empresa, error.

## Descripción breve para negocios que NO lo tienen activo

El módulo Business permite gestionar ventas B2B con empresas clientes, ofreciendo menús corporativos, precios negociados y condiciones de pago especiales. Es ideal para restaurantes que atienden empresas. Disponible desde plan Crecimiento (buy) o Premium (full).