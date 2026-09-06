# Sistema de Diseño Unificado — TakeasyGO (TGO)
### Documento maestro v1.0 — Base para el rediseño completo

**Fecha:** 2026-09-05
**Para:** Fred (ingeniería/repo) + cualquier ingeniero que se sume al proyecto
**Precede a:** Documento de especificación de pantallas — Consumer App (próxima entrega)

---

## 0. Cómo leer este documento

Este documento es la **fuente de verdad** del nuevo sistema visual de TGO. No es una guía de estilo decorativa — es el contrato que todo componente nuevo (o migrado) tiene que cumplir. Si un ingeniero está construyendo algo y no encuentra la respuesta acá, es un bug de este documento, no una licencia para inventar un valor nuevo.

**Regla de oro:** ningún componente nuevo escribe un color, tamaño, sombra o duración de animación a mano (`#FFFFFF`, `16px`, `200ms`...). Todo se referencia desde los tokens de la Sección 2. Si el valor que necesitás no existe, se agrega al sistema de tokens primero — nunca se hardcodea en el componente.

---

## 1. Filosofía y concepto rector

### 1.1 La analogía Waze

TGO deja de ser "una app de delivery más" y pasa a ser **una capa de datos en tiempo real sobre un mapa vivo**, con una capa visual cartoon (el Punto TGO) que traduce ese dato crudo en algo emocional y legible de un vistazo.

Los 4 principios de Waze que gobiernan cada decisión de diseño de acá en adelante:

1. **El dato manda sobre la estética.** El mapa es central, la UI se vuelve casi invisible cuando el usuario está "en movimiento" (navegando, con un pedido en curso), y prioriza botones grandes, tocables sin mirar fijo.
2. **Gamificación social, no decorativa.** Puntos, niveles, avatares, actividad de otros usuarios en tiempo real — el usuario se siente parte de una red viva, no un cliente de una app.
3. **Diseño contextual.** La interfaz cambia según el momento: explorando vs. con un pedido activo vs. gestionando el local. No hay una sola pantalla que sirva para todo.
4. **Feedback inmediato y lúdico, pero con criterio.** Sonido, animación, confetti — con jerarquía. No todo merece la misma intensidad de celebración (ver Sección 6).

### 1.2 El problema que resolvemos primero

Hoy la app (ver capturas de referencia, Sept 2026) tiene:
- Cuatro paletas de color compitiendo en una sola pantalla (navy, naranja sólido, pasteles, verde/amarillo de borde)
- Cero jerarquía tipográfica
- Un mapa roto en producción (`API KEY REQUIRED` visible al usuario)
- Mensajes de adquisición de restaurantes contaminando el flujo del consumidor (login, feed)
- Un concepto de "Punto TGO vs Directorio" que **ya existe en la lógica de negocio** pero es invisible en el diseño (hoy es solo un borde de 3px de color)

Este documento resuelve la base (tokens, identidad, semántica) para que ese concepto de red viva pueda expresarse con claridad en cualquier pantalla.

---

## 2. Design tokens — capa única

**Decisión de arquitectura #1:** se elimina la dualidad Admin (shadcn/oklch/Geist) vs Consumer (`--tgo-*`/hex/Inter). Todo el producto — Landing, Consumer App, Tenant Menu, Admin Panel — consume **una sola capa de tokens**, prefijo `--tgo-*`. Shadcn se mantiene como librería de primitivos (Radix headless), pero sus variables de color se remapean a los tokens de acá, no al revés.

### 2.1 Paleta de color

```css
/* === MARCA === */
--tgo-brand:            #F74211;
--tgo-brand-hover:      #E03A0F;
--tgo-brand-pressed:    #C7330D;

/* === NEUTROS (superficie/texto) — reemplaza tanto oklch admin como hex consumer === */
--tgo-bg:               #E7E2E3;
--tgo-surface-1:        #ECEAE9;
--tgo-surface-2:        #FFFFFF;
--tgo-text-primary:     #2D2A4B;
--tgo-text-secondary:   #4E5067;
--tgo-text-muted:       #98A2B3;
--tgo-border:           #E2DAD1;

/* === SEMÁNTICOS DE ESTADO (una sola fuente para order status, payment, printer, etc.) === */
--tgo-success:          #12B76A;
--tgo-warning:          #F59E0B;
--tgo-danger:           #D92D20;
--tgo-info:             #3B82F6;

/* === RED / DESCUBRIMIENTO (exclusivos del sistema Punto TGO vs Directorio, ver Sección 4) === */
--tgo-network-live:     #12B76A;   /* Punto TGO activo */
--tgo-network-dormant:  #B4B2A9;   /* Directorio */
--tgo-discovery:        #FAB300;
--tgo-activity:         #2FBF71;
--tgo-proximity:        #3A86C8;
--tgo-reward:           #7A5AF8;

/* === DARK MODE (consumer-dark, se extiende a todo el producto) === */
--tgo-bg-dark:          #0D0B0A;
--tgo-surface-1-dark:   #1A1816;
--tgo-text-primary-dark:#F7F4F2;
```

