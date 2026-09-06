# Eventos, Estados y Animaciones — TakeasyGO App

**Fecha:** 2026-09-05
**Para:** Equipo de Desarrollo, Producto y Frontend UX
**Objetivo:** Inventario completo de TODOS los elementos que le dan vida a la app.

---

## 1. TOAST NOTIFICATIONS (~280 llamadas en ~60 archivos)

### 1.1 Infraestructura

- **Librería:** Sonner v2.0.7
- **Setup:** `<Toaster />` en `app/layout.tsx:40` (global) + `app/[tenant]/admin/layout.tsx:181`
- **Posición default:** `top-center`
- **Variantes:** success, error, info, warning, loading, custom (con emoji + color)

### 1.2 Toasts del Consumidor (Menu/Checkout/Tracking)

#### OrderTracker (9 toasts)
| Emoji | Mensaje | Tipo | Trigger | Duración |
|-------|---------|------|---------|----------|
| ✅ | "Tu pedido fue confirmado" | custom (verde) | Status → confirmed | 6000ms |
| 🎉 | "¡Tu pedido está listo!" | custom (azul) | Status → ready | 10000ms |
| 🚗 | "Delivery en camino" | custom (amber) | Status → en_ruta | 8000ms |
| 📍 | "El delivery llegó" | custom (verde) | Status → arrived | 10000ms |
| ✅ | "Reward Advance consolidado" | custom (verde) | rewardAdvanceConsolidated | 6000ms |
| ✨ | "Reward Advance activado" | custom (amber) | rewardAdvanceApplied | 6000ms |
| 🌍 | "Generaste impacto" | custom (verde) | impactRegistered | 4000ms |
| 🎁 | PointsEarnedToast | custom | pointsEarned > 0 | 5000ms |
| 🔒 | "Tu pedido ya entró en preparación" | custom (rojo) | 3min post-confirmed | 5000ms |

#### MenuPublicView (6 toasts)
| Mensaje | Tipo | Trigger |
|---------|------|---------|
| 🎁 + reward.title + description | default | Hidden reward revelado |
| "No se pudo actualizar el like" | error | Like toggle falla |
| "Error al agregar item al pedido grupal" | error | Group session add falla |
| "${itemName} agregado al pedido grupal" | success | Group session add OK |
| "Este local está en modo catálogo" | info | Checkout en modo catálogo |
| "Estás en un pedido grupal" | info | Checkout en group session |

#### CheckoutPaymentFooter (13 toasts)
| Mensaje | Tipo | Trigger |
|---------|------|---------|
| "Tu carrito está vacío" | error | Carrito vacío en step 0 |
| "Completá la dirección de entrega" | error | Dirección faltante |
| "Calculá el costo de envío antes de continuar" | error | Sin quote de envío |
| "El nombre es obligatorio" | error | Nombre faltante |
| "El teléfono es obligatorio para unirse al club" | error | Club sin teléfono |
| "El email es obligatorio para unirse al club" | error | Club sin email |
| "Formato de email inválido" | error | Email malformado |
| "Seleccioná una fecha y hora para retirar" | error | Programado sin tiempo |
| "${err.message}" | error | Fallo en submission |

#### DeliveryModeToggle (2 toasts)
| Mensaje | Tipo | Trigger |
|---------|------|---------|
| "Delivery no habilitado" | error | Delivery deshabilitado |
| "Fuera del horario de delivery" | error | Fuera de horario |

#### DeliveryAddressForm (2 toasts)
| Mensaje | Tipo | Trigger |
|---------|------|---------|
| "Completá calle, número y barrio" | error | Campos faltantes |
| "Costo de envío calculado" | success | Quote calculado |

#### DineInMenuView (4 toasts)
| Mensaje | Tipo | Trigger |
|---------|------|---------|
| "${promotion.title} agregado al pedido" | success | Promoción agregada |
| "Unidad X de Y agregada" | success | Item de promoción agregada |
| "X × ${itemName} agregados" | success | Multi-unit promo agregada |

#### StoreView (3 toasts)
| Mensaje | Tipo | Trigger |
|---------|------|---------|
| "Necesitás X compras para canjear" | error | Compras insuficientes |
| "Canje exitoso. Tenés X puntos pendientes" | success | Canje OK (6000ms) |
| "${err.message}" | error | Canje falla |

#### StoreItemCard (1 toast)
| Mensaje | Tipo | Trigger | Duración |
|---------|------|---------|----------|
| "🎉 Recompensa disponible" | success | canAfford → true | 4000ms |

