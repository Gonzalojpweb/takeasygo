# Cash per-location E2E (Item C)

Fecha: 2026-08-31T02:09:07.618Z

## Escenario

- Tenant: plan `full`, `features.cashPaymentEnabledBySuperadmin: true`, `cash = { enabled: true, discountPercent: 5 }`.
- Loc A: `settings.cash = { enabled: true, discountPercent: 10 }` (override completo).
- Loc B: sin override -> fallback a tenant (5%).
- Loc C: `settings.cash = { enabled: false }` -> efectivo no ofrecido; descuento hereda tenant.
- Loc D: `settings.cash = { discountPercent: 7 }` (parcial) -> enabled hereda tenant.
- Ítem de menú: price 1000 cents.

## Resultado

**23 passed, 0 failed (total 23)**

| # | Check | Resultado |
|---|-------|-----------|
| 1 | Connection targets __cash_e2e__ (not prod) | PASS
| 2 | Preflight: tenant exists in __cash_e2e__ | PASS
| 3 | Preflight: menu exists in __cash_e2e__ | PASS
| 4 | payment-methods without locationId -> 200 | PASS
| 5 | payment-methods without locationId -> cash offered | PASS
| 6 | payment-methods without locationId -> cash discount 5 (tenant fallback) | PASS
| 7 | [A] override 10% applied | PASS
| 8 | [B] no override -> fallback 5% | PASS
| 9 | [B] cash offered (fallback enabled=true) | PASS
| 10 | [C] override enabled=false -> cash NOT offered | PASS
| 11 | [D] partial override -> discount 7 | PASS
| 12 | [D] partial override -> enabled inherits tenant (true) | PASS
| 13 | invalid locationId -> fallback 5% (legacy behavior) | PASS
| 14 | [A] cash order created (201) | PASS
| 15 | [A] cash discount = 100 (10% of 1000) | PASS
| 16 | [A] order payment.method = cash | PASS
| 17 | [B] cash order created (201) | PASS
| 18 | [B] cash discount = 50 (fallback 5% of 1000) | PASS
| 19 | [D] cash order created (201) | PASS
| 20 | [D] cash discount = 70 (7% of 1000) | PASS
| 21 | [C] cash order created (201) - no se bloquea, consistente con tenant-level | PASS
| 22 | [C] cash discount = 50 (discount hereda tenant 5%) | PASS
| 23 | DB: order A persists discountAmount=100 | PASS

## Cambios de producto

- `models/Location.ts`: `settings.cash` override opcional (`enabled?`, `discountPercent?`), `default: null`.
- `lib/cash.ts`: `resolveCashConfig(tenantCash, locationCash)` - prioridad override -> tenant, con fallback parcial por campo.
- `orders/route.ts`: el `cashDiscount` se resuelve con la config de la sede del pedido (`body.locationId`).
- `payment-methods/route.ts`: param `locationId`; usa la config efectiva de esa sede (fallback legacy si no llega/inexistente).
- Checkout (`CheckoutContext`, `CheckoutForm`): envían `locationId` a `payment-methods`.
- Admin `SettingsForm` (`LocationCashSettings`): toggle "configuración propia" + enabled + % por sede (vaciar = `settings.cash: null`).

## Hallazgo preexistente documentado (NO introducido por C)

- El 500 original de `GET /payment-methods` (`TypeError: Cannot read properties of null (reading 'platformFees')`) es **preexistente**, confirmado por test diferencial: `git stash` de los cambios de C en ese route (`git stash push -m C-pm-diff-test`) -> el 500 idéntico YA ocurría en HEAD, al inicial y contra las 5 variantes (sin locationId y con A/B/C/D).
- Causa: `calculateFinalTotal(...)` (lib/pricing.ts) se invoca incondicionalmente en la ruta (línea 66) con `platformConfig` a `null` cuando no existe el doc `platformconfigs/{_id:'platform'}` (en prod lo crea el superadmin; en el entorno de test no existía).
- Cierre: se confirmó que el doc NO está garantizado por diseño (solo se crea por `upsert` la primera vez que el superadmin guarda config, o vía `qr-promo-defaults`; no hay seed/migración/bootstrap). Doc global único -> si faltara en prod, TODOS los checkouts devolverían 500 a la vez. Por eso subió de prioridad y se aplicó el hardening (mismo patrón que ya usaba `orders/route.ts` L1381): los 6 call-sites de pricing ahora pasan `platformConfig || {}` (comportamiento idéntico; en pricing los defaults son `?? 1` / `?? 0`).
- El harness siembra el doc para reflejar prod; con el hardening, payment-methods ya no puede 500 ante su ausencia (verificado 200 con doc borrado).

## Pendientes globales (sin cambio)

- Sockets/POS real: PENDING hasta migración de infra (WSL/Docker rotos localmente).
