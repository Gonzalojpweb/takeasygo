# Auditoría UX/UI — TakeasyGO App (SaaS)

**Fecha:** 2026-09-05
**Para:** Equipo de Desarrollo, Producto y Frontend UX
**Objetivo:** Insumo para el rediseño completo de la experiencia. Estado REAL de la app hoy.

---

## 1. ARQUITECTURA DE INTERFACES

La app TakeasyGO tiene **4 interfaces de usuario distinctas**, cada una con su propio flujo, diseño y audiencia:

| # | Interfaz | Ruta | Audiencia | PWA |
|---|----------|------|-----------|-----|
| I | **Marketing Landing** | `/` | Restaurantes (lead gen) | No |
| II | **Consumer Explore App** | `/app` | Consumidores finales | ✅ Sí |
| III | **Tenant Menu Ordering** | `/[tenant]/menu/...` | Clientes del restaurante | ✅ Sí |
| IV | **Admin Panel** | `/[tenant]/admin/` | Dueños/mánagers del restaurante | ✅ Sí |

### Superficie total

- **130+ rutas** en el app router
- **270+ componentes** React
- **200+ endpoints** API
- **3 context providers** (Tenant, Checkout, AdminLocation)
- **804 líneas** de CSS design system en `globals.css`

---

## 2. SISTEMA DE DISEÑO (DESIGN TOKENS)

### 2.1 Identidad dual

La app tiene **dos sistemas visuales separados**:

| Capa | Uso | Paleta | Font |
|------|-----|--------|------|
| **Admin (shadcn)** | Panel de administración | Neutros fríos (oklch hue 285) | Geist |
| **Consumer (spatial)** | App del consumidor + Menú | Neutros cálidos (hex browns/beiges) | Inter |

**Esto es un problema de consistencia.** El admin y el consumidor parecen apps diferentes.

### 2.2 Paleta de colores

**Brand primario:** `#F74211` (naranja-rojo vibrante) — consistente en ambas capas

**Consumer (tokens `--tgo-*`):**
```
Fondo:      #E7E2E3 (gris cálido claro)
Surface:    #ECEAE9 → #FFFFFF (jerarquía de elevación)
Texto:      #2D2A4B (índigo oscuro) → #4E5067 → #98A2B3
Brand:      #F74211 → hover #E03A0F
Success:    #12B76A
Warning:    #F59E0B
Danger:     #D92D20
Info:       #3B82F6
Discovery:  #FAB300
Activity:   #2FBF71
Proximity:  #3A86C8
Reward:     #7A5AF8
```

**Consumer dark (`.consumer-dark`):**
```
Fondo:      #0d0b0a (negro cálido)
Surface:    #1a1816
Texto:      #f7f4f2 (blanco cálido)
Glass:      backdrop-filter: blur(20px) + rgba(26,24,22,0.72)
```

**Admin (shadcn `:root`):**
```
Primary:    #f54500
Background: oklch(0.985 0 0) (off-white)
Card:       oklch(96.332% 0.00387 106.908)
Border:     oklch(0.13 0.01 285 / 12%)
Sidebar:    oklch(0.13 0.01 285) (siempre oscuro)
```

### 2.3 Tipografía

| Rol | Admin | Consumer |
|-----|-------|----------|
| Display | Geist 700 2.5rem | Inter 700 2.5rem |
| Hero | — | Inter 700 2rem |
| Section | — | Inter 700 1.5rem |
| Title | Geist 600 1.25rem | Inter 600 1.25rem |
| Body | Geist 400 1rem | Inter 400 1rem |
| Caption | — | Inter 400 0.75rem |
| Label | — | Inter 600 0.6875rem |
| Tag | — | Inter 700 0.625rem |
| Code | JetBrains Mono | — |

### 2.4 Espaciado y radio