#### AddressSelector (5 toasts)
| Mensaje | Tipo | Trigger |
|---------|------|---------|
| "Completá la dirección y las coordenadas" | error | Campos faltantes |
| "Error al agregar dirección" | error | Add falla |
| "Error al eliminar dirección" | error | Delete falla |
| "Geolocalización no soportada" | error | Sin geolocation |
| "Error al obtener ubicación" | error | Geolocation falla |

#### BusinessMenuClient (10 toasts)
| Mensaje | Tipo | Trigger |
|---------|------|---------|
| "Ingresá tu email corporativo" | error | Email vacío |
| "Email no registrado" | error | Email no registrado |
| "Link copiado al portapapeles" | success | Link copiado |
| "Ingresá el código de sesión" | error | Código vacío |
| "Código de sesión inválido" | error | Código inválido |

#### GroupSessionClient (16 toasts)
| Mensaje | Tipo | Trigger |
|---------|------|---------|
| "Sesión no encontrada" | error | Sesión no encontrada |
| "Este email no pertenece a la empresa" | error | Email incorrecto |
| "Sesión cancelada" | success | Cancelación OK |
| "Sesión extendida 30 minutos" | success | Extensión OK |
| "Item eliminado" | success | Eliminación OK |

#### Otros consumer toasts
- DiscoveryFeed: "Link copiado" (clipboard fallback)
- RedemptionSuccess: "Código copiado", "Mensaje copiado para compartir"
- RestaurantLeadModal: "¡Restaurante registrado! Te contactamos pronto."
- CancelAwaitingPaymentButton: "Pedido cancelado"
- ClubOnboardingModal: "🎉 Recibiste ${wp} puntos de bienvenida" (4000ms)
- PromotionLoyaltyModal: "🎉 Recibiste ${wp} puntos de bienvenida" (4000ms)

### 1.3 Toasts del Admin

#### OrdersBoardWrapper (2 toasts)
| Mensaje | Tipo | Trigger | Duración |
|---------|------|---------|----------|
| "🛍️ Nuevo pedido / N nuevos pedidos" | default | Nuevos pedidos | 8000ms |
| "⏰ Pedido próximo a retirar" | warning | Pedido programado próximo | 10000ms |

#### OrderStatusButton (4 toasts)
| Mensaje | Tipo | Trigger | Duración |
|---------|------|---------|----------|
| "🎉 ¡30 pedidos procesados! Tu Informe ICO está listo." | success | Hito de 30 pedidos | 8000ms |
| "Pedido actualizado a \"${label}\"" | success | Cambio de estado | — |
| "Pedido cancelado" | success | Cancelación | — |

#### SettingsForm (30+ toasts)
Todos los CRUD de configuración: branding, perfil, horarios, logos, fuentes, portadas, delivery, efectivo, notificaciones, reservas. Cada operación tiene toast de success + error.

#### MenuManager (30+ toasts)
Todos los CRUD de categorías, subcategorías, items, imágenes, modo business, precios. Incluye "Marcado como destacado", "Item habilitado/deshabilitado", "${updatedCount} precios actualizados (+${perc}%)".

#### PromotionsManager (8 toasts)
CRUD de promociones: crear, actualizar, eliminar, activar/desactivar, subir imagen, reordenar.

#### LoyaltyManager (18 toasts)
CRUD de miembros: agregar, activar/desactivar/bloquear, eliminar, importar CSV, canjear puntos, acumular puntos.

#### ReportsDashboard (4 toasts)
| Mensaje | Tipo | Trigger |
|---------|------|---------|
| "Seleccioná una impresora" | error | Sin impresora |
| "Cierre de turno enviado a la impresora" | success | Print |
| "Reporte Excel/PDF descargado" | success | Download |

#### Otros admin toasts
- StoreManager: CRUD items + stock
- DeliveryFleetManager: CRUD delivery persons
- PrintersManager: CRUD impresoras + modos
- PushNotificationManager: envío de push notifications
- CashAdjustmentModal: ajuste de pedidos
- ReservasPanel: cambio de estado
- CRMView: eliminación de clientes
- BusinessCompaniesClient: CRUD empresas + empleados
- RedemptionValidator: "¡Canje validado y entregado con éxito!"
- WhatsAppRewardAdvanceDialog: "Mensaje copiado al portapapeles"

### 1.4 Toasts del Superadmin

- Tenant CRUD (crear, actualizar, eliminar, pausar/reactivar)
- Location CRUD
- User management (activar/desactivar, bulk link)
- Consumer lists
- Announcement CRUD
- App Stories CRUD
- Promotion CRUD
- Store Items CRUD
- QR Promo CRUD + push per code
- Push broadcast: "Broadcast enviado: ${tenantsTargeted} tenantes..."
- Directory CRUD
- Founder links: "Link copiado"