**Regla de migración para Admin:** cada variable shadcn (`--primary`, `--background`, `--card`, `--border`, `--sidebar`) pasa a ser un *alias* de una `--tgo-*`. Ejemplo:

```css
--primary: var(--tgo-brand);
--background: var(--tgo-surface-1);
--border: var(--tgo-border);
```

Esto es lo que mata el issue 12.6 (dual identity) sin reescribir componente por componente — se resuelve en la capa de tokens.

### 2.2 Tipografía

**Decisión de arquitectura #2:** una sola familia tipográfica para todo el producto: **Inter**. Se elimina Geist del Admin.

Justificación: Inter ya está optimizada para UI densa de datos (que es exactamente el caso de uso del Admin — tablas, reportes, dashboards) y evita mantener dos sistemas de font-loading. `JetBrains Mono` se conserva, exclusivamente para bloques de código/IDs técnicos (ej. número de pedido).

| Rol | Font | Peso | Tamaño | Uso |
|-----|------|------|--------|-----|
| Display | Inter | 700 | 2.5rem | Landing, hitos grandes |
| Hero | Inter | 700 | 2rem | Headers de sección |
| Section | Inter | 700 | 1.5rem | Títulos de módulo |
| Title | Inter | 600 | 1.25rem | Cards, headers de pantalla |
| Body | Inter | 400 | 1rem | Texto general |
| Caption | Inter | 400 | 0.75rem | Metadata, timestamps |
| Label | Inter | 600 | 0.6875rem | Badges, tags de estado |
| Code | JetBrains Mono | 400 | 0.8125rem | IDs de pedido, códigos |

### 2.3 Espaciado y radio (sin cambios — ya estaba bien)

```css
--tgo-space-1: 4px;   --tgo-space-2: 8px;   --tgo-space-3: 12px;
--tgo-space-4: 16px;  --tgo-space-5: 20px;  --tgo-space-6: 24px;
--tgo-space-7: 32px;  --tgo-space-8: 48px;  --tgo-space-9: 64px;

--tgo-radius-sm: 12px; --tgo-radius-md: 20px;
--tgo-radius-lg: 28px; --tgo-radius-pill: 9999px;

--tgo-max-width: 480px;   /* mobile-first, todo el producto consumer */
--tgo-page-pad: 20px;
--tgo-nav-top: 64px;
--tgo-nav-bottom: 72px;
```

### 2.4 Elevación

```css
--tgo-shadow-card:     0 2px 8px rgba(45,42,75,0.10);
--tgo-shadow-float:    0 4px 12px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.03);
--tgo-shadow-dialog:   0 12px 40px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04);
--tgo-overlay:         0 0 0 100vmax rgba(26,26,26,0.48);
```

**Regla:** `backdrop-filter: blur()` (glass) queda reservado para overlays de celebración y el mapa — no para cards regulares de listado. Usarlo en todo hoy es lo que le resta la sensación de "dato denso" que buscamos (principio 1.1.1).

### 2.5 Movimiento — de 35 keyframes a 6 patrones canónicos

La auditoría de eventos detectó **20 keyframes globales + 15 por componente + 832 usos de Framer Motion**. Eso no es riqueza, es inconsistencia — cada ingeniero reinventa su propia animación. Se consolida en 6 patrones con nombre, cada uno con su duración/easing fija:

```css
--tgo-dur-instant: 0ms;
--tgo-dur-fast:    180ms;   /* micro-feedback: tap, toggle */
--tgo-dur-base:    200ms;   /* transiciones de UI estándar */
--tgo-dur-slow:    220ms;   /* entradas de sheet/modal */

--tgo-ease-standard:   cubic-bezier(0.2, 0, 0, 1);
--tgo-ease-emphasized: cubic-bezier(0.3, 0, 0.2, 1);
--tgo-ease-enter:      cubic-bezier(0, 0, 0.2, 1);
--tgo-ease-exit:       cubic-bezier(0.4, 0, 1, 1);
```

| Patrón canónico | Reemplaza a | Cuándo usarlo |
|---|---|---|
| `tap-feedback` | `active:scale-95/98/99` (100+ usos hoy) | Cualquier elemento tocable |
| `enter-up` | `fade-in-up`, `slide-up`, `message-enter` | Sheets, cards que aparecen en scroll |
| `pulse-live` | `pulse`, `mh-pulse`, `tgo-pulse-dot`, `pulse-ring`, `pulse-glow` | **Exclusivo** de elementos con dato en vivo (ver Sección 4 — Punto TGO) |
| `celebrate` | confetti + `scale-in` + `draw-check` | Solo en los 3 momentos de la Sección 6.3 |
| `shimmer-load` | `shimmer`, `.skeleton-shimmer` | Estados de carga |
| `cross-fade` | `AnimatePresence` genérico | Cambios de tab/step |

