---
modulo: store
tipo: opcional
roles: [admin]
version_doc: "2026-10-27"
---
# Tienda de Canje

## Qué es y para qué sirve
El módulo de Tienda de Canje permite a los miembros del Club de Fidelización canjear sus puntos acumulados por productos, descuentos o recompensas. Es un catálogo de premios que fomenta la recompra y fidelización.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Crear/editar productos de canje, gestionar catálogo, ver canjes, configurar reglas. | — |
| **manager** | — | Gestionar tienda de canje (solo admin). |
| **cashier** | — | Gestionar tienda de canje. |
| **waiter** | — | Gestionar tienda de canje. |

## Requisitos previos / cómo se activa
- **Plan mínimo**: `full` (Premium).
- **Rol mínimo**: `admin`.
- Requiere `loyaltyClub` activo.
- Si el plan es `buy` o inferior, el módulo no está disponible.

## Paso a paso de las tareas principales

### Crear producto de canje (solo admin)
1. Ir a **Menú lateral → Club de fidelización → Tienda de canje**.
2. Clic en **"+ Nuevo producto"**.
3. Completar campos:
   - **Nombre**: ej. "Descuento 10%".
   - **Puntos requeridos**: ej. `500` puntos.
   - **Descripción**: qué recibe el cliente.
   - **Stock disponible**: cantidad de canjes disponibles (opcional).
   - **Imagen**: foto del premio (opcional).
4. Clic en **"Guardar"**.

### Gestionar canjes (solo admin)
1. Ir a **Club de fidelización → Tienda de canje → Historial**.
2. Ver canjes realizados:
   - Miembro.
   - Producto canjeado.
   - Puntos descontados.
   - Fecha.

### Desactivar producto de canje (solo admin)
1. Ir a **Tienda de canje**.
2. Seleccionar producto.
3. Clic en **"Desactivar"**.
4. Confirmar.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Nombre** | Nombre visible del producto/premio. |
| **Puntos requeridos** | Cantidad de puntos para canjear. |
| **Descripción** | Qué recibe el cliente al canjear. |
| **Stock** | Cantidad de canjes disponibles (opcional, sin límite si no se define). |
| **Imagen** | Foto del premio. |
| **Estado** | Activo o inactivo. |

## Reglas de negocio y límites

- **Plan full**: Requerido.
- **Solo admin**: Único rol con acceso.
- **Requiere loyaltyClub**: Debe estar activo.
- **Puntos suficientes**: El miembro debe tener los puntos necesarios.
- **Stock limitado**: Si se define, no se puede canjear más allá del stock.
- **Un canje por miembro**: Depende de la configuración del producto.
- **Multi-tenant**: Solo datos del propio negocio.

## Relación con otros módulos

- **loyaltyClub**: Base de puntos para canje.
- **loyaltyAnalytics**: Métricas de uso de la tienda.
- **orders**: Los canjes generan descuentos en órdenes.
- **menu**: Los productos canjeables son del catálogo.

## Preguntas frecuentes

1. **¿Cómo agrego un premio a la tienda?**
   → Club de fidelización → Tienda de canje → "+ Nuevo producto" → guardar.

2. **¿Cuántos puntos cuesta un descuento?**
   → Lo defines tú al crear el producto. Ej: 500 puntos para 10% descuento.

3. **¿Puedo limitar cuántas veces se canjea?**
   → Sí, definir stock disponible al crear el producto.

4. **¿Quién puede gestionar la tienda?**
   → Solo admin.

5. **¿Puedo desactivar un premio temporalmente?**
   → Sí, seleccionar → "Desactivar".

6. **¿Cómo sé quién canjeó qué?**
   → En Historial de canjes, ver miembro, producto y fecha.

7. **¿Los puntos se descuentan automáticamente?**
   → Sí, al canjear se descuentan los puntos del miembro.

8. **¿Puedo tener premios sin stock limitado?**
   → Sí, si no defines stock, es ilimitado.

9. **¿Qué pasa si no tengo puntos suficientes?**
   → No podrá canjear hasta acumular los puntos necesarios.

10. **¿Puedo exportar el historial de canjes?**
    → Sí, como admin.

## Errores y mensajes comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `Store requires full plan` | Plan buy o inferior. | Actualizar plan a full. |
| `Loyalty club not active` | loyaltyClub no habilitado. | Activar club de fidelización. |
| `Insufficient points` | Miembro sin puntos suficientes. | Acumular más puntos. |
| `Out of stock` | Stock agotado. | Esperar reposición o crear nuevo producto. |
| `Insufficient permissions` | Rol no admin. | Pedir al admin. |

## Recomendaciones y buenas prácticas

- **Crear premios atractivos**: Motivar acumulación de puntos.
- **Definir stock realista**: Evitar frustraciones por agotamiento.
- **Actualizar catálogo**: Renovar premios periódicamente.
- **Promocionar tienda**: Informar a miembros sobre premios disponibles.
- **Revisar canjes**: Monitorear popularidad de cada premio.

## Qué hacer si no funciona

Si la tienda no carga o hay errores al canjear:
1. Verificar plan full.
2. Verificar loyaltyClub activo.
3. Verificar permisos admin.
4. Verificar puntos del miembro.
5. Si persiste, contactar soporte con: negocio, plan, miembro, producto, error.

## Descripción breve para negocios que NO lo tienen activo

El módulo de Tienda de Canje permite a miembros del Club de Fidelización canjear puntos por productos, descuentos o recompensas. Fomenta la recompra y fidelización. Disponible exclusivamente en plan Premium (full) con loyaltyClub activo.