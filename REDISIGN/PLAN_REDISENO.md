# PLAN REDISEÑO COMPLETO — TakeasyGO Consumer App

**Versión:** 1.0  
**Fecha:** 2026-09-05  
**Para:** Equipo completo (ingeniería + producto + diseño)  
**Documentos base:** `01-SD-tgo.md` (sistema de diseño) + `02-Consumer-app.md` (especificación consumer)

---

## Resumen Ejecutivo

**Problema:** La app consumer tiene 4 paletas de color compitiendo, mapa roto en producción, CTAs de adquisición contaminando el flujo de consumo, y un concepto de "Punto TGO vs Directorio" que existe en negocio pero es invisible en diseño.

**Solución:** 7 fases progresivas, cada una con entregable claro. La Fase 1 desbloquea todas las demás.

**Impacto estimado:**
- **Semana 1:** Tokens unificados + Fix mapa + Login cleanup (desbloquea todo)
- **Semana 2:** Componente `<PuntoTGO />` (dependencia de todo lo demás)
- **Semana 3-4:** Home + Mapa + Discover (el grueso del rediseño)
- **Semana 5:** Animaciones + limpieza final

**Ruta crítica:** Fase 1 → Fase 2 → Fase 3/4 (paralelo) → Fase 5 → Fase 6 → Fase 7

**Fuera del alcance:** Tracking del pedido (`OrderTracker.tsx`) — se mantiene sin cambios

---

## Fase 1: Fundamentos (Tokens + Fix Mapa + Login)

**Objetivo:** Una sola fuente de verdad visual + mapa funcional + limpiar ruido de negocio  
**Esfuerzo total:** ~8h

### 1.1 Renombrar tokens TGO para coincidir con doc 01 (2h)

**Archivo:** `apps/saas/app/globals.css`

| Doc 01 (target) | Código actual | Línea | Acción |
|-----------------|---------------|-------|--------|
| `--tgo-brand` | `--tgo-brand-primary` | 306 | Renombrar |
| `--tgo-bg` | `--tgo-surface-0` | 311 | Renombrar |
| `--tgo-success` | `--tgo-state-success` | 369 | Renombrar |
| `--tgo-warning` | `--tgo-state-warning` | 372 | Renombrar |
| `--tgo-danger` | `--tgo-state-danger` | 375 | Renombrar |
| `--tgo-info` | `--tgo-state-info` | 381 | Renombrar |
| `--tgo-dur-fast` | `--tgo-duration-fast` | 448 | Renombrar |
| `--tgo-dur-base` | `--tgo-duration-base` | 449 | Renombrar |
| `--tgo-dur-slow` | `--tgo-duration-slow` | 450 | Renombrar |

**Antes de renombrar:** Buscar todos los usos de cada token con grep para evitar romper estilos.

### 1.2 Agregar tokens dark mode (1h)

**Archivo:** `apps/saas/app/globals.css` — agregar en `[data-design="spatial"]`

```css
/* Dark Mode tokens */
--tgo-bg-dark: #0D0B0A;
--tgo-surface-1-dark: #1A1816;
--tgo-surface-2-dark: #242220;
--tgo-text-primary-dark: #F7F4F2;
--tgo-text-secondary-dark: #8A7F7A;
--tgo-text-muted-dark: #5A524D;
--tgo-border-dark: rgba(247, 244, 242, 0.08);
--tgo-brand-glow: rgba(241, 71, 34, 0.25);
```

### 1.3 Remapear shadcn aliases a tokens TGO (2h)

**Archivo:** `apps/saas/app/globals.css` — modificar `:root`

```css
/* Reemplazar valores hardcodeados por aliases TGO */
--primary: var(--tgo-brand);
--primary-foreground: #FFFFFF;
--background: var(--tgo-surface-1);
--foreground: var(--tgo-text-primary);
--card: var(--tgo-card);
--card-foreground: var(--tgo-text-primary);
--border: var(--tgo-border);
--input: var(--tgo-border);
--ring: var(--tgo-brand);
--destructive: var(--tgo-danger);
--sidebar: var(--tgo-text-primary);
--sidebar-foreground: var(--tgo-surface-2);
```