---

## 2. BANNERS (14 componentes)

### 2.1 Banners del Admin

| # | Componente | Mensaje | Trigger | Dismissible | Bloquea? |
|---|-----------|---------|---------|-------------|----------|
| 1 | **PlanBanner** | "Trial activo — X de 30 pedidos" / "Estás en el plan Try/Buy" | Siempre en dashboard | ❌ No | No |
| 2 | **Welcome Banner** | "Panel de control" + fecha | Siempre en dashboard | ❌ No | No |
| 3 | **OnboardingChecklist** | "Configuración inicial — X de 5 pasos" (branding, location, menu, network, first order) | Setup incompleto | Auto-hide al completar | No |
| 4 | **AdminPushBanner** | "¿Notificaciones de pedidos? Te avisamos al instante" | 3s después de load si push no suscripto | ✅ X button (sessionStorage) | No |
| 5 | **SystemAnnouncementBanner** | "Novedades del sistema" / "Aviso importante" (dynamic) | Fetch de DB en admin layout | ✅ X / "He leído y acepto" | No |
| 6 | **CashAdjustmentBanner** | "Efectivo no cobrado — X pedido(s) confirmados pero no cobrados" | Fetch de API si count > 0 | ✅ "Descartar" (sin persistencia) | No |
| 7 | **ComisionesBanner** | "Comisiones de transferencia pendientes — $X" + "Pagar ahora" | Si pending > 0 | ❌ No (auto-hide si $0) | No |

### 2.2 Banners del Consumer

| # | Componente | Mensaje | Trigger | Dismissible | Bloquea? |
|---|-----------|---------|---------|-------------|----------|
| 8 | **ActiveOrderBanner** | "Pedido #XXXX → Tocá para ver el seguimiento" | localStorage tiene pending order < 4h | ✅ X (localStorage por order) | No |
| 9 | **ReturningCustomerBanner** | "¡Hola de vuelta, {name}!" + order count | localStorage tiene customer + orders ≥ 1 | ✅ X (localStorage por tenant) | No |
| 10 | **QrPromoBanner** | Modal fullscreen con título, descuento, CTA | Fetch de API cada 30s | ✅ X / backdrop / "Seguir navegando" | **SÍ — fullscreen overlay** |
| 11 | **InstallBanner** | "Instalá TGO — Acceso rápido desde tu pantalla de inicio" | `beforeinstallprompt` event | ✅ X (sessionStorage) | No |
| 12 | **RedProximityBanner** | "{tenantSlug} — Pertenece a la Red de la Proximidad" | Tracking page para tenants en red | ❌ No | No |

### 2.3 Banners Contextuales

| # | Componente | Mensaje | Trigger |
|---|-----------|---------|---------|
| 13 | **BannerContext** | Help contextual para módulos (wallet, tienda, go-plus) | Embedded en settings |
| 14 | **FounderBanner** | "El mejor momento para empezar es ahora" | Landing page (comentado/deshabilitado) |

---

## 3. SHEETS (7 componentes — slide-in panels)

| # | Componente | Mensaje | Trigger | Bloquea? |
|---|-----------|---------|---------|----------|
| 1 | **UpsellSheet** | "¿Completamos tu pedido?" + sugerencias (behavioral/static/manual/special) | Auto después de agregar item | Sí (bottom sheet + backdrop) |
| 2 | **CustomizationSheet** | Panel de customización del item (variantes, modifiers, notas) | Click en item con customizaciones | Sí (bottom sheet + backdrop) |
| 3 | **BusinessGuideSheet** | Guía del menú digital para restauranteros | Manual desde BusinessMenuClient | Sí (right-side sheet) |
| 4 | **CheckoutMiniHeader Sheet** | "Tu pedido" — mini resumen del carrito | Click cart icon en checkout | Sí (bottom sheet) |
| 5 | **MobileNav Sheet** | Menú de navegación mobile | Click hamburger menu | Sí (sheet) |
| 6 | **LocationSwitcher Sheet** | Selector de sede | Manual desde UI | Sí (bottom sheet) |
| 7 | **ClubOnboardingShell** | Onboarding paso a paso del club de fidelización | Flow de onboarding del club | Sí (bottom sheet + backdrop) |

---

## 4. DIALOGS / MODALS (16+ componentes — blocking)

