import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Contrato de autenticación de rutas /api/[tenant].
 *
 * Regla: TODO route.ts bajo app/api/[tenant] debe o (a) exigir sesión /
 * secreto (guard detectable en el código) o (b) estar declarado acá como
 * abierto por diseño (público o protección de consumidor) o pendiente de
 * decisión explícita. Una ruta NUEVA sin sesión ni declaración hace
 * fallar este test — evita regresiones tipo "91 rutas sin sesión".
 *
 * La lista blanca sale de la clasificación del 2026-10-10 (evidencia
 * fuera del repo). Agregar entradas requiere justificación.
 */

const ROUTES_DIR = join(__dirname, '..', 'app', 'api', '[tenant]')

const GUARD_RE =
  /\brequireAuth\b|\brequireAdminRole\b|\brequireSuperAdmin\b|\brequireCronSecret\w*\b|\bgetSessionUser\b|\bposRoute\b|\bmatchesInternalSecret\b|\bmatchesInternalBearer\b|\bgetToken\b|\bauth\(\)/

const OPEN_BY_DESIGN = new Set([
  // PÚBLICO por diseño (carta, cotizaciones, eventos, feedback, promo)
  'club-discount/route.ts',
  'delivery/quote/route.ts',
  'events/route.ts',
  'feedback/route.ts',
  'kripton/status/route.ts',
  'locations/[locationId]/reservation-slots/route.ts',
  'locations/[locationId]/scheduled-slots/route.ts',
  'menu/insights/[locationId]/route.ts',
  'menu/items/[itemId]/route.ts',
  'menu/[locationId]/promotions/route.ts',
  'payment-methods/route.ts',
  'qr-promo/route.ts',
  'scheduled-orders/validate/route.ts',

  // CONSUMIDOR con protección propia (member token / tracking token /
  // rating token / rate limit + hash) — cierre fino en la tanda de débiles
  'club-member/me/route.ts',
  'club-member/reissue-token/route.ts',
  'hidden-rewards/check/route.ts',
  'hidden-rewards/discover/route.ts',
  'impact/badges/route.ts',
  'impact/summary/route.ts',
  'loyalty/lookup/route.ts',
  'loyalty/register/route.ts',
  'menu/items/[itemId]/like/route.ts',
  'nudges/active/route.ts',
  'orders/lookup-by-phone/route.ts',
  'orders/verify-payment-by-number/route.ts',
  'orders/[orderId]/cancel-awaiting/route.ts',
  'orders/[orderId]/cancel-by-client/route.ts',
  'orders/[orderId]/cart-restore/route.ts',
  'orders/[orderId]/change-payment-method/route.ts',
  'orders/[orderId]/confirm-internal/route.ts',
  'orders/[orderId]/confirm-transfer-client/route.ts',
  'orders/[orderId]/external-confirm/route.ts',
  'orders/[orderId]/payment-options/route.ts',
  'orders/[orderId]/pickup/route.ts',
  'orders/[orderId]/rapiboy-debug/route.ts',
  'orders/[orderId]/rapiboy-price-accept/route.ts',
  'orders/[orderId]/rate/route.ts',
  'orders/[orderId]/track/route.ts',
  'orders/[orderId]/verify-payment/route.ts',
  'payments/create-kripton-preference/route.ts',
  'payments/create-preference/route.ts',
  'promotions/loyalty-register/route.ts',
  'reservas/preference/route.ts',

  // STAFF-empresa B2B por email (decisión de modelo, tanda 6 corp)
  'business/corp/employees/route.ts',
  'business/corp/employees/[email]/route.ts',
  'business/corp/orders/route.ts',
  'business/corp/orders/export/route.ts',
  'business/corp/summary/route.ts',
  'business/group-session/route.ts',
  'business/group-session/[token]/route.ts',
  'business/group-session/[token]/cancel/route.ts',
  'business/group-session/[token]/confirm/route.ts',
  'business/group-session/[token]/extend/route.ts',
  'business/group-session/[token]/items/route.ts',
  'business/group-session/[token]/items/[itemIndex]/route.ts',
  'business/verify-email/route.ts',

  // PENDIENTES de decisión (no cerrar todavía)
  'menu/translate-all/route.ts', // lo usa el menú público (vista de cliente)
  'print-jobs/route.ts', // agente de impresora sin sesión; requiere token de agente
  'store/redemptions/route.ts', // memberId en body; requiere x-member-token
])

function listRouteFiles(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      out.push(...listRouteFiles(join(dir, entry.name), rel))
    } else if (entry.name === 'route.ts') {
      out.push(rel)
    }
  }
  return out
}

describe('Contrato: toda ruta /api/[tenant] tiene sesión o declaración', () => {
  const files = listRouteFiles(ROUTES_DIR)

  it('escanea el árbol de rutas', () => {
    expect(files.length).toBeGreaterThan(150)
  })

  it.each(files)('%s: guard o declaración', (rel) => {
    const content = readFileSync(join(ROUTES_DIR, rel), 'utf8')
    if (OPEN_BY_DESIGN.has(rel)) return
    expect(
      GUARD_RE.test(content),
      `${rel} no tiene sesión/secret y no está declarado en OPEN_BY_DESIGN. ` +
        `Cerrala con requireAuth/requireCronSecret o justificá la apertura.`
    ).toBe(true)
  })
})