**Regla para ingenieros:** si vas a animar algo y no entra en esta tabla, para antes de escribir el keyframe. Probablemente ya existe un patrón que sirve, o es una animación decorativa que no necesitamos (ej. `Particles`, `MagicCard` orb, `BorderBeam` — quedan deprecados, no se portan al nuevo sistema).

---

## 3. Identidad — el Punto TGO

### 3.1 Qué es

El Punto TGO es el ícono de marca (la carita dentro del pin) y funciona como **el avatar del sistema completo** — aparece en el mapa, en el header del consumidor, en el tracking del pedido y (recomendado) en el admin como indicador de estado del local. Es el equivalente del "Wazer"/Moodie de Waze: la capa emocional sobre el dato duro.

### 3.2 Reglas de construcción del ícono

- Forma base: pin (gota) — nunca un círculo simple ni un cuadrado. La forma pin comunica "ubicación" sin texto.
- Cara: dos ojos + una boca, siempre dentro de un círculo blanco centrado en el pin.
- El color de fill del pin **es el que comunica estado** (ver tabla 3.3) — la forma nunca cambia, solo el color y la expresión de la boca/ojos.
- Tamaño mínimo tocable en mapa: 34×40px. Por debajo de eso, colapsa a badge numérico (cluster) — nunca a una versión "mini" de la cara (se vuelve ilegible y rompe la identidad).

### 3.3 Estados y expresiones (mapeado 1:1 con OrderStatus existente)

Esto reemplaza los emojis sueltos que hoy viven en los toasts de `OrderTracker` (💳🎉🚗📍✅) por una sola cara consistente que cambia de expresión — mismo personaje, distintos estados de ánimo:

| OrderStatus | Color de fill | Expresión | Animación |
|---|---|---|---|
| `awaiting_payment` | `--tgo-text-muted` (gris) | Ojos cerrados, boca neutra | ninguna |
| `awaiting_confirmation` | `--tgo-warning` | Ojos entrecerrados, expectante | `pulse-live` |
| `pending` | `--tgo-warning` | Neutra | ninguna |
| `confirmed` | `--tgo-info` | Sonrisa leve | `enter-up` + check dibujado |
| `preparing` | `--tgo-brand` | Ojos activos, boca en "o" (concentración) | `wiggle` suave, no `pulse` |
| `ready` | `--tgo-success` | Sonrisa amplia | `celebrate` (confetti corto) |
| `en_ruta` | `--tgo-proximity` | Sonrisa + inclinación de movimiento | `pulse-live` |
| `arrived` | `--tgo-success` | Ojos grandes, sorpresa feliz | `pulse-live` único (no infinito) |
| `delivered` | `--tgo-text-muted` | Ojos en forma de estrella (satisfacción) | `celebrate` |
| `cancelled` | `--tgo-danger` | Ojos en "x" | ninguna |

**Regla:** esta tabla es la única fuente de expresiones. Ningún componente define un emoji nuevo para un estado de pedido — todos consumen el Punto TGO con el color/expresión de esta tabla.

### 3.4 Punto TGO vs Directorio — la distinción central del mapa

Esto es lo que ya empezó a aparecer en el producto (el borde verde/amarillo de las listas) y necesita convertirse en el sistema visual explícito:

| | **Punto TGO** (en la red) | **Directorio** (fuera de la red) |
|---|---|---|
| Fill del pin | `--tgo-brand` (o color de OrderStatus si hay pedido en curso) | `--tgo-network-dormant` |
| Cara | Completa, expresiva, ojos + sonrisa | "Apagada" — dos rayas horizontales, sin sonrisa |
| Animación | `pulse-live` si tiene actividad ahora | **Ninguna** — nunca pulsa, nunca brilla |
| Sonido/haptic al interactuar | Sí (según Sección 6) | No |
| Al tocar | Abre menú completo / flujo de pedido | Abre card liviana: nombre, dirección, contacto — con CTA "Contale a este local sobre TGO" |
| Badge en listas | Borde `--tgo-network-live` | Borde `--tgo-network-dormant` |

**Por qué esto importa más de lo que parece:** todo el vocabulario de "vida" del sistema (pulso, sonido, confetti, haptic — Sección 6) queda **reservado exclusivamente** para Puntos TGO. Esto no es solo estética — es lo que convierte al Directorio en el motor de adquisición de restaurantes (issue de negocio) sin ensuciar el feed del consumidor con banners de venta (que es exactamente lo que critica la Sección 1.2).

---

## 4. Componentes de feedback — taxonomía y jerarquía

