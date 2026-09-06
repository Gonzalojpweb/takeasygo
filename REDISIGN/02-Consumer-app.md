# Especificación de rediseño — Consumer App (`/app`)
### Documento 2 de 2 — Depende de: `01-sistema-de-diseno-tgo.md`

**Fecha:** 2026-09-05
**Alcance:** Home, Mapa, Descubrí, Perfil/Login, Tracking del pedido
**Referencia de estado actual:** capturas de producción, Sept 2026

Este documento asume que quien lo lee ya conoce `01-sistema-de-diseno-tgo.md`. No se repiten los tokens ni la tabla de expresiones del Punto TGO acá — se referencian por número de sección.

---

## 0. Orden de prioridad (hacer en este orden, no en paralelo)

| # | Ítem | Por qué va primero |
|---|------|---------------------|
| 1 | **Arreglar el mapa roto** (`API KEY REQUIRED` visible en producción) | Es un bug, no una decisión de diseño. Bloquea evaluar cualquier rediseño del mapa real. |
| 2 | **Construir el componente `<PuntoTGO />` único** (Sección 6 de este doc) | Todo lo demás lo consume — pin de mapa, avatar de tracking, ícono de listado. |
| 3 | **Sacar los CTAs de "Registrar mi local" del login y del feed** | Es el fix de más impacto/menor esfuerzo — una línea de negocio contaminando toda la experiencia de consumo. |
| 4 | **Unificar la lista "Cerca de vos" bajo el sistema Punto TGO/Directorio** | Hoy es un borde de color; pasa a ser el sistema completo de la Sección 3.4 del doc 1. |
| 5 | **Home: reordenar jerarquía visual** | Requiere que el componente de pin y las cards ya estén migrados. |
| 6 | **Tracking del pedido: reemplazar emojis por expresiones del Punto TGO** | Depende del componente del punto 2. |

---

## 1. Home (`/app`, tab Inicio)

### 1.1 Estado actual — problemas puntuales

- Cuatro paletas compitiendo en una pantalla: card de saludo navy, pill "Compartí" naranja sólido, íconos de cocina en pasteles random, bordes de lista verde/amarillo.
- El bloque "LA CIUDAD AHORA MISMO" (4 números de colores distintos: verde, amarillo, violeta, celeste) no comunica jerarquía — parece un dashboard de admin metido en el feed del consumidor.
- Card de adquisición de restaurantes ("¿Tenés un restaurante? Sumate...") flotando en medio del scroll de comida — nivel de interrupción injustificado para un feed de exploración.
- Las cards de "Cerca de vos" alternan borde verde (Pedir) / amarillo (Ver carta) sin ninguna otra señal visual de la diferencia.

### 1.2 Rediseño

**Header (saludo + acceso a perfil):**
- Reemplaza la card navy por fondo `--tgo-surface-2` plano, texto `--tgo-text-primary`. El saludo es tipografía Section (1.5rem/700), no necesita una card propia — es texto de header directo, como en Waze ("Buenas tardes" nunca vive dentro de una tarjeta oscura ajena al resto de la pantalla).
- El avatar de perfil en la esquina pasa a ser directamente el `<PuntoTGO />` del usuario (ver Sección 6.2) — mismo lenguaje visual que los pines del mapa, reforzando que el usuario también es parte de la red, no un ícono de persona genérico.

**"Ahora mismo" (antes "LA CIUDAD AHORA MISMO"):**
- Se reduce a **un solo color de acento** (`--tgo-brand`) con los 4 números en la misma jerarquía tipográfica — el contraste lo da el tamaño del número, no 4 colores distintos compitiendo.
- Este bloque usa `pulse-live` (Sección 2.5 doc 1) en el punto verde de "en vivo" — es el único elemento de la pantalla con derecho a pulsar, porque es dato real cambiando.

**Categorías de cocina:**
- Los círculos pasteles se migran a un solo tratamiento: fondo `--tgo-surface-1`, ícono en `--tgo-brand` al seleccionar. Elimina la paleta arcoíris actual (rosa, durazno, celeste, verde random) — el color ya no es decorativo, se reserva para estado.

**Lista "Cerca de vos":**
- Reemplaza el borde de color suelto por el sistema completo de la Sección 3.4 (doc 1): avatar = `<PuntoTGO />` en vez de logo crudo, con cara completa + `pulse-live` si es Punto TGO activo, cara apagada y sin animación si es Directorio.
- El botón de acción ya está bien resuelto (Pedir / Ver carta) — se mantiene, solo se le agrega `tap-feedback`.

**Card de adquisición de restaurantes:**
- Se elimina del feed. Se reubica exclusivamente como resultado de tocar un pin Directorio en el Mapa (Sección 3.4, doc 1) — ahí sí tiene sentido contextual (estás mirando un local que no está en la red, ahí es el momento de invitarlo).

