---
modulo: loyaltyClub
tipo: opcional
roles: [admin, manager, cashier]
version_doc: "2026-10-27"
---
# Club de Fidelización

## Qué es y para qué sirve
El Club de Fidelización permite registrar clientes como miembros, acumular puntos por compras y canjearlos por recompensas. Fomenta la fidelización y la recompra de clientes.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Crear/editar miembros, configurar reglas de puntos, gestionar recompensas, exportar (con `loyaltyExport`). | — |
| **manager** | Ver miembros, registrar puntos, canjear recompensas. | Configurar reglas, exportar. |
| **cashier** | Registrar miembros en checkout, acumular puntos, canjear recompensas. | Configurar reglas, gestionar miembros. |
| **waiter** | — | Gestionar club de fidelización. |

## Requisitos previos / cómo se activa
- **Plan mínimo**: Todos (`trial`, `try`, `buy`, `full`), con límites distintos.
  - **trial**: 30 miembros máximo.
  - **try**: 150 miembros máximo.
  - **buy/full**: ilimitado.
- **anfitrion**: No incluye club activo (0 miembros).
- **Rol mínimo**: `admin/manager` (gestión), `cashier` (registro en checkout).

## Paso a paso de las tareas principales

### Registrar nuevo miembro (admin/manager/cashier)
1. Ir a **Menú lateral → Club de fidelización → Miembros**.
2. Clic en **"+ Nuevo miembro"**.
3. Completar campos:
   - **Nombre**: ej. "Juan Pérez".
   - **Email**: ej. "juan@ejemplo.com".
   - **Teléfono**: ej. "11-1234-5678".
4. Clic en **"Guardar"**.
5. El sistema genera ID de miembro y QR (si aplica).

### Acumular puntos (checkout)
1. Al cobrar orden de miembro del club.
2. Seleccionar **"Cliente del club"** o escanear QR.
3. Sistema calcula puntos según regla configurada.
4. Puntos se acreditan automáticamente.

### Canjear recompensas (admin/manager/cashier)
1. Ir a **Club de fidelización → Canjear**.
2. Buscar miembro.
3. Ver puntos disponibles.
4. Seleccionar **recompensa a canjear**.
5. Clic en **"Canjear"**.
6. Puntos se descuentan.

### Ver miembros (admin/manager)
1. Ir a **Club de fidelización → Miembros**.
2. Filtrar por:
   - Nombre.
   - Puntos.
   - Fecha de registro.
   - Estado (activo/inactivo).
3. Ver detalle de cada miembro.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Regla de puntos** | Cuántos puntos por peso gastado (ej. 1 punto por $100). |
| **Límite de miembros** | Según plan: trial=30, try=150, buy/full=ilimitado. |
| **Recompensas** | Catálogo de premios canjeables. |
| **Puntos por compra** | Cálculo automático al cobrar. |
| **Expiración de puntos** | Si los puntos vencen (configurable). |

## Reglas de negocio y límites

- **Límite por plan**: trial=30, try=150, buy/full=ilimitado, anfitrion=0.
- **Puntos por peso**: Se calculan automáticamente al cobrar.
- **Canje**: Requiere puntos suficientes.
- **Multi-tenant**: Miembros por negocio.
- **ID único**: Cada miembro tiene identificador único.
- **anfitrion**: No incluye club activo.

## Relación con otros módulos

- **orders**: Los pedidos generan puntos.
- **store**: Los puntos se canjean en tienda (plan full).
- **sos**: Préstamo de puntos (plan buy/full).
- **hiddenRewards**: Recompensas ocultas en menú.
- **loyaltyExport**: Exportación de lista (plan buy/full).
- **loyaltyAnalytics**: Analytics avanzados (plan full).
- **crm**: Datos de clientes.

## Preguntas frecuentes

1. **¿Cómo registro un cliente al club?**
   → Club de fidelización → Miembros → "+ Nuevo" → datos → guardar.

2. **¿Cuántos puntos gasta por dólar?**
   → Depende de la regla configurada (ej. 1 punto por $100).

3. **¿Puedo exportar la lista de miembros?**
   → Solo con plan buy/full y rol admin (`loyaltyExport`).

4. **¿Cuántos miembros puedo tener?**
   → trial: 30. try: 150. buy/full: ilimitado.

5. **¿Los puntos expiran?**
   → Depende de la configuración. Verificar con admin.

6. **¿Cómo canjeo puntos?**
   → Club → Canjear → miembro → recompensa → confirmar.

7. **¿Puedo ver puntos de un miembro?**
   → Sí, en Club → Miembros → detalle del miembro.

8. **¿Puedo tener varios niveles de miembro?**
   → No hay niveles definidos en el código actual.

9. **¿Los managers pueden configurar reglas?**
   → No, solo admin configura reglas de puntos.

10. **¿Puedo activar club en plan trial?**
    → Sí, pero con límite de 30 miembros.

## Errores y mensajes comuntos

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `Member limit reached` | Límite del plan alcanzado. | Actualizar plan o eliminar miembros inactivos. |
| `Insufficient points` | Miembro sin puntos suficientes. | Acumular más puntos. |
| `Club not active in plan anfitrion` | Plan anfitrion. | Cambiar de plan. |
| `Insufficient permissions` | Rol sin permiso. | Pedir a admin/manager. |
| `Export requires buy plan` | Plan trial/try. | Actualizar plan a buy/full. |

## Recomendaciones y buenas prácticas

- **Registrar miembros frecuentemente**: En cada visita.
- **Informar puntos**: Decir al cliente cuántos tiene.
- **Promocionar canjes**: Motivar uso de puntos.
- **Mantener datos actualizados**: Contactos de miembros.
- **Revisar reglas**: Asegurar que sean atractivas.
- **Usar con promociones**: Combinar con ofertas especiales.

## Qué hacer si no funciona

Si el club no carga o hay errores:
1. Verificar plan con club activo.
2. Verificar permisos.
3. Verificar límite de miembros.
4. Si persiste, contactar soporte con: negocio, plan, miembro, error.

## Descripción breve para negocios que NO lo tienen activo

El Club de Fidelización permite registrar clientes como miembros, acumular puntos por compras y canjearlos por recompensas. Fomenta la fidelización y recompra. Disponible en todos los planes con límites: trial=30, try=150, buy/full=ilimitado miembros.