### 1.4 Eliminar import Geist, usar solo Inter (1h)

**Archivos:**
- `apps/saas/app/globals.css:120-123` — Cambiar `--font-heading: 'Geist'` a `'Inter'`
- `apps/saas/app/layout.tsx` — Eliminar import de Geist, mantener solo Inter
- Verificar que shadcn no use Geist directamente (buscar `Geist` en `components/ui/`)

### 1.5 Fix API key Carto/Leaflet (1h)

**Archivo:** `apps/saas/components/explore/ExploreMap.tsx`  
**Acción:** Verificar que `VITE_CARTO_API_KEY` esté configurada en Vercel SaaS env vars

### 1.6 Demover "Registrar mi local" del login (0.5h)

**Archivo:** `apps/saas/components/auth/LoginScreen.tsx`  
**Acción:** Separar visualmente los CTAs de negocio con divisor, bajar a Caption, mover debajo de los métodos de login

### 1.7 Eliminar CTA adquisición del feed (0.5h)

**Archivo:** `apps/saas/components/explore/DiscoveryFeed.tsx`  
**Acción:** Eliminar card "¿Tenés un restaurante? Sumate..." del feed del consumidor

**Entregable:** App usa un solo set de tokens, mapa funciona, login limpio  
**Riesgo:** Renombrar tokens puede romper estilos existentes  
**Mitigación:** Buscar todos los usos antes de renombrar; migrar gradualmente

---

## Fase 2: Componente `<PuntoTGO />`

**Objetivo:** Un solo componente que reemplaza pines de mapa, avatares de tracking, íconos de listado  
**Esfuerzo total:** ~12h

### 2.1 Definir props y tipos (2h)

**Archivo nuevo:** `apps/saas/components/tgo/PuntoTGO.tsx`

```typescript
interface PuntoTGOProps {
  // Variantes de renderizado
  variant: 'pin' | 'avatar' | 'inline';
  
  // Estados de orden (10 estados)
  status: 
    | 'idle'           // Sin pedido activo
    | 'confirmed'      // Pedido confirmado
    | 'preparing'      // En preparación
    | 'ready'          // Listo para retirar
    | 'pickup'         // En pickup
    | 'delivering'     // En delivery
    | 'arriving'       // Llegando
    | 'delivered'      // Entregado
    | 'completed'      // Completado
    | 'cancelled'      // Cancelado
  
  // Estados de red (2 estados)
  networkStatus?: 'live' | 'dormant';
  
  // Tamaño
  size: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  
  // Expresión facial (opcional, override manual)
  expression?: 'happy' | 'neutral' | 'sleepy' | 'excited' | 'worried';
  
  // Animación
  animate?: boolean;
  
  // Click handler
  onClick?: () => void;
}
```

### 2.2 Implementar variantes (pin/avatar/inline) (4h)

- **pin:** Para mapa — circular con borde, sombra `--tgo-shadow-float`
- **avatar:** Para tracking/feed — circular sin borde, fondo `--tgo-surface-1`
- **inline:** Para badges/counters —最小化, solo cara sin fondo

### 2.3 Implementar 10 estados de orden + 2 de red (3h)

| Estado | Expresión | Color | Animación |
|--------|-----------|-------|-----------|
| idle | neutro | `--tgo-surface-1` | Ninguna |
| confirmed | happy | `--tgo-brand` | `tap-feedback` |
| preparing | focused | `--tgo-brand` | `pulse-live` |
| ready | excited | `--tgo-success` | `celebrate` |
| pickup | running | `--tgo-brand` | `pulse-live` |
| delivering | running | `--tgo-brand` | `pulse-live` |
| arriving | excited | `--tgo-success` | `enter-up` |
| delivered | happy | `--tgo-success` | `celebrate` |
| completed | sleeping | `--tgo-surface-1` | `cross-fade` |
| cancelled | sad | `--tgo-danger` | `cross-fade` |
| live (red) | happy | `--tgo-network-live` | `pulse-live` |
| dormant (red) | sleepy | `--tgo-network-dormant` | Ninguna |