**Carruseles ("Recién llegaron a la red", "Para este momento", "Hoy podés aprovechar"):**
- Se mantienen conceptualmente — son buen contenido — pero cada card debe usar `--tgo-radius-md` consistente (hoy varía) y el badge "NUEVO" pasa a usar `--tgo-discovery` en vez de un gradiente de colores random (naranja/rosa/violeta) en el borde de la card de Puro Café.

### 1.3 Componentes a construir/migrar

| Componente | Estado | Prioridad |
|---|---|---|
| `<PuntoTGO />` | Nuevo (compartido, ver Sección 6) | Alta |
| `<LiveCityMetricsBar />` | Migrar de `LiveCityMetrics.tsx` — bajar a 1 color de acento | Media |
| `<NearbyListItem />` | Migrar de la lista actual en `NearbyModule` — integrar `<PuntoTGO />` | Alta |
| `<CategoryChip />` | Migrar — un solo tratamiento de color | Baja |

---

## 2. Mapa (`/app`, tab Mapa)

### 2.1 Estado actual — problemas puntuales

- `API KEY REQUIRED` tapizando el basemap — bug de configuración de Carto/Leaflet, prioridad 1 del documento.
- Pines son logos de marca crudos metidos en un círculo, sin relación con la identidad TGO — el usuario no tiene forma de distinguir a simple vista un Punto TGO de un Directorio.
- Los "clusters" numerados (2, 6, 3...) no tienen ninguna jerarquía visual — todos son círculos naranja idénticos independientemente de si agrupan 2 o 6 locales.
- El banner "Hay 4 lugares nuevos cerca tuyo" flota sobre el mapa sin integrarse al lenguaje visual del resto de la pantalla (es un pill amarillo aislado).

### 2.2 Rediseño

- **Basemap:** paleta desaturada, cálida, acorde a `--tgo-bg` — no el gris frío de Carto default. Ver mockup ya compartido en esta conversación como referencia visual del tono.
- **Pines:** cada local se representa con `<PuntoTGO />` (Sección 6) en el color/expresión correspondiente según 3.3/3.4 del doc 1. El logo del restaurante, si se necesita, va *dentro* del callout al tocar el pin — no reemplaza la cara del pin.
- **Clusters:** el tamaño del pin de cluster escala con la cantidad (34px para 2, hasta ~46px para 8+), y el color de fill es siempre `--tgo-brand` — el número adentro es lo que comunica cantidad, no un color distinto por cluster.
- **Banner de descubrimiento ("Hay 4 lugares nuevos")**: pasa a usar `--tgo-discovery` con la tipografía Label del sistema, y se anima con `enter-up` al aparecer — no queda flotando estático arriba a la izquierda todo el tiempo.
- **Callout al tocar un pin:** ver especificación completa en la Sección 3.4 del doc 1 — varía según sea Punto TGO o Directorio.

### 2.3 Componentes a construir/migrar

| Componente | Estado | Prioridad |
|---|---|---|
| Fix de configuración Leaflet/Carto (API key) | Bug — no es de diseño | Crítica |
| `<PuntoTGO />` (variante pin de mapa) | Nuevo | Alta |
| `<MapCluster />` | Nuevo — reemplaza los círculos numerados actuales | Media |
| `<MapCallout />` | Nuevo — dos variantes (red / directorio) | Alta |

---

## 3. Descubrí (tab central, FAB)

### 3.1 Estado actual

Esta pantalla ya tiene el mejor indicio del concepto correcto: el contador explícito "30 EN RED · 20 DIRECTORIO" arriba de la lista. El problema es que después ese concepto no se refleja en ningún otro elemento de la pantalla — la lista de abajo vuelve al mismo patrón de borde de color suelto que Home.

### 3.2 Rediseño

- El contador "EN RED / DIRECTORIO" se mantiene y se convierte en el header conceptual de la pantalla completa — es honestamente el mejor copy que ya existe en el producto para explicarle al usuario el concepto sin jerga.
- El punto verde antes de "EN RED" pasa a ser literalmente un `<PuntoTGO />` en miniatura (16px, cara simplificada) en vez de un dot genérico — refuerza la marca incluso en un detalle chico.
- La lista de resultados usa el mismo `<NearbyListItem />` migrado en la Sección 1.3 — **no se construye un componente de lista distinto para esta pantalla**. Home y Descubrí muestran el mismo tipo de dato, deberían compartir el componente.
- Los filtros (chips de categoría) usan el mismo `<CategoryChip />` de Home.

### 3.3 Componentes a construir/migrar

| Componente | Estado | Prioridad |
|---|---|---|
| `<NetworkCounterHeader />` | Nuevo — pequeño, alto impacto | Media |
| Reuso de `<NearbyListItem />` y `<CategoryChip />` | Ya definidos en Home | — |

---

## 4. Perfil / Login

### 4.1 Estado actual

Pantalla de login de consumidor mezclada con adquisición de restaurantes: "Registrar mi local" y "Accedé a tu panel de gestión" aparecen debajo de los botones de Google/Email, en el mismo nivel de jerarquía visual.