```
Espaciado:  4px → 8px → 12px → 16px → 20px → 24px → 32px → 48px → 64px
Radio:      0 → 12px (sm) → 20px (md) → 28px (lg) → 9999px (pill)
Max-width:  480px (mobile-first)
Page pad:   20px
Nav height: 64px (top) / 72px (bottom)
```

### 2.5 Sombras y elevación

```
Card:       0 2px 8px rgba(45,42,75,0.10)
Floating:   0 4px 12px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.03)
Dialog:     0 12px 40px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04)
Overlay:    0 0 0 100vmax rgba(26,26,26,0.48)
Glass:      backdrop-filter: blur(20px)
Glow:       glow-brand (naranja), glow-network (verde)
```

### 2.6 Movimiento

```
Duraciones: instant (0ms), fast (180ms), base (200ms), slow (220ms)
Easings:    standard, emphasized, enter, exit
Animaciones: shimmer-slide, fade-in-up, slide-up, pulse-glow, scale-in,
             wiggle, draw-check, halo-expand, pulse-ring, shine-border-rotate
Librería:   motion/react (Framer Motion v12+)
```

### 2.7 Componentes UI (shadcn)

```
accordion, alert, avatar, badge, blur-fade, border-beam, button (6 variants × 7 sizes),
card, cuisine-selector, dialog, dot-pattern, dropdown-menu, info-tooltip,
inline-guide, input, label, magic-card, number-ticker, particles,
pulsating-button, ripple, separator, sheet, shimmer-button, skeleton,
sonner, switch, table, tabs, text-animate, textarea
```

### 2.8 Componentes TGO (custom)

```
AnimatedLogoLoader, AnimatedNumber, Chip, DiscoveryContinuo, EasterEgg,
EmptyState, HorizontalScroller, LiveCityMetrics, PageTransition,
PullToRefresh, SearchBar, Section, SmartGreeting, SolidIconPill
```

### 2.9 Componentes de negocio

```
CategoryCard, ExperienceCard, MapPin, RestaurantCard
```

---

## 3. CONSUMER EXPLORE APP (`/app`)

### 3.1 Estructura de navegación

```
Bottom Nav (5 tabs):
├── Home (🏠) — DiscoveryFeed
├── Map (📍) — ExploreMap (Leaflet)
├── Discover (🔍) — FAB central
├── Orders (📋) — OrdersView
└── Profile (👤) — ProfileContent
```

### 3.2 Home — DiscoveryFeed

**Componente:** `DiscoveryFeed.tsx` + módulos modulares

```
DiscoveryFeed
├── SmartGreeting — "Buenas tardes, Gonzalo" + mascota
├── LiveCityMetrics — "127 pedidos ahora en Córdoba"
├── QuickFilters — [Abiertos] [Delivery] [Cercanos] [Beneficios]
├── CategoriesModule — Grid de categorías (comida, bebida, etc.)
├── NearbyModule — "Cerca tuyo" — restaurantes cercanos
├── ExperiencesModule — "Experiencias" — experiencias destacadas
├── TimeBasedModule — "Almuerzo" / "Cena" según hora
└── NewInNetworkModule — "Nuevos en la red"
```

**Pull-to-refresh:** Implementado con hook custom.
**Onboarding:** 11 etapas (nombre, edad, preferencias de cocina, zona, notificaciones, etc.)

### 3.3 Restaurant Detail

**Componente:** `RestaurantDetail.tsx`

```
RestaurantDetail
├── Hero image (full-width)
├── Info card (nombre, rating, distancia, horario)
├── Mini mapa (Leaflet)
├── Menú preview
├── Reseñas
├── Share button
└── CTA "Ver menú"
```

### 3.4 Orders View

**Componente:** `OrdersView.tsx`

```
OrdersView
├── Tabs: Activos | Pasados
├── OrderCard (status badge, items, total,时间)
└── Empty state
```

### 3.5 Profile

**Componente:** `ProfileContent.tsx`

