# Pendientes — Estado al 01/08/2026

**Última actualización:** 2026-08-01
**Sesión:** Fix de identidad + diseño Home + onboarding discovery + plan phone fallback

---

## 1. Fallback de vinculación por teléfono (EN PAUSA — decisión de presupuesto)

**Problema:** Cuando un usuario se loguea y su email no matchea con su membresía del club, no hay forma de reclamarla. El sistema solo busca por email.

**Riesgo de seguridad (CRÍTICO):** El plan original permitía vincular cualquier teléfono sin verificar propiedad. Cualquiera podría robar puntos de otro usuario conociendo su teléfono.

**Estado:** Plan completo documentado, pendiente decisión de ingeniería sobre fuente de verificación.

### Opciones de verificación

| Opción | Costo | Servicio nuevo | Estado |
|--------|-------|----------------|--------|
| WhatsApp OTP (Whapi existente) | ~$0.001/mensaje | No — ya integrado en `lib/whatsapp.ts` | Requiere crédito Whapi |
| SMS OTP (Twilio/Vonage) | ~$0.005-0.02/mensaje | Sí | Requiere servicio nuevo |
| Verificación in-person (POS) | Gratis | No | Agrega fricción |
| Email OTP | Gratis | No | No prueba propiedad del teléfono |

### Archivos a crear (cuando se resuelva)

| Archivo | Descripción |
|---------|-------------|
| `apps/saas/app/api/[tenant]/loyalty/link-by-phone/route.ts` | Genera OTP, envía WhatsApp |
| `apps/saas/app/api/[tenant]/loyalty/link-by-phone/verify/route.ts` | Valida OTP, vincula |
| `apps/saas/components/club/PhoneLinkPrompt.tsx` | UI con 2 pasos |
| `apps/saas/models/LoyaltyMember.ts` | Campos temporales OTP |
| `apps/saas/app/app/profile/club/[tenantSlug]/page.tsx` | Agregar PhoneLinkPrompt |
| `apps/saas/components/tgo/microcopy.ts` | Copy del prompt |

### Specs aprobadas

- **Trigger:** Solo en `/profile/club/[tenantSlug]` cuando `loyalty/me` retorna `member: null && clubEnabled: true`
- **Rate limiting:** 5 intentos por 5 minutos, key `link-phone:{tenantId}:{ip}`
- **Email hint:** Mostrar `session.user.email` como texto informativo
- **Diseño:** Inline, input phone + select country code, botón primario `--tgo-state-action`, secundario `--tgo-text-link`
- **Error handling:** Mensaje inline sin toast/modal
- **Tokens verificados:** Todos existen en `globals.css`

---

## 2. Items de diseño completados esta sesión

| # | Punto | Estado | Archivos |
|---|-------|--------|----------|
| 1 | Borrar HomeHeader.tsx (dead code) | ✅ Hecho | `HomeHeader.tsx` eliminado |
| 2 | Pills gap-3 → gap-5 | ✅ Hecho | `DiscoveryFeed.tsx:348` |
| 3 | Ícono 📋 → Lucide BookOpen | ✅ Hecho | `RestaurantCard.tsx:580` |
| 4 | Ver carta outline dorado en ExploreMap | ✅ Hecho | `ExploreMap.tsx:283-308` |
| 5 | Section.tsx: prop icon | ✅ Hecho | `Section.tsx` |
| 6 | microcopy.ts: emojis ✨🌙🎁 | ✅ Hecho | `microcopy.ts:97-100` |
| 7 | TimeBasedModule: logo en círculo | ✅ Hecho | `TimeBasedModule.tsx` |
| 8 | Eliminar degradados | ✅ Hecho | `NewInNetworkModule.tsx`, `ExperienceCard.tsx` |
| 9 | LiveCityMetrics: tokens CSS | ✅ Hecho | `LiveCityMetrics.tsx` |

---

## 3. Items de la sesión anterior (ya completados)