### 4.2 Rediseño

- Los tres métodos de login (Apple/Google/Email) quedan solos como contenido principal de la pantalla.
- Los dos accesos de negocio ("Registrar mi local" / "Accedé a tu panel") se separan visualmente con un divisor claro y bajan de jerarquía tipográfica (Caption en vez de Body) — siguen existiendo porque son un acceso legítimo, pero dejan de competir visualmente con el login de consumidor.
- El ícono de usuario genérico en el círculo superior se reemplaza por `<PuntoTGO />` en estado neutro (sin red, gris) — consistencia con el resto del sistema.

### 4.3 Componentes a construir/migrar

| Componente | Estado | Prioridad |
|---|---|---|
| Reordenar jerarquía existente (sin componentes nuevos) | — | Alta (esfuerzo bajo, impacto alto) |

---

## 5. Tracking del pedido

### 5.1 Estado actual

El pipeline de 9 estados ya está bien pensado a nivel de producto (ver doc de eventos: `OrderTracker`, `LiveTrackingBadge`, `PostDeliveryCelebration`, etc.) pero cada estado dispara un emoji distinto y sin relación visual entre sí (💳 → ⏳ → ✅ → 👨‍🍳 → 🎉 → 🚗 → 📍 → 🍽️).

### 5.2 Rediseño

- Se reemplazan **todos** los emojis de estado por el `<PuntoTGO status={orderStatus} />` con la tabla de expresión exacta de la Sección 3.3 del doc 1. Es el mismo personaje atravesando el pedido — no 9 íconos sin relación.
- Las animaciones (`wiggle`, `pulse`, `bounce`, SVG draw-check) que hoy están dispersas en distintos componentes pasan a ser propiedades del propio `<PuntoTGO />` según su tabla de estado — el componente decide su animación en base al `status` que recibe, no cada pantalla por separado.
- Los toasts de `OrderTracker` (9 hoy) se re-priorizan según la Sección 4.1 del doc 1: confirmación de estado = toast (nivel 2), llegada del delivery = toast + haptic, entrega completada = celebración (nivel 3, uno de los 3 momentos reservados).

### 5.3 Componentes a construir/migrar

| Componente | Estado | Prioridad |
|---|---|---|
| `<PuntoTGO status={...} />` con las 10 variantes de la tabla 3.3 | Extiende el componente base de Home/Mapa | Alta |
| Reordenar prioridad de toasts existentes según Sección 4.1 doc 1 | Sin componente nuevo | Media |

---

## 6. El componente `<PuntoTGO />` — especificación técnica

Este es el componente más importante de todo el sistema porque lo consumen las 5 pantallas de este documento. Se construye **una sola vez**, acá, antes de tocar cualquier pantalla.

### 6.1 Props

```ts
type PuntoTGOProps = {
  variant: 'pin' | 'avatar' | 'inline';  // pin=mapa, avatar=perfil/tracking, inline=listas
  status?: OrderStatus;                   // si se omite, usa 'network' en su lugar
  network?: 'live' | 'dormant';           // Punto TGO vs Directorio (ver 3.4 doc 1)
  size?: 'sm' | 'md' | 'lg';              // 16 / 34 / 46px aprox., ver 3.2 doc 1
  animate?: boolean;                      // permite forzar apagar animación (ej. en listas densas)
};
```

### 6.2 Reglas de resolución visual

1. Si `status` está definido → se prioriza la tabla 3.3 del doc 1 (color + expresión + animación de estado de pedido).
2. Si no hay `status` pero hay `network` → se resuelve por la tabla 3.4 del doc 1 (Punto TGO vivo vs Directorio apagado).
3. Si no se pasa ninguno de los dos → estado neutro (gris, cara en reposo, sin animación) — usado en el login antes de autenticar.

### 6.3 Dónde se usa (para que quede trazado)

| Pantalla | Variant | Fuente de estado |
|---|---|---|
| Home — avatar de perfil | `avatar` | `network` (si el usuario tiene club activo) |
| Home — lista "Cerca de vos" | `inline` | `network` |
| Mapa — pines | `pin` | `network`, o `status` si hay pedido activo en ese local |
| Descubrí — contador de red | `inline`, `size=sm` | `network` |
| Tracking — header del pedido | `avatar`, `size=lg` | `status` |
| Perfil/Login — ícono superior | `avatar` | ninguno (neutro) |

---

## 7. Qué queda fuera de este documento

- Admin Panel, Tenant Menu Ordering y Marketing Landing — se especifican en un documento separado, ya con el sistema de tokens del doc 1 como base.
- Checkout (dual arquitectura legacy/nueva, issue 12.1 de la auditoría original) — requiere decisión de producto (cuál se descarta) antes de poder especificar visualmente, no es un tema de diseño puro.

---

*Fin del documento — Consumer App v1.0*