```
Profile
├── User avatar + name
├── My Clubs (lista de clubs de fidelización)
├── Address selector
├── Settings
├── Impact badges
└── Logout
```

### 3.6 Store (Puntos)

**Componente:** `StoreView.tsx`

```
Store
├── Points balance header
├── Reward items grid
├── Redemption flow
└── Redemption success
```

---

## 4. TENANT MENU ORDERING (`/[tenant]/menu/`)

### 4.1 Flujo completo

```
/[tenant] → Location picker (si multi-sede)
  └─ /[tenant]/menu/[locationId] → Welcome landing
       ├─ Takeaway → /[tenant]/menu/[locationId]/takeaway
       │    └─ MenuPublicView → CustomizationSheet → Cart (Sheet)
       │         └─ /takeaway/checkout → CheckoutLayout (3 steps)
       ├─ Delivery → /[tenant]/menu/[locationId]/delivery
       │    └─ MenuPublicView → CustomizationSheet → Cart (Sheet)
       │         └─ /delivery/checkout → CheckoutLayout (4 steps)
       ├─ Dine-in → /[tenant]/menu/[locationId]/dine-in
       │    └─ MenuPublicView → CustomizationSheet → Cart
       ├─ Business → /[tenant]/menu/[locationId]/business
       │    └─ GroupSessionClient → Group ordering
       └─ Reservaciones → /[tenant]/reservas/[locationId]
            └─ ReservaForm → Exito
```

### 4.2 MenuPublicView (2,242 líneas — el componente más grande)

**Componente:** `components/menu/MenuPublicView.tsx`

```
MenuPublicView
├── Sticky header
│    ├── Logo del restaurante
│    ├── LocationBar (sede actual)
│    ├── Language toggle (ES/EN)
│    └── Cart button (con badge animado)
├── PointsStickyBar (si es miembro del club)
├── Category nav (horizontal scroll, Instagram-stories style)
│    └── Intersection observer para tracking de categoría activa
├── Featured items strip (bordered section)
├── PromotionCarousel (promociones activas)
├── StoreCarousel (recompensas del club)
├── BestSellersSection (top sellers)
└── Categories (todas las categorías)
     ├── Subcategory tabs
     └── Item cards
          ├── Image (con saturate(1.08) contrast(1.02))
          ├── Name + description
          ├── Price (con variant pricing)
          ├── Add button (+ / - controls)
          └── Like badge (si tiene likes)
```

**Layout configurable:** List (default) o Grid (`grid-cols-2`)

**Interacciones del carrito:**
- Items plain: add directo → upsell suggestions
- Items con customizaciones: abre `CustomizationSheet` (bottom sheet)
- Promociones: multi-slot picker para combos
- Upsell: modal post-add sugiere items complementarios
- Hidden Rewards: confetti toast si se descubre recompensa

**Carrito:** Bottom Sheet (`SheetContent side="bottom"`) con items +/- y total

### 4.3 CustomizationSheet (8 archivos)

```
CustomizationSheet/
├── index.tsx — Sheet principal
├── VariantPicker.tsx — Selección de variante (tamaño)
├── ModifierGroup.tsx — Grupo de modificadores
├── ModifierOption.tsx — Opción individual
├── QuantitySelector.tsx — Selector de cantidad
├── NotesInput.tsx — Notas especiales
├── PriceSummary.tsx — Resumen de precio
└── AddToCartButton.tsx — Botón de agregar
```

### 4.4 Checkout (Nueva arquitectura — CheckoutContext)

**State machine:** `useReducer` en `CheckoutContext.tsx:206-251`

**Steps:**
```
Takeaway: ['Tu pedido', 'Tus datos', 'Pago']            → 3 pasos
Delivery: ['Tu pedido', 'Dirección', 'Tus datos', 'Pago'] → 4 pasos
```

**Paso 0 — "Tu pedido":**
- `EstimatedTimeDisplay` — tiempo base + anuncios de delay
- `OrderSummaryWithUpsell` — items del carrito + controles + upsell
- `DeliveryModeToggle` — toggle takeaway/delivery