| # | Componente | Mensaje | Trigger | Dismiss |
|---|-----------|---------|---------|---------|
| 1 | **CancelOrderModal** | "Cancelar pedido #XXXX — Si cancelás, el pedido se eliminará" | Click cancel en tracking | "Volver" / backdrop / X |
| 2 | **LikeOrderItemsModal** | "Tus platos — ¿Cuáles te gustaron?" + hearts + confetti | Post-delivery en tracking | X / backdrop / "Cerrar" |
| 3 | **FeedbackModal** | 3 variantes: (a) "¿Cómo estuvo tu experiencia?" (b) "Algo salió mal" (c) "¡Ya sos parte del club!" | Post-checkout / error / club registration | X / "Omitir" / backdrop |
| 4 | **CashAdjustmentModal** | "Ajustar pedidos de efectivo no cobrados" + checkboxes | Click "Ajustar pedidos" en banner | "Cancelar" / backdrop |
| 5 | **DowngradeWarningModal** | "¿Cambiar a {targetPlan}? — Vas a perder acceso a [lista]" | Intento de downgrade | "Mantener {plan}" / X / backdrop |
| 6 | **UpgradeTour** | "Nuevas funcionalidades" — tour paso a paso post-upgrade | Post-upgrade exitoso | **Sin escape** — solo "Siguiente"/"Anterior" |
| 7 | **BulkPriceModal** | "Ajuste de Precios Masivo" — ajuste por categoría | Click bulk price en MenuManager | "Cancelar" / backdrop |
| 8 | **Legal Modal** | "Términos y Condiciones" / "Política de Privacidad" | Click links legales en checkout | X |
| 9 | **MemberFormDialog** | Form de agregar/editar miembro del club | Click add/edit en loyalty admin | Close button |
| 10 | **Loyalty Import Dialog** | "Importar desde CSV" | Click import en loyalty manager | Cancel / backdrop |
| 11 | **Loyalty Scan Dialog** | "Lector de Miembros" — QR scanner | Click scan | Close button |
| 12 | **Loyalty Redeem Dialog** | "Canjear puntos" | Después de scan + elegir redeem | Cancel / backdrop |
| 13 | **Loyalty Earn Dialog** | "Acumular puntos" | Después de scan + elegir earn | Cancel / backdrop |
| 14 | **WhatsappRewardAdvanceDialog** | Configuración de adelanto de recompensa vía WhatsApp | Click SOS/reward | X / backdrop |
| 15 | **OrderStatusButton CancelModal** | Confirmación de cancelación (admin) | Click cancel en admin | "No" / backdrop |
| 16 | **ImportMenuModal** | Importar menú desde archivo | Click import en admin | Close button |

---

## 5. TOOLTIPS (20+ instancias)

| # | Componente | Contenido | Trigger |
|---|-----------|-----------|---------|
| 1 | **InfoTooltip (TIA)** | Texto help contextual para analytics ("Análisis inteligente de tus datos de los últimos 30 días") | Hover en icono ℹ️ |
| 2 | **InfoTooltip (UI)** | Texto help para métricas de superadmin | Hover en icono ℹ️ |
| 3-20+ | **Recharts Tooltips** | Tooltips de gráficos (valores, labels) | Hover en elementos de chart |

---

## 6. ESTADOS DE PEDIDO (OrderStatus) — 11 estados

### 6.1 Pipeline completo

```
awaiting_payment → pending → confirmed → preparing → ready → en_ruta → arrived → delivered
                                                                      ↓
                                                                  cancelled
```

### 6.2 Representación visual — Admin Board (Kanban)

| Estado | Columna | Dot Color | Badge |
|--------|---------|-----------|-------|
| `awaiting_payment` | Transferencias | 🟡 amber-500 | amber-100/amber-700 |
| `awaiting_confirmation` | Transferencias | 🟡 amber-500 | amber-100/amber-700 |
| `pending` | Pendientes | 🟡 amber-400 | amber-100/amber-700 |
| `confirmed` | Confirmados | 🔵 blue-500 | blue-100/blue-700 |
| `preparing` | Preparando | 🟠 orange-400 | orange-100/orange-700 |
| `ready` | Listos | 🟢 emerald-500 | emerald-100/emerald-700 |
| `en_ruta` | En Ruta | 🔵 sky-500 | sky-100/sky-700 |
| `arrived` | Llegaron | 🟡 amber-500 | amber-100/amber-700 |
| `delivered` | Entregados | ⚪ zinc-400 | zinc-100/zinc-600 |
| `cancelled` | (fuera del board) | 🔴 red-400 | red-500/red-600 |

### 6.3 Representación visual — Consumer Tracking