| Item | Estado |
|------|--------|
| Merge conflicts resueltos | ✅ |
| Satisfaction bug fix | ✅ |
| KPI Takeaway + Delivery cards | ✅ |
| Delivery filter system (6 bugs) | ✅ |
| Admin sidebar scroll fix | ✅ |
| Bottom sheet redesign | ✅ |
| Club onboarding tenant name fix | ✅ |
| Checkout validation fix (.nullish()) | ✅ |
| Impact system MVP | ✅ |
| Map Sprint 1-3 (clustering, capsules, microanimations) | ✅ |
| Red Discovery Onboarding | ✅ |
| Identity cascading lookup (3 endpoints) | ✅ |
| Silent error handling (ProfileContent) | ✅ |
| NextAuth signIn auto-link | ✅ |
| Backfill dry-run (24 orphans, 0 matches) | ✅ |
| PENDING-AUDIT.md creado | ✅ |

---

## 4. Items Category 1 (no bloqueantes, de PENDING-AUDIT.md anterior)

| # | Item | Razón |
|---|------|-------|
| 1 | `capacityScore` null (10 tenants) | Fallback 0.5 neutral, sin impacto operacional |
| 2 | `nearbyPurchases` takeaway/dine-in = 0 | Badges usan otros campos |
| 3 | Identity system / títulos | Gamificación pura, Phase 2 |
| 4 | Neighborhood discovery (polígonos OSM) | Badge eliminado, sin UI |
| 5 | Apple Wallet sin firma + push APNs | Botón protegido, Google Wallet funciona |
| 6 | Bistrosoft POS connector (stub) | Ningún tenant usa Bistrosoft |
| 7 | IP geolocation en cascada | Default Buenos Aires funciona |
| 8 | Personal history en BottomSheet | Sprint 2 del mapa |
| 9 | Impact system en mapa | Sprint 2 del mapa |
| 10 | Inconsistencia email encryption | Documentado, Phase seguridad |

---

## 5. Próximos pasos para testear

Cuando se deploye la última ronda de cambios:

1. **Perfil de test** (`pgonzalojose@gmail.com`) — debería mostrar impacto de 5 órdenes en Nicks
2. **Onboarding de Red Discovery** — debería mostrar pantalla de red (hasSeenNetworkOnboarding=false)
3. **SignIn auto-link** — verificar que LoyaltyMember se vincula al login
4. **Home design fixes** — verificar visually los 9 puntos de diseño

---

## 6. Referencia: tokens CSS verificados

Todos estos tokens existen en `apps/saas/app/globals.css`:

| Token | Valor | Línea |
|-------|-------|-------|
| `--tgo-state-action` | `#F74211` | 362 |
| `--tgo-state-trust` | `#2D2A4B` | 365 |
| `--tgo-state-discovery` | `#FAB300` | 384 |
| `--tgo-state-activity` | `#2FBF71` | 387 |
| `--tgo-state-proximity` | `#3A86C8` | 390 |
| `--tgo-state-reward` | `#7A5AF8` | 393 |
| `--tgo-text-primary` | `#2D2A4B` | 352 |
| `--tgo-text-secondary` | `#4E5067` | 353 |
| `--tgo-text-muted` | `#98A2B3` | 354 |
| `--tgo-text-link` | `#4E5067` | 358 |
| `--tgo-text-inverse` | `#FFFFFF` | 355 |
| `--tgo-card` | `#FFFFFF` | 324 |
| `--tgo-surface-0` | `#FBF9F7` | 309 |
| `--tgo-surface-1` | `#ECEAE9` | 312 |
| `--tgo-divider` | `#D8D4D5` | 331 |
| `--tgo-border` | `#D8D4D5` | 341 |
| `--tgo-radius-sm` | `12px` | 406 |
| `--tgo-radius-md` | `20px` | 407 |
| `--tgo-radius-lg` | `28px` | 409 |
| `--tgo-radius-pill` | `9999px` | 411 |
| `--tgo-page-padding` | `20px` | 437 |
| `--tgo-type-subtitle` | `600 1.125rem/1.35` | 337 |
| `--tgo-type-body` | `400 1rem/1.5` | 335 |
| `--tgo-type-body-sm` | `400 0.875rem/1.5` | 336 |