**Paso 1 — Dirección (delivery) o Tus datos (takeaway):**
- `DeliveryAddressForm` — calle, número, depto, ciudad + quote de envío
- `CustomerInfoForm` — nombre, teléfono (con selector de país), email, notas
- `PromoCodeInput` — código promocional
- `LoyaltySection` — puntos del club
- `LegalLinks` — términos y condiciones

**Paso 2/3 — Pago:**
- `PaymentConfirmation` — selector de método de pago + desglose de precio

**Navegación:**
- `CheckoutPaymentFooter` — barra fija inferior con "Volver"/"Continuar"
- `CheckoutMiniHeader` — barra fija superior con back, cart sheet, step label
- `CheckoutStepper` — indicador visual de pasos con círculos numerados

**Transiciones:** `AnimatePresence` con spring slide animation

### 4.5 Checkout (Legacy — CheckoutForm.tsx)

**⚠️ HAY DOS IMPLEMENTACIONES DE CHECKOUT:**

| Arquitectura | Archivo | Líneas | Uso |
|-------------|---------|--------|-----|
| **Nueva** | `CheckoutContext.tsx` + `CheckoutLayout.tsx` | 708 + 950 | Takeaway, Delivery |
| **Legacy** | `CheckoutForm.tsx` | ~1,200 | Dine-in, Business |

**Problema:** El legacy duplica ~90% de la lógica del context con `useState` local. Cualquier bug fix debe aplicarse en ambos lugares.

### 4.6 Métodos de pago

| Método | Condición | Comportamiento |
|--------|-----------|----------------|
| **MercadoPago** | Siempre disponible | Redirect a checkout MP |
| **Kripton** | `kriptonEnabled` | Redirect a URL Kripton |
| **Transferencia** | `transferEnabled` | Muestra datos bancarios (alias, CBU/CVU) |
| **Efectivo** | `cashEnabled` | Paga al retirar, descuento opcional |

**⚠️ Issue:** Si Kripton está habilitado, se auto-selecciona sobre MercadoPago. Puede sorprender al usuario.

### 4.7 Order Tracking (`/[tenant]/tracking/[orderNumber]`)

**Pipeline de 9 estados:**
```
awaiting_payment → pending → confirmed → preparing → ready → en_ruta → arrived → delivered
```

**Componentes:**
- `OrderTracker` — visualización del estado actual con timeline
- `LiveTrackingBadge` — badge de estado en tiempo real
- `StatusNotificationCard` — notificaciones de cambio de estado
- `DeliveryCodeDisplay` — código de verificación para delivery
- `CancelOrderModal` — modal de cancelación
- `ConfirmPickupButton` — botón de confirmación de retiro
- `RatingForm` — formulario de calificación post-entrega
- `PostDeliveryCelebration` — animación de confetti post-entrega
- `GoogleReviewPrompt` — prompt para reseña de Google
- `LikeOrderItemsModal` — like a items del pedido

### 4.8 Group Ordering (Business)

```
/[tenant]/menu/[locationId]/business/group/[token]
├── GroupSessionClient — sesión compartida
├── GroupAddConfirmModal — confirmar agregar item
└── Items manage by all participants
```

---

## 5. ADMIN PANEL (`/[tenant]/admin/`)

### 5.1 Layout

```
Admin Layout
├── DesktopSidebar (68px collapsed, 288px expanded, hover-to-expand)
├── AdminTopBar (sticky, section label + location selector)
├── AdminPushBanner (notificaciones push)
├── SystemAnnouncementBanner (anuncios del sistema)
└── AdminPWAProvider
```

**Sidebar — 7 grupos de navegación:**

### 5.2 Dashboard (`/admin`)