### 2.4 Agregar animaciones por estado (2h)

Cada estado define su animación automáticamente:
- `pulse-live`: Solo para `preparing`, `pickup`, `delivering`, `live`
- `celebrate`: Solo para `ready`, `delivered`
- `tap-feedback`: Solo para `confirmed`
- `enter-up`: Solo para `arriving`
- `cross-fade`: Solo para `completed`, `cancelled`

### 2.5 Documentar uso en Storybook (1h)

**Archivo nuevo:** `apps/saas/components/tgo/PuntoTGO.stories.tsx`

**Entregable:** `<PuntoTGO status="preparing" size="lg" />` funcional con todas las expresiones  
**Riesgo:** Las 10 expresiones SVG pueden ser complejas  
**Mitigación:** Empezar con 5 estados core (`idle`, `preparing`, `delivering`, `delivered`, `cancelled`), agregar extras después

---

## Fase 3: Home Feed

**Objetivo:** Feed limpio, un solo color de acento, `<PuntoTGO />` integrado  
**Esfuerzo total:** ~12h

### 3.1 Migrar `LiveCityMetrics` a un color (2h)

**Archivo:** `apps/saas/components/explore/LiveCityMetrics.tsx`  
**Acción:** Reemplazar 4 colores (verde, amarillo, violeta, celeste) por un solo `--tgo-brand`  
**Regla:** Solo el dato "en vivo" usa `pulse-live`, los demás son estáticos

### 3.2 Construir `<NearbyListItem />` con PuntoTGO (3h)

**Archivo nuevo:** `apps/saas/components/explore/NearbyListItem.tsx`  
**Componente actual:** Embebido en `NearbyModule`

```typescript
interface NearbyListItemProps {
  restaurant: Restaurant;
  isNetwork: boolean; // Punto TGO vs Directorio
  onClick: () => void;
}
```

- Avatar: `<PuntoTGO variant="avatar" size="md" networkStatus={isNetwork ? 'live' : 'dormant'} />`
- Borde: `--tgo-border` consistente (no verde/amarillo)
- Botón: `tap-feedback` al presionar

### 3.3 Migrar categorías a chip uniforme (1h)

**Archivo nuevo:** `apps/saas/components/explore/CategoryChip.tsx`  
**Componente actual:** Embebido en `DiscoveryFeed`

- Fondo: `--tgo-surface-1`
- Seleccionado: fondo `--tgo-brand`, texto `--tgo-text-inverse`
- Eliminar paleta arcoíris (rosa, durazno, celeste, verde random)

### 3.4 Reconstruir `DiscoveryFeed` con nuevos componentes (4h)

**Archivo:** `apps/saas/components/explore/DiscoveryFeed.tsx`  
**Acción:** Reemplazar JSX inline por `<NearbyListItem />`, `<CategoryChip />`, `<LiveCityMetrics />`

### 3.5 Reconstruir `HomeView` (2h)

**Archivo:** `apps/saas/components/explore/HomeView.tsx`  
**Acción:** Mantener como wrapper delgado, delegar a `DiscoveryFeed`

**Entregable:** Home con 1 color de acento, `<PuntoTGO />` en avatares, sin CTAs de adquisición  
**Riesgo:** `DiscoveryFeed` es grande (~400 líneas)  
**Mitigación:** Refactorizar en sub-componentes primero

---

## Fase 4: Mapa

**Objetivo:** Mapa con pines TGO, clusters dinámicos, callouts contextuales  
**Esfuerzo total:** ~16h

### 4.1 Reemplazar basemap CartoDB por paleta cálida (2h)

**Archivo:** `apps/saas/components/explore/ExploreMap.tsx`  
**Acción:** Cambiar CartoDB `light_all` por tile con paleta desaturada cálida  
**Alternativa:** Usar CartoDB `voyager` con filtro CSS warm

### 4.2 Reescribir pines con `<PuntoTGO />` (4h)

