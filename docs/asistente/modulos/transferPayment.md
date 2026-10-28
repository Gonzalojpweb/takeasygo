---
modulo: transferPayment
tipo: siempre_activo
roles: [admin, manager, cashier]
version_doc: "2026-10-27"
---
# Transferencia Bancaria

## Qué es y para qué sirve
El módulo de Transferencia Bancaria permite a los clientes pagar sus pedidos mediante transferencia o depósito bancario. El sistema genera los datos de cuenta, muestra los instructivos y gestiona la confirmación del pago con timeout automático.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Configurar datos bancarios, ver transferencias recibidas, confirmar manualmente. | — |
| **manager** | Ver transferencias, confirmar pagos. | Configurar datos bancarios. |
| **cashier** | Ver transferencias, confirmar pago al recibir comprobante. | Configurar datos bancarios. |
| **waiter** | — | Gestionar transferencias. |

## Requisitos previos / cómo se activa
- **Plan mínimo**: Todos (`trial`, `try`, `buy`, `full`, `anfitrion`).
- **Rol mínimo**: `admin/manager` (configuración), `cashier/manager` (confirmación).
- Se activa en Configuración → Métodos de pago → Transferencia.

## Paso a paso de las tareas principales

### Configurar datos bancarios (solo admin)
1. Ir a **Configuración → Métodos de pago → Transferencia**.
2. Ingresar datos de cuenta:
   - **Banco**: ej. "Banco Demo".
   - **Titular**: ej. "Café Demo S.A.".
   - **CBU**: ej. "0000000000000000000000".
   - **CVU** (opcional): para billeteras virtuales.
   - **Alias** (opcional): ej. "cafedemo.mp".
3. Clic en **"Guardar"**.

### Cliente paga por transferencia
1. Al elegir método de pago "Transferencia".
2. Sistema muestra **datos de cuenta** (CBU, titular, alias).
3. Cliente realiza transferencia desde su banco.
4. Sube **comprobante** de transferencia (foto/PDF).
5. La orden queda en estado `pending` con timeout de **24 horas**.

### Confirmar pago por transferencia (admin/manager/cashier)
1. Ir a **Órdenes → Pendientes de pago**.
2. Seleccionar orden con transferencia.
3. Ver comprobante subido por cliente.
4. Verificar monto correcto.
5. Clic en **"Confirmar pago"**.
6. La orden pasa a `confirmed`.

### Rechazar transferencia (admin/manager)
1. Ir a **Órdenes → Pendientes de pago**.
2. Seleccionar orden.
3. Clic en **"Rechazar"**.
4. Ingresar motivo (ej. "Monto incorrecto").
5. La orden se cancela.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Banco** | Nombre del banco. |
| **Titular** | Nombre del titular de la cuenta. |
| **CBU** | Código Bancario Uniforme (22 dígitos). |
| **CVU** | Código de Cuenta Virtual (billeteras). |
| **Alias** | Nombre alias para transferencias rápidas. |
| **Timeout** | Tiempo límite para pagar: 24 horas. |

## Reglas de negocio y límites

- **Siempre activo**: Disponible en todos los planes.
- **Timeout 24 horas**: Si no se paga, la orden se cancela automáticamente.
- **Comprobante obligatorio**: El cliente debe subir comprobante.
- **Verificación manual**: Un rol con permisos debe confirmar el pago.
- **Multi-sede**: Cada sede puede tener datos bancarios propios (configurable).
- **Multi-tenant**: Datos bancarios por negocio.

## Relación con otros módulos

- **orders**: Las transferencias son un método de pago de órdenes.
- **settings**: Configuración de datos bancarios.
- **cash-sale**: Registro de venta cuando se confirma.
- **reports**: Reportes por método de pago.

## Preguntas frecuentes

1. **¿Cómo configuro mi cuenta bancaria?**
   → Configuración → Métodos de pago → Transferencia → ingresar datos → guardar.

2. **¿Qué datos ve el cliente?**
   → Banco, titular, CBU/CVU y alias para realizar la transferencia.

3. **¿Cuánto tiempo tiene el cliente para pagar?**
   → 24 horas. Si no paga, la orden se cancela automáticamente.

4. **¿Cómo confirmo que llegó la transferencia?**
   → En Órdenes → Pendientes → verificar comprobante → "Confirmar pago".

5. **¿Puedo transferir sin comprobante?**
   → El sistema requiere comprobante para confirmar.

6. **¿Qué pasa si sube comprobante incorrecto?**
   → Rechazar con motivo y el sistema cancela la orden.

7. **¿Puedo ver todas las transferencias pendientes?**
   → Sí, en Órdenes → filtrar por "transferencia" y estado "pendiente".

8. **¿Los cajeros pueden confirmar transferencias?**
   → Sí, con permisos adecuados (`payment:process`).

9. **¿Puedo cambiar los datos bancarios?**
   → Sí, solo admin en Configuración → Transferencia.

10. **¿Hay recargo por transferencia?**
    → No, transferencia no tiene recargo por defecto (configurable).

## Errores y mensajes comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `Transfer not configured` | Datos bancarios no ingresados. | Admin configura datos en Configuración. |
| `Payment timeout exceeded` | Pasaron 24 horas sin pagar. | Orden cancelada automáticamente. |
| `Comprobante required` | Falta comprobante. | Cliente sube comprobante. |
| `Payment already confirmed` | Ya se confirmó. | Verificar estado de la orden. |
| `Insufficient permissions` | Rol sin permiso para confirmar. | Pedir a manager/admin. |

## Recomendaciones y buenas prácticas

- **Mantener datos bancarios actualizados**: Verificar CBU y alias.
- **Revisar pendientes regularmente**: Confirmar transferencias a tiempo.
- **Verificar comprobantes**: Chequear monto y destinatario.
- **Informar al cliente**: Asegurar que vea datos de cuenta.
- **Tener respaldo**: Guardar historial de transferencias.

## Qué hacer si no funciona

Si transferencias no aparecen o hay errores:
1. Verificar método de pago habilitado.
2. Verificar datos bancarios configurados (admin).
3. Verificar timeout no excedido.
4. Si persiste, contactar soporte con: negocio, orden, método de pago, error.

## Descripción breve para negocios que NO lo tienen activo

El módulo de Transferencia Bancaria permite a los clientes pagar mediante transferencia o depósito. El sistema genera datos de cuenta y gestiona la confirmación con timeout de 24 horas. Disponible en todos los planes.