```
Dashboard
├── PlanBanner (progreso del trial)
├── OnboardingChecklist (checklist de setup)
├── StatsCards (ingresos, pedidos, ticket promedio)
├── KPIsMes (KPIs del mes)
├── MarginRecoveryCard ("mirá lo que recuperaste")
├── ICOWidget (resumen ICO)
├── MetodosPago (desglose por método de pago)
├── DeliveryConciliation (conciliación diaria)
├── ComisionesBanner (comisiones pendientes)
├── CashAdjustmentBanner (caja no cobrada)
├── MenuActividad (actividad del menú)
├── CalificacionesWidget (calificaciones)
├── ClubWidget (estadísticas del club)
└── PedidosRecientes (pedidos recientes)
```

**Quick actions:** Gestionar Menú, Promociones, Control de Caja, Ver Reportes

### 5.3 Orders Board (`/admin/orders`)

**Dos vistas:**

| Vista | Componente | Estado |
|-------|-----------|--------|
| **Kanban** | `OperationsBoard` | ✅ Activa (principal) |
| **Grid** | `OrdersManager` | ⚠️ Legacy (aún presente) |

**Kanban — 8 columnas:**
```
Transferencias → Pendientes → Confirmados → Preparando → Listos → En Ruta → Llegaron → Entregados
```

**OrderCard:** #, nombre, icono de modo, tiempo, monto, sede
**OrderContextPanel:** 3 tabs (Detalles, Timeline, Historial)
**DelayAnnouncementPopover:** Anuncios de delay configurables

**Auto-refresh:** 10s con pedidos activos, 30s sin pedidos

### 5.4 Menu Manager (`/admin/menu`)

```
MenuManager
├── Location selector
├── Category list (drag-and-drop reorder)
│    ├── Category card (nombre, imagen, disponibilidad)
│    ├── Subcategory list (nested)
│    └── Item list
│         ├── Item card (nombre, precio, imagen)
│         ├── Variant editor
│         ├── Customization groups
│         ├── Hidden rewards
│         ├── Suggest-with (cross-sell)
│         └── Availability per mode
├── Bulk operations (price update, business toggle)
├── Import menu modal
└── Global search
```

### 5.5 Settings (`/admin/settings`)

**11+ tabs:**

| Tab | Contenido |
|-----|-----------|
| Identidad | Colores, layout del menú, tipografía, logo |
| Perfil | Descripción, about, social links |
| Sedes | Horarios, Google Maps, reservations config |
| General | Settings generales |
| Pagos MP | Integración MercadoPago |
| Kripton | Pagos crypto |
| Notificaciones | WhatsApp phone, notify toggles |
| Transferencia | Config de transferencia |
| Efectivo | Config de efectivo |
| Recargos | Surcharges |
| Reservas | Sistema de reservas |
| POS | Integración POS |

**Incluye:** Preview mobile en vivo del menú con branding

### 5.6 Reports (`/admin/reports`)

```
ReportsDashboard
├── Date range picker
├── Revenue (total, net, surcharge, platform fee)
├── Orders (count, avg ticket)
├── Growth (% vs previous period)
├── Cancellation rate
├── Hourly distribution
├── TPP (Time to Prepare)
├── On-time %
├── MP conversion
├── Repurchase rate (90-day)
├── Revenue by category
├── Daily trend
├── Revenue by location
├── Payment method breakdown
├── Transfer commission
└── Upsell analytics
```

### 5.7 TIA — Intelligent Analysis (`/admin/tia`)

```
TiaDashboard (17 componentes)
├── SilSection (Sales Intelligence Layer)
├── InsightCard (AI-generated insights)
├── BestSellersAnalytics
├── TopProducts, DailySummary, CategoryComparison
├── BenchmarkSection (industry benchmarks)
├── HistoricalComparison, DailyInsightPro
├── ConversionFunnel, ClubGrowth
├── AnomalyAlert
├── TrendsOverview, TopFindings, WeekPriorities
├── RecommendationCard, OpportunitiesSection
└── (17 componentes en total)
```