La auditoría de eventos registró ~280 toasts, 14 banners, 7 sheets, 16+ modales, 97 pulsos, 118 hápticos, 7 confettis. El problema no es la cantidad — es que **no hay una regla de cuándo usar cada uno**. Cada ingeniero decidió por su cuenta. Esta sección fija esa regla.

### 4.1 Jerarquía de intensidad (de menor a mayor interrupción)

1. **Micro-feedback silencioso** — `tap-feedback` + haptic `light` (10ms). Todo botón, todo toggle. No requiere texto.
2. **Toast** — confirma una acción que el usuario ya sabía que estaba pasando (agregar al carrito, guardar setting). Nunca bloquea. Máximo 1 toast visible a la vez — si llega uno nuevo, reemplaza al anterior, no se apilan.
3. **Banner** — informa algo persistente que el usuario puede ignorar y seguir usando la app (trial activo, efectivo no cobrado). Vive en el layout, no interrumpe el flujo.
4. **Sheet** — pide una decisión del usuario sin sacarlo de contexto (customizar un item, elegir sede). Se puede cerrar con swipe.
5. **Modal/Dialog** — bloquea porque la acción es irreversible o crítica (cancelar pedido, downgrade de plan). Es el nivel más alto — se reserva para decisiones con consecuencia real.
6. **Celebración** (confetti + sonido + haptic `success`) — reservada a 3 momentos exactos (Sección 6.3). No se usa como refuerzo genérico de "todo salió bien".

**Regla de oro:** antes de agregar un toast/modal/confetti nuevo, ubicalo en este nivel. Si dudás entre dos niveles, elegí el más bajo — la app de hoy peca sistemáticamente de sobre-interrumpir (ej: 13 validaciones de checkout que podrían ser inline-error en el campo, no toast).

### 4.2 Regla de sonido y haptic

- Sonido: **exclusivo del Admin** (alerta de pedido nuevo) y de momentos de celebración del consumidor (Sección 6.3). Nunca como confirmación de acciones rutinarias.
- Haptic `light`/`selection`: libre, en cualquier tap.
- Haptic `success`/`warning`/`error`: reservado a checkout, canjes, y transiciones de estado de pedido — no a toggles de UI.

### 4.3 Celebración — los 3 momentos que se ganan el confetti

De los 7 lugares que hoy tienen confetti, se consolidan a 3 momentos con justificación real de negocio:

1. **Pedido confirmado** (`confirmed`) — primer refuerzo positivo del ciclo.
2. **Entrega completada** (`PostDeliveryCelebration`) — cierre del ciclo, momento de pedir reseña.
3. **Hito de fidelización** (recompensa desbloqueada, tier alcanzado) — refuerza el sistema de puntos.

Todo lo demás (agregar el primer item al carrito, redimir un canje, like a un plato) baja a nivel 2 (toast) o nivel 1 (micro-feedback). El confetti pierde su valor si aparece 7 veces distintas en la misma sesión.

---

## 5. Reglas de gobernanza para ingeniería

1. **Ningún color hardcodeado.** Todo color en CSS/Tailwind/inline-style referencia una variable `--tgo-*`. Code review rechaza cualquier PR con un hex literal fuera del archivo de tokens.
2. **Ninguna animación nueva sin pasar por la Sección 2.5.** Si el patrón no existe, se propone como adición al sistema — no se escribe un keyframe de un solo uso.
3. **El Punto TGO (Sección 3) es un componente único y reusado**, no una ilustración distinta por pantalla. `<PuntoTGO status="preparing" size="lg" />` — nunca un SVG copiado y modificado a mano en cada lugar donde se necesita.
4. **Todo elemento con `pulse-live` tiene que tener un motivo de negocio real detrás** (hay dato en vivo cambiando). Pulsar por decoración queda prohibido — es lo que hoy hace que 97 elementos pulsando compitan entre sí por atención.
5. **Checklist de PR para cualquier componente visual nuevo:**
   - [ ] ¿Usa solo tokens de la Sección 2?
   - [ ] ¿Si es un pin o indicador de local, respeta la distinción Punto TGO/Directorio (3.4)?
   - [ ] ¿El nivel de feedback elegido (Sección 4.1) es el mínimo necesario?
   - [ ] ¿La animación usada es uno de los 6 patrones canónicos?

---

## 6. Qué sigue

Este documento fija la base (tokens, identidad, semántica, gobernanza). El próximo entregable es la **especificación de la Consumer App** (Home, Mapa, Descubrí, Tracking) pantalla por pantalla — antes/después, componentes exactos a usar de este sistema, y prioridad de migración, empezando por: (1) arreglar el mapa roto en producción, (2) sacar los CTAs de adquisición de restaurantes del flujo de consumidor, (3) implementar el Punto TGO como componente único.

---

*Fin del documento — Sistema de Diseño Unificado v1.0*