| Estado | Emoji | Animación | Descripción |
|--------|-------|-----------|-------------|
| `awaiting_payment` | 💳 | — | "Completá el pago para confirmar tu pedido" |
| `awaiting_confirmation` | ⏳ | pulse | "El local está verificando tu pago" |
| `pending` | 📋 | — | "Tu pedido fue recibido y está esperando confirmación" |
| `confirmed` | ✅ | SVG draw (checkmark) | "El restaurante confirmó tu pedido" |
| `preparing` | 👨‍🍳 | wiggle (3s infinite) | "Tu pedido está siendo preparado" |
| `ready` | 🎉 | bounce | "¡Pasá a retirar tu pedido!" |
| `en_ruta` | 🚗 | pulse | "El delivery está en camino a tu dirección" |
| `arrived` | 📍 | pulse | "El delivery llegó a tu domicilio" |
| `delivered` | 🍽️ | — | "Pedido entregado. ¡Que lo disfrutes!" |
| `cancelled` | ❌ | — | "El pedido fue cancelado" |

### 6.4 Transiciones de estado (Admin)

| De | A | Trigger |
|----|---|---------|
| `awaiting_payment` | null (terminal) | — |
| `awaiting_confirmation` | `confirmed` | Admin confirma transferencia |
| `pending` | `confirmed` | Admin clickea "Confirmar" |
| `confirmed` | `preparing` | Admin clickea "Empezar Preparación" |
| `preparing` | `ready` | Admin clickea "Marcar como Listo" |
| `ready` (takeaway) | `delivered` | Admin clickea "Entregado" |
| `ready` (delivery) | `en_ruta` | Admin clickea "Enviar" |
| `en_ruta` | `arrived` | Admin clickea "Marcar Llegado" |
| `arrived` | `delivered` | Admin clickea "Confirmar Entrega" |
| `delivered` | null (terminal) | — |
| `cancelled` | null (terminal) | — |

Cancelables desde: `pending`, `awaiting_confirmation`, `confirmed`

### 6.5 Modo de pedido (OrderMode)

| Modo | Badge Color | Icono |
|------|------------|-------|
| `delivery` | emerald-600/emerald-50 | 🚚 Truck |
| `takeaway` | amber-600/amber-50 | 🛍️ ShoppingBag |
| `dine-in` | violet-600/violet-50 | 🍴 UtensilsCrossed |
| `business` | blue-600/blue-50 | 💼 Briefcase |

---

## 7. OTROS ESTADOS (28 enums, ~109 estados individuales)

### 7.1 Pago
| Estado | Label | Color |
|--------|-------|-------|
| `approved` | Pagado | emerald-100/emerald-700 |
| `pending` | Pendiente | amber-100/amber-700 |
| `rejected` | Rechazado | red-100/red-700 |
| `cancelled` | Cancelado | zinc-100/zinc-600 |

### 7.2 Reservaciones
| Estado | Label | Color |
|--------|-------|-------|
| `pending_payment` | Pago pendiente | amber-500/10/amber-600 |
| `confirmed` | Confirmada | emerald-500/10/emerald-600 |
| `cancelled` | Cancelada | red-500/10/red-600 |
| `seated` | En mesa | blue-500/10/blue-600 |
| `no_show` | No se presentó | zinc-500/10/zinc-500 |

### 7.3 Club / Fidelización
| Estado | Color |
|--------|-------|
| `active` | emerald-500/10/emerald-500 |
| `inactive` | muted/muted-foreground |
| `blocked` | destructive/10/destructive |

**Tiers:** none → bronze → silver → gold

### 7.4 Delivery
| Estado | Label | Color |
|--------|-------|-------|
| `assigned` | En camino | amber-600/amber-50 |
| `en_ruta` | En camino | amber-600/amber-50 |
| `arrived` | Llegué | emerald-600/emerald-50 |
| `completed` | Completado | emerald-50/emerald-700 |
| `disputed` | Disputado | red-50/red-600 |

### 7.5 Hidden Rewards
```
reserva → (pago aprobado) → pendiente → (checkout) → reservado → (pago) → consumido
reserva → (15min expiry) → expired
pendiente → (claimExpiryDays) → expired
reservado → (20min / cancel) → pendiente
consumido → terminal
```

### 7.6 Store Redemption
| Estado | Label | Color |
|--------|-------|-------|
| `pending` | Pendiente | discovery (amarillo) |
| `claimed` | Reclamado | success (verde) |
| `expired` | Expirado | surface-1 (gris) |
| `cancelled` | Cancelado | danger (rojo) |