### 5.8 CRM (`/admin/crm`)

```
CRMView
├── Customer list con segments
├── Customer detail modal
├── Customer insights, health scores
├── Segment badges
├── LTV dashboard
└── Retention funnel
```

### 5.9 Other admin pages

| Página | Componente | Propósito |
|--------|-----------|-----------|
| `/admin/promotions` | `PromotionsManager` | CRUD promociones |
| `/admin/marketing-qr` | `QrPromoConfig` | QR promos |
| `/admin/club` | `ClubInfoSettings` + `LoyaltyManager` | Club de fidelización |
| `/admin/go-plus` | `GoPlusSettings` | GO+ upgrade |
| `/admin/wallet` | `WalletDesignSettings` | Wallet digital |
| `/admin/store` | `StoreManager` | Tienda de puntos |
| `/admin/hidden-rewards` | `HiddenRewardsManager` | Recompensas escondidas |
| `/admin/notificaciones` | `PushNotificationManager` | Push notifications |
| `/admin/reviews` | `ReviewsClient` | Reseñas |
| `/admin/ico` | `TrialIcoReport` | ICO trial |
| `/admin/audit` | Audit log | Auditoría |
| `/admin/special-dates` | `SpecialDatesConfig` | Fechas especiales |
| `/admin/delivery` | `DeliveryFleetManager` | Flota de delivery |
| `/admin/printers` | `PrintersManager` | Impresoras |
| `/admin/users` | `UsersManager` | Usuarios |
| `/admin/billing` | `BillingPanel` | Facturación |
| `/admin/commissions` | `CommissionsPanel` | Comisiones |
| `/admin/ayuda` | `HelpCenter` | Centro de ayuda |
| `/admin/updates` | Changelog | Novedades |

---

## 6. MARKETING LANDING (`/`)

```
Landing Page
├── Navbar (sticky, logo, links, CTA)
├── Hero (GSAP animations + Framer Motion)
├── SobreNosotros
├── HowItWorks
├── ExperienceDemos
├── StackingFeatures
├── FeaturesDetail
├── Pricing
├── FAQ
├── DemoSection
└── CTASection
```

**Tecnologías:** GSAP + Framer Motion + Tailwind

---

## 7. CONSUMSUMER APP — OTRAS PÁGINAS

| Ruta | Componente | Propósito |
|------|-----------|-----------|
| `/app/promociones` | `PromocionesClient` | Feed de promociones |
| `/app/profile/clubs` | — | Lista de mis clubs |
| `/app/profile/club/[tenantSlug]` | — | Detalle de club |
| `/app/profile/settings` | `SettingsClient` | Settings del perfil |
| `/app/[id]` | `RestaurantDetail` | Detalle de restaurante |
| `/app/orders` | `OrdersView` | Historial de pedidos |

---

## 8. LOYALTY / CLUB SYSTEM

### 8.1 Onboarding del club

```
ClubOnboardingModal
├── OnboardingProgress (barra de progreso)
├── steps/
│    ├── FormStep (nombre, teléfono, email)
│    ├── PointsStep (explicación de puntos)
│    ├── WalletStep (agregar a Apple/Google Wallet)
│    ├── RewardAdvanceStep (adelanto de recompensa)
│    ├── WelcomeStep (bienvenida)
│    └── SuccessStep (éxito)
```

### 8.2 Funcionalidades

- **Points system:** Acumulación por compra
- **Tiers:** Niveles de membresía
- **Wallet:** Apple Wallet + Google Wallet
- **Store:** Catálogo de recompensas para canjear
- **Reward Advance (SOS):** Adelanto de recompensa con límites
- **Hidden Rewards:** Recompensas secretas que se descubren al comprar
- **WhatsApp integration:** Notificaciones por WhatsApp

---

## 9. DELIVERY SYSTEM

### 9.1 Delivery App (`/[tenant]/delivery/[token]`)

