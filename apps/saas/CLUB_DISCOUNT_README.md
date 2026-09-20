# Club Discounts — Technical Documentation

## Overview
Club Discounts extend the existing QrPromo system to support member-only promotions with anti-abuse controls. No new models — uses `QrPromo` + `LoyaltyMember` with new fields.

## Architecture
- **Token:** JWT (HS256, 90d expiry) stored in `localStorage('club_token_{tenantSlug}')`
- **Header:** `x-member-token` sent on checkout POST
- **Validation order (orders/route.ts):** Token → Member status → Cooldown → maxUsesPerConsumer → Scope → maxRedemptions (atomic)

## Anti-Abuse Layers
1. **maxUsesPerConsumer** — forced for `memberOnly` promos, regardless of `code` field
2. **Device fingerprint** — best-effort (UA + IP prefix + Accept-Language), SHA-256, stored at registration
3. **Rate-limit** — 1/device/24h + 3/IP/24h via Upstash Redis (`rateLimit()`)
4. **maxRedemptions** — atomic `findOneAndUpdate` with `$expr: { $lt: ['$usedCount', '$maxRedemptions'] }`
5. **Audit endpoint** — `/api/{tenant}/admin/club-audit` finds members who used promo within 48h of joining

## Known Risks (Accepted)

### No Phone Verification (OTP)
- **Risk:** User can register with any phone number they don't own
- **Mitigation:** Rate-limit + device fingerprint + audit report
- **Decision:** Cost of OTP integration exceeds risk for current scale

### JWT in localStorage
- **Risk:** XSS attacks can steal the token
- **Mitigation:** 90d expiry + `tokenVersion` for revocation + CSP headers
- **Decision:** Acceptable for promo discount scope (not financial transactions)

### No tokenVersion Invalidation Endpoint
- **Risk:** Compromised tokens remain valid until 90d expiry
- **Mitigation:** `tokenVersion` field exists in schema with `default: 1`
- **TODO:** Admin endpoint to revoke tokens (POST `/api/{tenant}/admin/club-members/{memberId}/revoke-token`)
- **Status:** NOT YET IMPLEMENTED

### Device Fingerprint is Best-Effort
- **Risk:** Sophisticated attackers can rotate UA/IP/language
- **Mitigation:** Combined with rate-limit + maxUsesPerConsumer
- **Decision:** Fingerprint is forensic, not identity verification

## Files Modified
- `apps/saas/lib/memberToken.ts` — JWT sign/verify
- `apps/saas/models/LoyaltyMember.ts` — +tokenVersion, +deviceFingerprints
- `apps/saas/models/QrPromo.ts` — +memberOnly, +cooldownHours, +clubScope, +clubScopeCategoryIds, +clubScopeItemIds, +maxRedemptions
- `apps/saas/app/api/[tenant]/orders/route.ts` — Token validation + club promo validation
- `apps/saas/app/api/[tenant]/promotions/loyalty-register/route.ts` — Rate-limit, fingerprint, token emission
- `apps/saas/app/api/[tenant]/loyalty/register/route.ts` — Rate-limit, fingerprint, token emission
- `apps/saas/app/api/[tenant]/admin/qr-promos/route.ts` — Club fields in POST
- `apps/saas/app/api/[tenant]/admin/qr-promos/[promoId]/route.ts` — Club fields in PUT
- `apps/saas/app/api/[tenant]/admin/club-audit/route.ts` — Audit endpoint
- `apps/saas/app/api/[tenant]/qr-promo/route.ts` — Consumer response
- `apps/saas/components/admin/QrPromoConfig.tsx` — Club section UI + audit button
- `apps/saas/components/club/ClubOnboardingModal.tsx` — Saves token to localStorage
- `apps/saas/components/checkout/CheckoutPaymentFooter.tsx` — Sends x-member-token header
- `apps/saas/contexts/CheckoutContext.tsx` — ActiveQrPromo interface
- `apps/saas/hooks/useQrPromo.ts` — Stores memberOnly in sessionStorage
- `apps/saas/lib/schemas.ts` — Zod order schema