### 7.7 Printer
| Estado | Label | Color |
|--------|-------|-------|
| `ok` | Online | emerald-500 |
| `error` | Falla | red-500 |
| `offline` | Offline | zinc-400 |
| `unknown` | Sin datos | amber-500 |

### 7.8 TIA Insights
| Estado | Badge |
|--------|-------|
| `active` | (color del tipo de insight) |
| `dismissed` | zinc-100/zinc-500 "Descartado" |
| `resolved` | green-50/green-600 "Resuelto" |

### 7.9 Benchmarks
| Estado | Emoji | Color |
|--------|-------|-------|
| `top` | 🟢 | green-100/green-700 |
| `above_average` | 🟢 | emerald-50/emerald-600 |
| `average` | 🟡 | zinc-100/zinc-600 |
| `below_average` | 🔴 | amber-50/amber-600 |
| `bottom` | 🔴 | red-50/red-600 |

### 7.10 Otros enums
- **Tenant:** active | paused | deleted
- **Location:** active | paused
- **Corporate Account:** active | suspended | cancelled
- **Directory:** listed | claimed | converted
- **Lead:** new | contacted | closed | lost
- **Commission Statement:** pendiente | pagado | vencido
- **Subscription:** authorized | pending | cancelled | paused
- **POS Sync:** not_applicable | pending | synced | failed
- **Scheduled:** pending_schedule | active | expired
- **User Roles:** superadmin | admin | manager | staff | cashier | consumer | seller

---

## 8. ANIMACIONES Y EFECTOS VISUALES

### 8.1 CSS @keyframes (20 en globals.css)

| Keyframe | Descripción | Duración |
|----------|-------------|----------|
| `shimmer-slide` | Spark traversal across button | `var(--speed)` infinite |
| `spin-around` | 360° rotation with pauses | `calc(var(--speed)*2)` infinite |
| `shiny-text` | Background-position sweep | 8s infinite |
| `ripple` | Concentric circles scale 1→0.9→1 | 2s infinite |
| `pulse` | Box-shadow ring expand/contract | `var(--duration)` infinite |
| `pulse-ripple` | Box-shadow expands fading | `var(--duration)` infinite |
| `gradient` | Background-position oscillation | 3s infinite |
| `shimmer` | Skeleton sweep left→right | 1.8s infinite |
| `fade-in-up` | Opacity 0→1 + translateY(12px)→0 | 0.5s forwards |
| `slide-up` | translateY(100%)→0 (bottom sheet) | 0.35s forwards |
| `pulse-glow` | Opacity + box-shadow pulse | 2s infinite |
| `scale-in` | scale(0.7)→1 + opacity 0→1 | inline |
| `wiggle` | rotate 0→-5°→5°→0 | inline |
| `draw-check` | SVG stroke-dashoffset 50→0 | inline |
| `halo-expand` | scale(1)→2.2 + opacity 0.5→0 | inline |
| `message-enter` | opacity 0→1 + translateY(6px)→0 | inline |
| `pulse-ring` | scale(1)→3 + opacity 0.6→0 | 1.5s infinite |
| `shine-border-rotate` | Conic gradient rotation (toast) | 3s infinite |

### 8.2 CSS Keyframes adicionales (en componentes)

| Keyframe | Archivo | Descripción |
|----------|---------|-------------|
| `mh-pulse` | menu/[locationId]/page.tsx | Dot pulsante del header del menú (1.8s) |
| `bounce` | DineInMenuView.tsx | Arrow bounce para scroll hint (2s) |
| `tgo-pulse-dot` | LiveCityMetrics.tsx | Dot live de métricas (1.8s) |
| `tgoPinDrop` | AnimatedLogoLoader.tsx | Pin drop con bounce physics (0.95s) |
| `tgoShadowGrow` | AnimatedLogoLoader.tsx | Shadow expansion bajo pin |
| `tgoDotTravel` | AnimatedLogoLoader.tsx | Orange dot viaja a posición final |
| `tgoDotIdlePulse` | AnimatedLogoLoader.tsx | Glow pulse en dot idle (2.2s infinite) |
| `tgoRingDraw` | AnimatedLogoLoader.tsx | SVG ring stroke draw (1.25s) |
| `tgoFadeUp` | AnimatedLogoLoader.tsx | TGO wordmark fade up (0.8s) |
| `dash` | OnboardingCarousel.tsx | Dashed circle rotation (12s) |
| `sn-float` | SobreNosotros.tsx | Floating element bob (9s) |
| `plm-card-in` | PlanLeadModal.tsx | Modal card enter from below (0.38s) |
| `pf-a` / `pf-b` | Hero.tsx | Floating phone bob (5.5s / 6.8s) |
| `notif-appear` | Hero.tsx | Notification demo slide-in (20s) |
| `carousel-scroll` | DemoSection.tsx | Auto-scroll screenshots (28s) |

