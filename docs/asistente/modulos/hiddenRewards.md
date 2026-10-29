---
modulo: hiddenRewards
tipo: opcional
roles: [admin, manager]
version_doc: "2026-10-27"
---
# Hidden Rewards (Recompensas Escondidas)

## Qué es y para qué sirve
El módulo Hidden Rewards permite crear recompensas ocultas en el menú. Los clientes no ven estos productos, pero se activan automáticamente cuando cumplen ciertos criterios (ej. acumular puntos, llegar a cierto monto de compra). Fomenta la exploración del menú y la recompra.

## Quién puede usarlo y con qué alcance (por rol)

| Rol | Puede | No puede |
|-----|-------|----------|
| **admin** | Crear/editar recompensas ocultas, configurar reglas de activación, ver uso. | — |
| **manager** | Ver recompensas ocultas configuradas, asistir a clientes. | Crear/editar recompensas, configurar reglas. |
| **cashier** | Ver recompensa activada al cobrar si aplica. | Crear/editar recompensas. |
| **waiter** | — | Gestionar recompensas ocultas. |

## Requisitos previos / cómo se activa
- **Plan mínimo**: `buy` (Crecimiento) o `full` (Premium).
  - **buy**: hasta 20 recompensas por sede.
  - **full**: ilimitado.
- **Rol mínimo**: `admin` (creación) o `manager` (ver).
- Si el plan es `trial` o `try`, el módulo no está disponible.

## Paso a paso de las tareas principales

### Crear recompensa oculta (solo admin)
1. Ir a **Menú lateral → Recompensas ocultas (Hidden Rewards)**.
2. Clic en **"+ Nueva recompensa"**.
3. Completar campos:
   - **Nombre de la recompensa**: ej. "Postre secreto".
   - **Producto asociado**: seleccionar del menú (o crear nuevo).
   - **Precio especial**: precio con descuento (opcional).
   - **Criterio de activación**:
     - Puntos acumulados (ej. "cuando tenga 500 puntos").
     - Monto de compra (ej. "compras superiores a $20.000").
     - Frecuencia (ej. "en tu 5ta visita").
   - **Límite de uso** (opcional): ej. "1 vez por cliente".
4. Clic en **"Guardar"**.
5. La recompensa queda oculta hasta que el cliente cumpla criterio.

### Ver recompensas ocultas (admin/manager)
1. Ir a **Recompensas ocultas**.
2. Ver listado de recompensas configuradas.
3. Ver estado: activa/inactiva, criterio, límite.

### Ver uso de recompensas (solo admin)
1. Ir a **Recompensas ocultas → Historial**.
2. Ver:
   - Cliente que desbloqueó.
   - Recompensa canjeada.
   - Fecha.
   - Descuento aplicado.

### Desactivar recompensa (solo admin)
1. Ir a **Recompensas ocultas**.
2. Seleccionar recompensa.
3. Clic en **"Desactivar"**.
4. Confirmar.

## Configuración y opciones disponibles

| Opción | Qué hace |
|--------|----------|
| **Nombre** | Nombre de la recompensa (oculto para cliente). |
| **Producto asociado** | Producto del menú que se desbloquea. |
| **Precio especial** | Precio con descuento (opcional). |
| **Criterio de activación** | Cómo se desbloquea: puntos, monto, frecuencia. |
| **Límite de uso** | Cuántas veces puede canjearse. |
| **Estado** | Activa o inactiva. |

## Reglas de negocio y límites

- **Plan buy**: Hasta 20 recompensas por sede.
- **Plan full**: Ilimitado.
- **trial/try**: No disponible (0 recompensas).
- **Oculta por defecto**: Los clientes no ven la recompensa hasta desbloquearla.
- **Criterio específico**: Cada recompensa tiene su regla de activación.
- **Multi-sede**: Recompensas por sede (límite 20 en buy).

## Relación con otros módulos

- **menu**: Las recompensas son productos del menú.
- **loyaltyClub**: Los puntos pueden ser criterio de activación.
- **orders**: Se activan al alcanzar monto/frecuencia de compra.
- **store**: Similar concepto de canje (pero oculto).
- **reports**: Reportes de uso de recompensas.

## Preguntas frecuentes

1. **¿Qué es una recompensa oculta?**
   → Producto que no se muestra en el menú hasta que el cliente desbloquee el criterio.

2. **¿Cómo la creo?**
   → Recompensas ocultas → "+ Nueva" → datos + criterio → guardar.

3. **¿Cuántas puedo tener?**
   → Plan buy: 20 por sede. Plan full: ilimitado.

4. **¿Cómo desbloquea el cliente la recompensa?**
   → Cuando cumple el criterio (puntos, monto, frecuencia), aparece en su menú.

5. **¿Los managers pueden crear recompensas?**
   → No, solo admin.

6. **¿Puedo poner descuento especial?**
   → Sí, definir precio especial al crear.

7. **¿Puedo limitar cuántas veces se usa?**
   → Sí, configurar límite de uso por cliente.

8. **¿Qué criterios puedo usar?**
   → Puntos acumulados, monto de compra, frecuencia de visita.

9. **¿Los cajeros ven las recompensas?**
   → Ven cuando se activa al cobrar.

10. **¿Puedo desactivar una recompensa?**
    → Sí, seleccionar → "Desactivar".

## Errores y mensajes comunes

| Mensaje | Causa | Solución |
|---------|-------|----------|
| `Hidden Rewards requires buy plan` | Plan trial/try. | Actualizar plan a buy/full. |
| `Rewards limit reached` | Límite 20 alcanzado (plan buy). | Actualizar plan a full o eliminar recompensas. |
| `Insufficient permissions` | Rol no admin. | Pedir al admin. |
| `Criterion not met` | Cliente no cumple criterio. | Esperar a que cumpla. |
| `Product not found` | Producto asociado no existe. | Verificar producto en menú. |

## Recomendaciones y buenas prácticas

- **Crear recompensas atractivas**: Motivar exploración del menú.
- **Usar criterios alcanzables**: No tan altos que nadie los logre.
- **Rotar recompensas**: Cambiar periódicamente para mantener interés.
- **Comunicar existencia**: Informar que hay recompensas especiales.
- **Revisar uso**: Analizar cuáles son más efectivas.

## Qué hacer si no funciona

Si recompensas ocultas no aparecen o no se activan:
1. Verificar plan buy/full.
2. Verificar recompensa creada y activa.
3. Verificar criterio de activación.
4. Verificar que el cliente cumpla el criterio.
5. Si persiste, contactar soporte con: negocio, plan, recompensa, criterio, error.

## Descripción breve para negocios que NO lo tienen activo

El módulo Hidden Rewards permite crear recompensas ocultas en el menú que se activan automáticamente cuando los clientes cumplen ciertos criterios (puntos, monto de compra, frecuencia). Fomenta la exploración y recompra. Disponible desde plan Crecimiento (buy, hasta 20 por sede) o Premium (full, ilimitado).