```
DeliveryInterface
├── TabBar (Pendientes | Activos | Completados)
├── PendingOrdersList
├── ActiveOrdersList
├── CompletedOrdersList
├── DeliveryArrivalButton
├── DeliveryCodeInput
└── DeliveryPushSetup
```

### 9.2 Admin Delivery (`/admin/delivery`)

```
DeliveryFleetManager
├── Delivery person list (CRUD)
├── Phone, name, active status
└── Token-based auth
```

---

## 10. ONBOARDING DEL CONSUMIDOR

```
OnboardingWizard (11 etapas)
├── GreetingStage — Bienvenida con mascota
├── NameStage — Nombre del usuario
├── AgeStage — Edad
├── CuisineStage — Preferencias de cocina
├── ZoneStage — Zona geográfica
├── ExperienceStage — Tipo de experiencia
├── NotificationStage — Permisos de notificación
├── PrivacyStage — Aceptación de privacidad
├── ManifestStage — PWA install prompt
├── AuthStage — Login/registro
└── WelcomeStage — Confirmación final
```

**Mascota:** `OnboardingMascot.tsx` — personaje animado guía

---

## 11. PATRONES DE UX RELEVANTES

### 11.1 Multi-tenant white-label
- Cada restaurante obtiene `/{slug}/` routes
- Custom fonts (Google Fonts + upload)
- Custom branding colors
- PWA manifest por tenant

### 11.2 Mobile-first
- `max-width: 480px` para consumer
- Safe area insets para notch
- Bottom nav (72px) en consumer
- Pull-to-refresh
- Haptic feedback (`useHaptic()`)

### 11.3 Real-time
- Socket.io para pedidos en vivo (admin)
- Auto-refresh intervals
- Sound notifications para nuevos pedidos
- Live tracking con polling

### 11.4 Gamification
- Confetti en celebrations (post-delivery, order ready, hidden rewards)
- Points system
- Tiers
- Hidden rewards discovery
- Impact badges

### 11.5 PWA
- Service workers
- Manifest por tenant
- Install prompts
- Offline awareness
- Apple/Google Wallet integration

### 11.6 AI/Intelligence
- TIA (17 componentes de analytics)
- CIS (Customer Intelligence System)
- Anomaly detection
- Benchmarking
- Conversion funnels

---

## 12. ISSUES DE UX/UI CONOCIDOS

### 12.1 Dual checkout architecture
```
PROBLEMA: Dos implementaciones de checkout (nueva + legacy)
RIESGO: Bug fixes deben aplicarse en ambos lugares
IMPACTO: Mantenimiento duplicado, inconsistencias potenciales
```

### 12.2 Kripton auto-selection
```
PROBLEMA: Si Kripton está habilitado, se auto-selecciona sobre MercadoPago
RIESGO: Sorprender al usuario que espera pagar con tarjeta
IMPACTO: Confusión en flujo de pago
```

### 12.3 MenuPublicView monolítico
```
PROBLEMA: 2,242 líneas en un solo componente
RIESGO: Difícil de mantener, testear y razonar
IMPACTO: Velocidad de desarrollo reducida
```

### 12.4 Customized items sin quantity control
```
PROBLEMA: Items con customizaciones no pueden incrementar cantidad desde checkout
RIESGO: Usuario debe remover y re-agregar para cambiar cantidad
IMPACTO: Fricción en flujo de checkout
```

### 12.5 No form persistence
```
PROBLEMA: Si el usuario cierra el tab, pierde todo el progreso del checkout
RIESGO: Pérdida de carrito completado
IMPACTO: Abandono de checkout
```

### 12.6 Dual identity (Admin vs Consumer)
```
PROBLEMA: Admin usa Geist + neutros fríos, Consumer usa Inter + neutros cálidos
RIESGO: Parecen dos apps diferentes
IMPACTO: Inconsistencia de marca
```