**Archivo:** `apps/saas/components/explore/ExploreMap.tsx`  
**Acción:** Reemplazar `pinSvg()`, `hitboxSvg()`, `pulsePinSvg()` con `<PuntoTGO />`  
**Problema:** `L.divIcon` usa HTML strings, no React  
**Solución:** Crear wrapper `renderPuntoTGOToHTML()` que convierta componente a HTML string

### 4.3 Construir `<MapCluster />` (3h)

**Archivo nuevo:** `apps/saas/components/explore/MapCluster.tsx`

- Tamaño escala con cantidad (34px para 2, ~46px para 8+)
- Color fill: `--tgo-brand`
- Número adentro comunica cantidad

### 4.4 Construir `<MapCallout />` (3h)

**Archivo nuevo:** `apps/saas/components/explore/MapCallout.tsx`  
**Dos variantes:**
- **Red (Punto TGO):** Avatar PuntoTGO + nombre + distancia + botón "Pedir"
- **Directorio:** Logo restaurante + nombre + CTA "Contale a este local sobre TGO"

### 4.5 Integrar banner de descubrimiento (1h)

**Archivo nuevo:** `apps/saas/components/explore/DiscoveryBanner.tsx`  
**Acción:** Pill flotante `--tgo-discovery` con tipografía Label, animación `enter-up`

### 4.6 Reconstruir `ExploreClient` (3h)

**Archivo:** `apps/saas/components/explore/ExploreClient.tsx`  
**Acción:** Integrar todos los nuevos componentes

**Entregable:** Mapa funcional con pines expresivos, clusters escalables, callouts informativos  
**Riesgo:** `L.divIcon` usa HTML strings (no React)  
**Mitigación:** Crear wrapper `PuntoTGO-to-HTML`

---

## Fase 5: Discover + Profile

**Objetivo:** Pantalla Discover con contador de red, profile limpio  
**Esfuerzo total:** ~5h

### 5.1 Construir `<NetworkCounterHeader />` (1h)

**Archivo nuevo:** `apps/saas/components/explore/NetworkCounterHeader.tsx`

- Texto: "30 EN RED · 20 DIRECTORIO"
- `<PuntoTGO />` miniatura (16px) antes de "EN RED"
- Fondo: `--tgo-surface-2`

### 5.2 Integrar `<NearbyListItem />` en Discover (2h)

**Archivo:** `apps/saas/components/explore/DiscoverView.tsx`  
**Acción:** Reusar componente de Fase 3

### 5.3 Reordenar jerarquía del login (1h)

**Archivo:** `apps/saas/components/auth/LoginScreen.tsx`  
**Acción:** Los 3 métodos de login quedan solos, CTAs de negocio bajan con divisor

### 5.4 Reemplazar ícono genérico por PuntoTGO neutro (1h)

**Archivo:** `apps/saas/components/profile/ProfileView.tsx`  
**Acción:** `<PuntoTGO variant="avatar" size="lg" status="idle" />`

**Entregable:** Discover usa contador de red, profile consistente con marca

---

## Fase 6: Animaciones

**Objetivo:** 6 patrones canónicos, 97 pulses → solo datos reales, 7 confettis → 3  
**Esfuerzo total:** ~14h

### 6.1 Mapear 35+ keyframes existentes a 6 patrones (4h)

**Archivo:** `apps/saas/app/globals.css`

| Patrón canónico | Keyframes actuales que reemplaza |
|----------------|----------------------------------|
| `tap-feedback` | `ripple`, `pulse-quick` |
| `enter-up` | `slide-up`, `float-in` |
| `pulse-live` | `glow-pulse`, `pulse-ring` (solo datos reales) |
| `celebrate` | `confetti-burst`, `wiggle`, `bounce` |
| `shimmer-load` | `shimmer-slide`, `shiny-text`, `gradient` |
| `cross-fade` | `fade-in`, `fade-out`, `opacity-transition` |

### 6.2 Eliminar keyframes no usados (2h)

**Acción:** Después de mapear, eliminar keyframes huérfanos

### 6.3 Eliminar componentes decorativos (2h)