### 8.3 Framer Motion (832+ ocurrencias)

#### Efectos de UI
| Componente | Trigger | Descripción |
|-----------|---------|-------------|
| **TextAnimate** | Mount / viewport | Staggered text split (word/char/line) con 10 presets: fadeIn, blurIn, slideUp/Down/Left/Right, scaleUp/Down |
| **BorderBeam** | Mount (infinite) | Gradient beam traveling around border via offsetPath (6s default) |
| **MagicCard** | Pointer move | Mouse-following radial gradient o floating orb (spring: stiffness 250, damping 30) |
| **DotPattern** | Mount (glow=true) | Each dot pulses opacity + scale (2-5s random delay, infinite) |
| **Particles** | Mouse move (canvas) | 100 floating particles que magnéticamente siguen el cursor |
| **Ripple** | Mount (infinite) | 8 concentric circles pulsing staggered (2s per ring) |
| **PulsatingButton** | Mount (infinite) | Dual variant: "pulse" (ring) o "ripple" (expanding ring) |
| **ShimmerButton** | Mount (infinite) | Conic gradient spark slides across button |
| **AnimatedShinyText** | Mount (infinite) | Shimmer highlight sweeps across text (8s) |

#### Efectos de Feature
| Componente | Trigger | Descripción |
|-----------|---------|-------------|
| **CheckoutForm** | Promo card mount | Card fades in + slides up + scales |
| **CheckoutForm** | Success overlay | Success card enters scale 0.92→1 |
| **MenuPublicView** | Category icon tap | Scale bounce 1→1.3→1 (0.25s) |
| **MenuPublicView** | Fly-to-cart | Item shrinks + flies to cart icon (0.35s) |
| **SettingsForm** | Tab switch | Cross-fade between sections (AnimatePresence) |
| **MenuManager** | Category expand/collapse | Staggered children entrance (0.06s stagger) |
| **LikeOrderItemsModal** | Item stagger | Each item fades in (delay idx*0.05) |
| **LikeOrderItemsModal** | Success | Checkmark scales 0→1 (spring) |
| **CancelOrderModal** | Confirmation | Checkmark scales 0→1 |
| **OrderStatusButton** | Dropdown open | Status chips scale in (spring) |
| **AnimatedNumber** | Value change | Spring-based count up/down (400ms) |

### 8.4 Confetti (7 ubicaciones)

| Ubicación | Trigger | Config |
|-----------|---------|--------|
| MenuPublicView | Primer item agregado al carrito | particleCount: 120, spread: 140 |
| OrderTracker | Status → confirmed | particleCount: 120, spread: 140 |
| PostDeliveryCelebration | Mount (1s burst) | particleCount: 3/frame, gravity 0.8 |
| LikeOrderItemsModal | Save success | canvas-confetti default |
| ConfirmPickupButton | Pickup confirmado | 2 bursts: particleCount 6 |
| StoreItemCard | Redemption exitoso | canvas-confetti |
| RedemptionSuccess | Mount | 2 bursts: 50 + 25 delayed |

### 8.5 Haptic Feedback (118 ocurrencias)

| Método | Vibración | Uso |
|--------|-----------|-----|
| `impact('light')` | 10ms | Button taps (20+ archivos) |
| `impact('medium')` | 20ms | CTA clicks |
| `selection()` | 5ms | Toggle/filter taps (15+ archivos) |
| `success()` | [10,30,10] ms | Redemption, address added |
| `error()` | [30,50,30,50,30] ms | Error feedback |
| `warning()` | [20,40,20] ms | Address warning |
| `navigator.vibrate` direct | 50ms | Cart add en MenuPublicView |
| `navigator.vibrate` direct | Various | Status changes en OrderTracker |
| `navigator.vibrate` direct | [100,50,100,50,200] | Pickup confirmation |
| Service Worker vibrate | [300,100,300,100,300] | Push notifications |

### 8.6 Sound Effects

| Sonido | Trigger | Archivo |
|--------|---------|---------|
| `useNotificationSound` | Nuevo pedido alert | `/LLAMADA.mp3` |
| Board new item detector | Primer alert: inmediato; nudge: 10s; repeat: 30s | Configurable soundSrc |

### 8.7 Skeleton Loading (5 componentes + 30+ usages)

