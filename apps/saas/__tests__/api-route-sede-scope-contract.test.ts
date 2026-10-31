import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Contrato de ALCANCE DE SEDE de rutas /api/[tenant] (multisede).
 *
 * Regla: toda ruta con sesión (staff/admin) que toque un modelo con sede
 * tiene que (a) aplicar un guard de sede reconocible o (b) estar declarada
 * acá como de nivel tenant / consumidor, con el motivo. Una ruta nueva que
 * opere datos de sede sin guard ni declaración hace fallar este test.
 *
 * Complementa a api-route-auth-contract (que exige sesión o declaración).
 */

const ROUTES_DIR = join(__dirname, '..', 'app', 'api', '[tenant]')

/** Ruta con sesión de staff/admin (no pública ni de consumidor). */
const SESSION_RE = /\brequireAuth\b|\brequireTenantRole\b|\brequireAdminRole\b|\benforcePermission\w*\b|\bgetSessionUser\b|\bresolveDashboardScope\b|\bposRoute\b/

/** Modelos cuyos documentos pertenecen a una sede. */
const SEDE_MODEL_RE = /models\/(Order|Reservation|Menu|CashRegister|CashMovement|Table|Printer|Promotion|InventoryStorageLocation|PreClosePrintJob|Location|Rating|LoyaltyMember|StoreItem|StoreRedemption|QrPromo|Feedback|AuditLog)'/

/** Guards de sede (lib/location-scope, dashboard-scope, loyalty-scope, inventory/route, POS). */
const SEDE_GUARD_RE = /\bguardRequestLocation\b|\bguardResourceLocation\b|\bguardSharedOrLocation\b|\bscopedLocationIds\b|\bscopeLocationFilter\b|\benforceLocationScope\b|\bcanAccessLocation\b|\bassignedLocations\b|\bresolveDashboardScope\b|\binventoryRoute\b|\bguardMemberLocation\b|\bloyaltyListFilter\b|\bposRoute\b|\benforceSedeWriteScope\b/

const TENANT_LEVEL_BY_DESIGN = new Map<string, string>([
  ['admin/user-location-roles/route.ts', 'gobernanza de roles por sede: la asignación es del admin de tenant'],
  ['user-location-roles/route.ts', 'ídem: alta/baja de filas user_location_roles'],
  ['settings/mercadopago/route.ts', 'cuentas MP del negocio; la asignación por sede vive en la pestaña Sedes'],
  ['settings/profile/route.ts', 'perfil del negocio (nivel tenant)'],
  ['settings/transfer-accounts/[accountId]/route.ts', 'cuentas de transferencia del negocio; DELETE bloquea si una sede la usa'],
  ['loyalty/wallet/generate/route.ts', 'consumidor: pase del socio (no es operación de staff)'],
  ['store/redemptions/route.ts', 'consumidor: canje del socio con member token'],
])

function listRouteFiles(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...listRouteFiles(join(dir, entry.name), rel))
    else if (entry.name === 'route.ts') out.push(rel)
  }
  return out
}

const routes = listRouteFiles(ROUTES_DIR)
  .map(rel => ({ rel, src: readFileSync(join(ROUTES_DIR, rel), 'utf8') }))
  .filter(({ src }) => SESSION_RE.test(src) && SEDE_MODEL_RE.test(src))

describe('Contrato: rutas con datos de sede tienen guard de sede o declaración', () => {
  it('hay rutas para auditar (sanity check del scanner)', () => {
    expect(routes.length).toBeGreaterThan(50)
  })

  for (const { rel, src } of routes) {
    it(`${rel}: guard de sede o nivel tenant declarado`, () => {
      const ok = SEDE_GUARD_RE.test(src) || TENANT_LEVEL_BY_DESIGN.has(rel)
      expect(ok, `${rel} opera datos de sede sin guard de sede ni declaración en TENANT_LEVEL_BY_DESIGN`).toBe(true)
    })
  }

  it('las declaraciones apuntan a rutas que existen y no tienen ya un guard', () => {
    const all = new Map(routes.map(r => [r.rel, r.src]))
    for (const rel of TENANT_LEVEL_BY_DESIGN.keys()) {
      expect(all.has(rel), `${rel} declarada pero no existe o ya no toca datos de sede`).toBe(true)
      expect(SEDE_GUARD_RE.test(all.get(rel)!), `${rel} ya tiene guard: sacala de la lista`).toBe(false)
    }
  })
})

// ── Páginas server-side del admin ────────────────────────────────────────────
// Consultan la DB directo (sin pasar por las APIs): mismo contrato.

const PAGES_DIR = join(__dirname, '..', 'app', '[tenant]', 'admin')
const PAGE_QUERY_RE = /\b(Order|Reservation|Menu|Location|Rating|LoyaltyMember|Promotion|Printer|StoreItem|StoreRedemption|CashRegister|AuditLog|Table)\.(find|findOne|aggregate|countDocuments)\(/
const PAGE_SCOPE_RE = /\bgetPageScope\b|\bassignedLocations\b/

function listPageFiles(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...listPageFiles(join(dir, entry.name), rel))
    else if (entry.name === 'page.tsx') out.push(rel)
  }
  return out
}

const pages = listPageFiles(PAGES_DIR)
  .map(rel => ({ rel, src: readFileSync(join(PAGES_DIR, rel), 'utf8') }))
  .filter(({ src }) => PAGE_QUERY_RE.test(src))

describe('Contrato: páginas del admin con datos de sede aplican el alcance del usuario', () => {
  it('hay páginas para auditar', () => {
    expect(pages.length).toBeGreaterThan(5)
  })

  for (const { rel, src } of pages) {
    it(`admin/${rel}: aplica getPageScope (o filtra por assignedLocations)`, () => {
      expect(PAGE_SCOPE_RE.test(src), `admin/${rel} consulta datos de sede sin alcance de usuario`).toBe(true)
    })
  }
})