| Componente | Razón | Reemplazo |
|-----------|-------|-----------|
| `Particles.tsx` | Decorativo, no data-driven | Ninguno (eliminar) |
| `MagicCard.tsx` (orb) | Genérico, no TGO | `GlassCard` con `--tgo-surface-glass` |
| `BorderBeam.tsx` | Decorativo | Ninguno (eliminar) |
| `GlowEffect.tsx` | Decorativo | Solo en overlays de celebración |

### 6.4 Reducir 97 pulses a datos reales (4h)

**Regla:** `pulse-live` solo para elementos con datos cambiando en tiempo real:
- PuntoTGO en status `preparing`, `pickup`, `delivering`
- LiveCityMetrics "en vivo"
- Map pins de locales activos

**NO usar pulse-live para:**
- Badges decorativos
- Elementos estáticos
- Loading states

### 6.5 Reducir 7 confettis a 3 momentos (2h)

| Mantener | Eliminar |
|----------|----------|
| Pedido confirmado | Primera compra |
| Delivery completado | Nivel de usuario |
| Hito de lealtad | Rating 5 estrellas |
| | Registro exitoso |

**Entregable:** 6 animaciones canónicas, sin pulses decorativos, confetti solo en celebraciones

---

## Fase 7: Limpieza Final

**Objetivo:** Eliminar deuda técnica, verificar consistencia  
**Esfuerzo total:** ~10h

### 7.1 Eliminar componentes deprecados (2h)

**Acción:** Eliminar archivos de Fase 6.3 después de verificar que no hay imports

### 7.2 Verificar que ningún componente hardcodea colores (3h)

**Acción:** Buscar `#[0-9a-fA-F]`, `rgb(`, `oklch(` en componentes (no en `globals.css`)  
**Herramienta:** `grep -r "#[0-9a-fA-F]" apps/saas/components/`

### 7.3 Documentar decisiones en AGENTS.md (1h)

**Acción:** Agregar reglas del design system a AGENTS.md para que los ingenieros las respeten

### 7.4 QA visual completo (4h)

**Acción:** Revisar cada pantalla en:
- Light mode
- Dark mode
- Mobile (375px)
- Tablet (768px)

**Entregable:** App consistente, sin colores hardcodeados, documentada

---

## Resumen de Esfuerzo

| Fase | Horas | Dependencias | Componentes Nuevos |
|------|-------|--------------|-------------------|
| 1. Fundamentos | 8h | — | 0 |
| 2. PuntoTGO | 12h | Fase 1 | 1 |
| 3. Home | 12h | Fases 1-2 | 3 |
| 4. Mapa | 16h | Fases 1-2 | 3 |
| 5. Discover + Profile | 5h | Fases 1-3 | 1 |
| 6. Animaciones | 14h | Fase 1 | 0 |
| 7. Limpieza | 10h | Todas | 0 |
| **Total** | **~77h** | — | **8** |

---

## Archivos a Modificar (por fase)

### Fase 1
- `apps/saas/app/globals.css` — Tokens, aliases, fonts
- `apps/saas/app/layout.tsx` — Eliminar Geist
- `apps/saas/components/explore/ExploreMap.tsx` — Fix API key
- `apps/saas/components/auth/LoginScreen.tsx` — Demover CTAs
- `apps/saas/components/explore/DiscoveryFeed.tsx` — Eliminar CTA adquisición

### Fase 2
- `apps/saas/components/tgo/PuntoTGO.tsx` — **NUEVO**
- `apps/saas/components/tgo/PuntoTGO.stories.tsx` — **NUEVO**

### Fase 3
- `apps/saas/components/explore/LiveCityMetrics.tsx` — Un solo color
- `apps/saas/components/explore/NearbyListItem.tsx` — **NUEVO**
- `apps/saas/components/explore/CategoryChip.tsx` — **NUEVO**
- `apps/saas/components/explore/DiscoveryFeed.tsx` — Reconstruir
- `apps/saas/components/explore/HomeView.tsx` — Reconstruir