| Componente | Trigger |
|-----------|---------|
| `.skeleton-shimmer` (globals.css) | Cualquier loading state |
| `Skeleton` (shadcn) | animate-pulse |
| `ExploreLoadingSkeleton` | Feed loading |
| `BoardSkeleton` | Board loading |
| Admin dashboards (múltiples) | Data loading |

### 8.8 Pulse Animations (97 ocurrencias)

Pervasive en: OrderTracker (active step ring pulse), OrderCard (escalated/new orders pulse), Admin OrdersManager (load indicators), ExploreMap (pin pulse), Live indicator dots (30+ archivos).

### 8.9 Glow Effects (7 implementaciones)

| Efecto | Descripción |
|--------|-------------|
| `.glow-brand` | box-shadow naranja |
| `.glow-network` | box-shadow verde |
| `.animate-pulse-glow` | Pulsing glow para live indicators |
| ExploreMap pin | SVG glow filter en pins activos |
| AnimatedLogoLoader `.dot-glow` | Gaussian blur glow detrás del dot |
| MagicCard orb | Floating gradient orb con blur (60px) |
| DotPattern glow | Radial gradient glow en dots pulsantes |

### 8.10 Transition Utilities (1500+ instancias Tailwind)

| Patrón | Uso |
|--------|-----|
| `transition-transform active:scale-95/98/99` | 100+ botones, cards, elementos interactivos |
| `transition-colors` | 200+ botones, tabs, hover states |
| `transition-opacity` | 50+ fade effects |
| `transition-all` | 300+ combined |
| `duration-200/500/700` | Admin sidebar, progress bars |

---

## 9. EMPTY STATES

| Contexto | Visual |
|----------|--------|
| Sin deliveries activos | 🚗 + "Sin entregas activas" + "Tocá Disponibles" |
| Sin pedidos activos (superadmin) | "No hay pedidos activos en este momento" |
| Sin órdenes (consumer) | Lista vacía |
| Sin redemptions | Filter tabs + empty state |
| Order lookup empty | `ViewState = 'empty'` |
| Order lookup error | `ViewState = 'error'` |

**Order Lookup View States:** `collapsed | form | loading | results | empty | error`

---

## 10. ERROR STATES

| Patrón | Dónde | Visual |
|--------|-------|--------|
| `toast.error()` | CheckoutForm, OrderStatusButton, MenuPublicView | Toast rojo (~40+ ubicaciones) |
| HTTP 409 | CheckoutForm, BusinessMenuClient | "Pedido activo" blocker |
| HTTP 429 | PushNotificationManager | Rate limiting |
| `AlertTriangle` icon | CancelOrderModal | Warning modal |
| Printer error | PrintersManager | `bg-red-500/10 text-red-500` + XCircle |
| Printer offline | PrintersManager | `bg-zinc-500/10 text-zinc-400` + AlertCircle |
| Payment rejected | OrderContextPanel | `bg-red-100 text-red-700` |

---

## 11. SUCCESS / CELEBRATION STATES

| Patrón | Dónde | Visual |
|--------|-------|--------|
| `toast.success()` | Múltiples (~60+ ubicaciones) | Toast verde |
| Confetti | PostDeliveryCelebration, ConfirmPickupButton, LikeOrderItemsModal | Color burst |
| PostDeliveryCelebration | PostDeliveryCelebration.tsx | 🍽️ emoji bounce + "¡Pedido completado!" + rating + Google review |
| SVG checkmark draw | OrderTracker (confirmed) | Animated green circle with check |
| Milestone toast | OrderStatusButton | "🎉 ¡30 pedidos procesados!" |
| Confetti on first cart add | MenuPublicView | particleCount: 120 |

---

## 12. RESUMEN CUANTITATIVO

| Categoría | Cantidad |
|-----------|----------|
| **Toast notifications** | ~280 llamadas en ~60 archivos |
| **Banners** | 14 componentes |
| **Sheets** | 7 componentes |
| **Dialogs/Modals** | 16+ componentes |
| **Tooltips** | 20+ instancias |
| **Enums de estado** | 28 distinctos |
| **Estados individuales** | ~109 |
| **CSS @keyframes** | 20 (globals) + 15 (component-scoped) |
| **Framer Motion ocurrencias** | 832+ |
| **Confetti effects** | 7 ubicaciones |
| **Skeleton loading** | 5 componentes + 30+ usages |
| **Pulse animations** | 97 ocurrencias |
| **Glow effects** | 7 implementaciones |
| **Haptic feedback** | 118 ocurrencias |
| **Sound effects** | 1 hook + 1 board detector |
| **CSS transitions** | 1500+ instancias Tailwind |