### 12.7 Legacy OrdersManager
```
PROBLEMA: Coexisten Kanban (nuevo) y Grid (legacy) para pedidos
RIESGO: Confusión sobre cuál usar
IMPACTO: Duplicación de esfuerzo
```

### 12.8 deliveryMode vs mode confusion
```
PROBLEMA: El state trackea 'mode' (ruta inicial) y 'deliveryMode' (toggle del usuario)
RIESGO: Pueden divergir
IMPACTO: Bugs sutiles en flujos de delivery
```

---

## 13. STACK TECNOLÓGICO

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Framework | Next.js (App Router) | — |
| UI Library | React | — |
| Styling | Tailwind CSS v4 | @tailwindcss/postcss |
| Component Library | shadcn/ui | v3.8.5 |
| Primitives | Radix UI | v1.4.3 |
| Variants | class-variance-authority | v0.7.1 |
| Merge | tailwind-merge | v3.5.0 |
| Animation | motion (Framer Motion) | v12.38.0 |
| Scroll | Lenis | v1.3.17 |
| Theme | next-themes | v0.4.6 |
| Maps | Leaflet | — |
| State | useReducer + Context | — |
| Storage | sessionStorage (cart) | — |
| PWA | next-pwa | — |

---

## 14. MAPA DE COMPONENTES POR AUDIENCIA

### Para el consumidor (consumer-facing)
- 45+ componentes en `components/explore/`
- 30+ componentes en `components/menu/`
- 10+ componentes en `components/checkout/`
- 10+ componentes en `components/tracking/`
- 15+ componentes en `components/club/`
- 10+ componentes en `components/delivery/`
- 11 componentes en `components/onboarding/`
- 14 componentes en `components/tgo/`

### Para el restaurante (admin-facing)
- 100+ componentes en `components/admin/`
- 12+ componentes en `components/admin/dashboard/`
- 6+ componentes en `components/admin/orders/`
- 17+ componentes en `components/admin/tia/`
- 7+ componentes en `components/admin/cis/`

### Para la plataforma (superadmin)
- 30+ componentes en `components/superadmin/`
- 11+ componentes en `components/superadmin/dashboard/`

### Shared
- 30+ componentes en `components/ui/` (design system primitives)
- 14 componentes en `components/tgo/` (TGO design primitives)
- 4 componentes en `components/tgo-business/` (business cards)
- 12+ componentes en `components/landing/` (marketing)

---

## 15. RESUMEN PARA EL EQUIPO DE REDISEÑO

### Lo que funciona bien
1. **Sistema de tokens espacial** (`--tgo-*`) — bien definido, 60+ tokens
2. **Mobile-first** — safe areas, bottom nav, pull-to-refresh
3. **PWA completa** — service workers, manifests, install prompts
4. **Real-time** — tracking en vivo, notificaciones de sonido
5. **Gamification** — confetti, points, hidden rewards
6. **Multi-tenant** — white-label real con branding custom
7. **Component library** — shadcn base + componentes TGO custom

### Lo que necesita rediseño
1. **Dual identity** — unificar admin y consumer bajo el mismo sistema visual
2. **MenuPublicView** — 2,242 líneas, necesita componentización
3. **Dual checkout** — eliminar la implementación legacy
4. **Admin sidebar** — 7 grupos con 30+ items, necesita reorganización
5. **Design tokens** — migrar admin a los tokens `--tgo-*` del consumer
6. **Componentes UI** — evaluar si shadcn es la base correcta o si crear desde cero
7. **Tipografía** — definir sistema tipográfico unificado (Geist vs Inter)
8. **Animaciones** — estandarizar patrón de transiciones (Framer Motion vs CSS)

### Superficie a cubrir
- **130+ rutas** a auditar y rediseñar
- **270+ componentes** a evaluar, reutilizar o reescribir
- **4 interfaces** a unificar visualmente
- **~800 líneas de CSS** a refactorizar