### Fase 4
- `apps/saas/components/explore/ExploreMap.tsx` — Reescribir pines
- `apps/saas/components/explore/MapCluster.tsx` — **NUEVO**
- `apps/saas/components/explore/MapCallout.tsx` — **NUEVO**
- `apps/saas/components/explore/DiscoveryBanner.tsx` — **NUEVO**
- `apps/saas/components/explore/ExploreClient.tsx` — Reconstruir

### Fase 5
- `apps/saas/components/explore/NetworkCounterHeader.tsx` — **NUEVO**
- `apps/saas/components/explore/DiscoverView.tsx` — Integrar NearByListItem
- `apps/saas/components/auth/LoginScreen.tsx` — Reordenar
- `apps/saas/components/profile/ProfileView.tsx` — PuntoTGO neutro

### Fase 6
- `apps/saas/app/globals.css` — Consolidar keyframes
- `apps/saas/components/tgo/Particles.tsx` — Eliminar
- `apps/saas/components/tgo/MagicCard.tsx` — Eliminar orb
- `apps/saas/components/tgo/BorderBeam.tsx` — Eliminar
- ~60 archivos — Reducir pulses

### Fase 7
- `AGENTS.md` — Documentar decisiones
- ~100 archivos — Verificar hardcodeo

---

## Riesgos y Mitigaciones

| Riesgo | Impacto | Probabilidad | Mitigación |
|--------|---------|--------------|------------|
| Renombrar tokens rompe estilos | Alto | Media | Buscar todos los usos antes de renombrar; migrar gradualmente |
| `L.divIcon` no soporta React | Medio | Alta | Crear wrapper `renderPuntoTGOToHTML()` |
| 10 expresiones SVG complejas | Medio | Media | Empezar con 5 estados core, agregar extras después |
| `DiscoveryFeed` muy grande | Medio | Alta | Refactorizar en sub-componentes antes de rediseñar |
| Geist elimination rompe Admin | Bajo | Baja | Verificar que shadcn no usa Geist directamente |
| 97 pulses a reducir | Medio | Alta | Hacer por archivo, no todo junto; testing visual |

---

## Decisiones Técnicas Pendientes

1. **Basemap del mapa:** CartoDB `voyager` con filtro CSS warm vs tile propio custom
2. **Wrapper React→HTML para pines:** `renderToStaticMarkup()` vs string template manual
3. **Confetti library:** Mantener `canvas-confetti` actual o migrar a `react-confetti`
4. **Storybook:** ¿Instalar Storybook para documentar componentes o solo documentar en código?

---

## Checklist de Aceptación

### Fase 1
- [ ] Todos los tokens usan prefijo `--tgo-*`
- [ ] No hay valores hardcodeados en componentes
- [ ] Geist eliminado, solo Inter
- [ ] Mapa muestra basemap (no "API KEY REQUIRED")
- [ ] Login no muestra "Registrar mi local" como CTA principal

### Fase 2
- [ ] `<PuntoTGO />` renderiza las 3 variantes
- [ ] Los 10 estados de orden muestran expresiones correctas
- [ ] Animaciones se disparan según estado

### Fase 3
- [ ] Home usa 1 solo color de acento (`--tgo-brand`)
- [ ] `<NearbyListItem />` muestra `<PuntoTGO />` como avatar
- [ ] Categorías usan chip uniforme

### Fase 4
- [ ] Pines del mapa son `<PuntoTGO />`
- [ ] Clusters escalan con cantidad
- [ ] Callouts muestran info correcta (red vs directorio)

### Fase 5
- [ ] Discover muestra contador de red
- [ ] Profile usa `<PuntoTGO />` neutro

### Fase 6
- [ ] Solo 6 keyframes canónicos en `globals.css`
- [ ] `pulse-live` solo en datos reales
- [ ] Confetti solo en 3 momentos

### Fase 7
- [ ] No hay componentes deprecados
- [ ] No hay colores hardcodeados
- [ ] AGENTS.md actualizado

---

**Fin del plan.** Este documento es la guía de implementación para el rediseño completo de la Consumer App de TakeasyGO.
