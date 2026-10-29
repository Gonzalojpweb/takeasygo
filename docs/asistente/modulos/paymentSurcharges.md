---
modulo: paymentSurcharges
tipo: siempre_activo
roles: [admin, manager]
version_doc: "2026-10-27"
---
# Recargos por Método de Pago

## Qué es y para qué sirve
El módulo de Recargos por Método de Pago permite configurar porcentajes o montos fijos adicionales que se aplican al cobrar con métodos específicos (ej. 2.5% por tarjeta de crédito). Ayuda a cubrir costos de transacción.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Configurar recargos por método, activar/desactivar, ver historial. | — |
| **manager** | Ver recargos configurados, aplicar al cobrar. | Modificar recargos (en algunos casos). |
| **cashier** | Ver recargos al cobrar, aplicar automáticamente. | Configurar recargos. |
| **waiter** | — | Configurar recargos. |

## Requisitos previos / cómo se activa
- **Plan mínimo**: Todos (`trial`, `try`, `buy`, `full`, `anfitrion`).
- **Rol mínimo**: `admin/manager` (configuración).
- Se activa en Configuración → Recargos por método de pago.

## Paso a paso de las tareas principales

### Configurar recargo por método (solo admin)
1. Ir a **Configuración → Recargos por método de pago**.
2. Para cada método habilitado, definir recargo:
   - **Efectivo**: normalmente `0` (sin recargo).
   - **MercadoPago**: ej. `2.5`% o `$500` fijo.
   - **POSNET Débito**: ej. `1.5`%.
   - **POSNET Crédito**: ej. `3.0`%.
   - **Kripton**: ej. `1.0`%.
   - **Transferencia**: ej. `0`%.
3. Seleccionar **tipo de recargo**:
   - **Porcentaje**: se calcula sobre el total.
   - **Monto fijo**: se suma al total.
4. Clic en **"Guardar"**.

### Ver recargo aplicado al cobrar
1. Al cobrar orden, seleccionar método de pago.
2. Sistema muestra **recargo aplicado** automáticamente.
3. **Total final** incluye recargo.
4. Ejemplo: Orden $10.000 + 2.5% tarjeta = $10.250 final.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Porcentaje por método** | Recargo como % del total (ej. 2.5%). |
| **Monto fijo por método** | Recargo como cantidad fija (ej. $500). |
| **Activar/desactivar** | Habilitar recargo por cada método. |
| **Aplicar automáticamente** | Sistema suma recargo al cobrar. |

## Reglas de negocio y límites

- **Siempre activo**: Disponible en todos los planes.
- **Multi-tenant**: Recargos por negocio.
- **Solo admin/manager configuran**: Cajeros solo ven aplicado.
- **No negativos**: Recargos deben ser valores positivos.
- **Aplicación automática**: El sistema suma el recargo al total.

## Relación con otros módulos

- **orders**: Los recargos afectan el total de las órdenes.
- **settings**: Configuración dentro del panel general.
- **cash-sale**: Registro de venta incluye recargo.
- **reports**: Reportes muestran desglose con recargos.
- **transferPayment**: Transferencia normalmente sin recargo.

## Preguntas frecuentes

1. **¿Cómo agrego un recargo por tarjeta?**
   → Configuración → Recargos → Tarjeta Crédito → porcentaje 2.5% → guardar.

2. **¿Puedo poner monto fijo en vez de porcentaje?**
   → Sí, seleccionar "Monto fijo" e ingresar valor.

3. **¿Los cajeros ven el recargo?**
   → Sí, al cobrar muestra recargo aplicado y total final.

4. **¿Puedo quitar recargo a un método?**
   → Sí, poner recargo en 0 o desactivar.

5. **¿Se aplica a todos los pedidos?**
   → Sí, a todos los que usen ese método de pago.

6. **¿Puedo tener recargo solo en algunas sedes?**
   → Depende de la configuración multi-sede. Verificar con admin.

7. **¿Los managers pueden modificar recargos?**
   → Depende de la configuración. Algunos casos sí.

8. **¿Qué pasa si cambio el recargo?**
   → Aplica a nuevos cobros. No modifica órdenes ya cobradas.

9. **¿Puedo ver historial de recargos?**
   → En Reportes → Métodos de pago → ver desglose.

10. **¿Efectivo tiene recargo?**
    → Normalmente no, pero puedes configurarlo si lo necesitas.

## Errores y mensajes comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `Surcharge must be positive` | Recargo negativo. | Ingresar valor positivo o 0. |
| `Method not enabled` | Método de pago deshabilitado. | Habilitar primero en Métodos de pago. |
| `Insufficient permissions` | Rol sin permiso. | Pedir a admin/manager. |
| `Invalid percentage` | Porcentaje fuera de rango. | Ingresar valor válido (ej. 2.5). |

## Recomendaciones y buenas prácticas

- **Informar al cliente**: Mostrar recargo claramente en factura.
- **Mantener recargos competitivos**: No exceder costos reales de transacción.
- **Revisar periódicamente**: Ajustar según cambios en comisiones bancarias.
- **Documentar**: Anotar por qué se definió cada recargo.
- **Usar con transparencia**: Comunicar a clientes antes de cobrar.

## Qué hacer si no funciona

Si recargos no se aplican o hay errores:
1. Verificar método habilitado en configuración.
2. Verificar recargo configurado correctamente.
3. Verificar permisos.
4. Si persiste, contactar soporte con: negocio, método, recargo configurado, error.

## Descripción breve para negocios que NO lo tienen activo

El módulo de Recargos por Método de Pago permite agregar porcentajes o montos fijos al cobrar con métodos específicos (ej. 2.5% por tarjeta). Ayuda a cubrir costos de transacción. Disponible en todos los planes.