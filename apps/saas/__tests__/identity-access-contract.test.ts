import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * Contrato de IDENTIDAD (PR 1 del plan Organización → Marcas, 31/10/2026).
 *
 * Regla: la identidad y los permisos de una sesión se leen SOLO a través de
 * los helpers autorizados (lib/apiAuth.ts → getSessionUser, que relee rol,
 * tenant y sedes de la base). Prohibido fuera de ellos:
 *   - auth_call : `auth()` directo (devuelve los claims congelados del JWT, 8 h)
 *   - get_token : `getToken(` de next-auth (mismo problema)
 *   - slug_cmp  : comparar `<sesión>.tenantSlug` (claim del JWT, nunca fresco)
 *   - tenant_cmp: comparar `<sesión>.tenantId` a mano (va por el helper de
 *                 pertenencia, para que la proyección de membresías lo cubra)
 *
 * BASELINE es el inventario medido al 31/10/2026 (entregable 1, §1), cada
 * entrada con el PR que la elimina. El conteo por archivo y regla debe
 * coincidir EXACTO: si sube → uso nuevo prohibido; si baja → actualizá la
 * línea base (la lista solo se achica). En el PR 4 BASELINE queda vacía.
 *
 * Para regenerar el escaneo: PRINT_IDENTITY_SCAN=1 npx vitest run __tests__/identity-access-contract.test.ts
 */

type Rule = 'auth_call' | 'get_token' | 'slug_cmp' | 'tenant_cmp'
type Counts = Partial<Record<Rule, number>>

const SAAS = join(__dirname, '..')
const ROOTS = ['app', 'lib', 'components', 'hooks', 'contexts']

/** Receptor que es una sesión/usuario de sesión: user, sessionUser, session.user, … */
const SESSION = String.raw`\b\w*(?:user|User|session|Session)\w*\??\.(?:user\??\.)?`
const CMP = String.raw`(?:===|!==|==|!=)`
const RULES: Record<Rule, RegExp> = {
  auth_call: /\bauth\(\)/g,
  get_token: /(?<![.\w])getToken\(/g,
  slug_cmp: new RegExp(`${SESSION}tenantSlug\\s*${CMP}|${CMP}\\s*${SESSION}tenantSlug\\b`, 'g'),
  tenant_cmp: new RegExp(
    `${SESSION}tenantId(?:\\?\\.toString\\(\\))?\\s*${CMP}|${CMP}\\s*(?:String\\()?${SESSION}tenantId\\b`,
    'g'
  ),
}

/** Helpers autorizados y excepciones permanentes (con motivo). */
const PERMANENT: Record<string, string> = {
  'lib/auth.ts': 'NextAuth: define auth()',
  'lib/auth.config.ts': 'NextAuth: callbacks del JWT',
  'lib/apiAuth.ts': 'helper autorizado: getSessionUser / requireAuth / requireSuperAdmin',
  'app/api/auth/sso/route.ts': 'compara el DOCUMENTO User de la base con el payload SSO, no una sesión',
}

type Pr = 'PR2' | 'PR3' | 'PR4'
const BASELINE: Record<string, Counts & { pr: Pr }> = {
  // ── PR 2: API con tenant, identidad de cliente y superadmin API ────────────
  'app/api/[tenant]/admin/club-audit/route.ts': { auth_call: 1, slug_cmp: 1, pr: 'PR2' },
  'app/api/[tenant]/admin/club-discount/route.ts': { auth_call: 3, slug_cmp: 3, pr: 'PR2' },
  'app/api/[tenant]/admin/club-members/[memberId]/reissue-token/route.ts': { auth_call: 1, slug_cmp: 1, pr: 'PR2' },
  'app/api/[tenant]/admin/club-members/[memberId]/revoke-token/route.ts': { auth_call: 1, slug_cmp: 1, pr: 'PR2' },
  'app/api/[tenant]/admin/mp-oauth/connect/route.ts': { auth_call: 1, slug_cmp: 1, pr: 'PR2' },
  'app/api/[tenant]/admin/qr-promo/route.ts': { auth_call: 2, slug_cmp: 2, pr: 'PR2' },
  'app/api/[tenant]/admin/qr-promos/route.ts': { auth_call: 2, slug_cmp: 2, pr: 'PR2' },
  'app/api/[tenant]/admin/qr-promos/[promoId]/route.ts': { auth_call: 2, slug_cmp: 2, pr: 'PR2' },
  'app/api/[tenant]/analytics/traffic/route.ts': { auth_call: 1, slug_cmp: 1, pr: 'PR2' },
  'app/api/[tenant]/admin/referrals/route.ts': { tenant_cmp: 1, pr: 'PR2' },
  'app/api/[tenant]/admin/user-location-roles/[id]/route.ts': { tenant_cmp: 1, pr: 'PR2' },
  'app/api/[tenant]/commissions/settlements/route.ts': { tenant_cmp: 1, pr: 'PR2' },
  'app/api/[tenant]/commissions/_shared.ts': { tenant_cmp: 1, pr: 'PR2' },
  'lib/dashboard-scope.ts': { tenant_cmp: 1, pr: 'PR2' },
  'lib/inventory/route.ts': { tenant_cmp: 1, pr: 'PR2' },
  'lib/pos-online/tenantContext.ts': { tenant_cmp: 1, pr: 'PR2' },
  // identidad de cliente (id/email) → getSessionIdentity
  'app/api/[tenant]/announcements/route.ts': { auth_call: 1, pr: 'PR2' },
  'app/api/[tenant]/loyalty/join/route.ts': { auth_call: 1, pr: 'PR2' },
  'app/api/[tenant]/loyalty/me/route.ts': { auth_call: 1, pr: 'PR2' },
  'app/api/[tenant]/orders/route.ts': { auth_call: 3, pr: 'PR2' },
  'app/api/explore/loyalty/clubs/route.ts': { auth_call: 1, pr: 'PR2' },
  'app/api/explore/orders/route.ts': { auth_call: 1, pr: 'PR2' },
  'app/api/user/addresses/route.ts': { auth_call: 3, pr: 'PR2' },
  'app/api/user/onboarding/network-discovery/route.ts': { auth_call: 2, pr: 'PR2' },
  'app/api/user/preferences/route.ts': { auth_call: 2, pr: 'PR2' },
  'lib/audit.ts': { auth_call: 1, pr: 'PR2' },
  'lib/explore-tracking.ts': { auth_call: 1, pr: 'PR2' },
  // superadmin API (rol del JWT) → rol fresco
  'app/api/push/backfill/route.ts': { auth_call: 1, pr: 'PR2' },
  'app/api/superadmin/announcements/route.ts': { auth_call: 1, pr: 'PR2' },
  'app/api/superadmin/announcements/[id]/acceptances/route.ts': { auth_call: 1, pr: 'PR2' },
  'app/api/superadmin/announcements/[id]/route.ts': { auth_call: 1, pr: 'PR2' },
  'app/api/superadmin/business/companies/route.ts': { auth_call: 1, pr: 'PR2' },
  'app/api/superadmin/commissions/notify-whatsapp/route.ts': { auth_call: 1, pr: 'PR2' },
  'app/api/superadmin/commissions/route.ts': { auth_call: 1, pr: 'PR2' },
  'app/api/superadmin/invite-scans/route.ts': { auth_call: 1, pr: 'PR2' },
  'app/api/superadmin/qr-promo-defaults/route.ts': { auth_call: 1, pr: 'PR2' },
  'app/api/superadmin/tenants/[tenantId]/commission-rules/route.ts': { auth_call: 1, pr: 'PR2' },
  'app/api/superadmin/tenants/[tenantId]/mp-split/route.ts': { auth_call: 1, pr: 'PR2' },
  'app/api/superadmin/tenants/[tenantId]/onboarding/review/route.ts': { auth_call: 1, pr: 'PR2' },
  'app/api/superadmin/tenants/[tenantId]/route.ts': { auth_call: 1, pr: 'PR2' },
  'app/api/superadmin/dashboard/route.ts': { get_token: 1, pr: 'PR2' },
  'app/api/superadmin/dashboard/actividad/route.ts': { get_token: 1, pr: 'PR2' },
  'app/api/superadmin/dashboard/ahora/route.ts': { get_token: 1, pr: 'PR2' },
  'app/api/superadmin/dashboard/comisiones/route.ts': { get_token: 1, pr: 'PR2' },
  'app/api/superadmin/dashboard/feedback/route.ts': { get_token: 1, pr: 'PR2' },
  'app/api/superadmin/dashboard/kpis/route.ts': { get_token: 1, pr: 'PR2' },
  'app/api/superadmin/dashboard/metodos-pago/route.ts': { get_token: 1, pr: 'PR2' },
  'app/api/superadmin/dashboard/pedidos/route.ts': { get_token: 1, pr: 'PR2' },
  'app/api/superadmin/dashboard/salud/route.ts': { get_token: 1, pr: 'PR2' },
  'app/api/superadmin/dashboard/summary/route.ts': { get_token: 1, pr: 'PR2' },
  'app/api/superadmin/dashboard/tendencia/route.ts': { get_token: 1, pr: 'PR2' },

  // ── PR 3: páginas del admin ────────────────────────────────────────────────
  'app/[tenant]/admin/layout.tsx': { auth_call: 1, slug_cmp: 1, pr: 'PR3' },
  'app/[tenant]/admin/page.tsx': { auth_call: 1, pr: 'PR3' },
  'app/[tenant]/admin/analytics/page.tsx': { auth_call: 1, slug_cmp: 1, pr: 'PR3' },
  'app/[tenant]/admin/audit/page.tsx': { auth_call: 1, pr: 'PR3' },
  'app/[tenant]/admin/billing/page.tsx': { auth_call: 1, pr: 'PR3' },
  'app/[tenant]/admin/club/page.tsx': { auth_call: 1, pr: 'PR3' },
  'app/[tenant]/admin/commissions/page.tsx': { auth_call: 1, pr: 'PR3' },
  'app/[tenant]/admin/commissions/semana/[key]/page.tsx': { auth_call: 1, pr: 'PR3' },
  'app/[tenant]/admin/delivery/page.tsx': { auth_call: 1, pr: 'PR3' },
  'app/[tenant]/admin/go-plus/page.tsx': { auth_call: 1, pr: 'PR3' },
  'app/[tenant]/admin/intelligence/page.tsx': { auth_call: 1, slug_cmp: 1, pr: 'PR3' },
  'app/[tenant]/admin/marketing-qr/page.tsx': { auth_call: 1, slug_cmp: 1, pr: 'PR3' },
  'app/[tenant]/admin/orders/history/page.tsx': { auth_call: 1, pr: 'PR3' },
  'app/[tenant]/admin/orders/page.tsx': { auth_call: 1, pr: 'PR3' },
  'app/[tenant]/admin/promotions/page.tsx': { auth_call: 1, pr: 'PR3' },
  'app/[tenant]/admin/reviews/page.tsx': { auth_call: 1, slug_cmp: 1, pr: 'PR3' },
  'app/[tenant]/admin/settings/page.tsx': { auth_call: 1, pr: 'PR3' },
  'app/[tenant]/admin/special-dates/page.tsx': { auth_call: 1, slug_cmp: 1, pr: 'PR3' },
  'app/[tenant]/admin/store/page.tsx': { auth_call: 1, pr: 'PR3' },
  'app/[tenant]/admin/wallet/page.tsx': { auth_call: 1, pr: 'PR3' },

  // ── PR 4: cierre (seller, superadmin páginas, apiKey, OAuth callback) ───────
  'app/api/mp-oauth/callback/route.ts': { auth_call: 1, slug_cmp: 1, pr: 'PR4' },
  'lib/apiKeyAuth.ts': { auth_call: 1, tenant_cmp: 1, pr: 'PR4' },
  'app/seller/layout.tsx': { auth_call: 1, pr: 'PR4' },
  'app/seller/page.tsx': { auth_call: 1, pr: 'PR4' },
  'app/superadmin/layout.tsx': { auth_call: 1, pr: 'PR4' },
  'app/superadmin/founder-links/page.tsx': { auth_call: 1, pr: 'PR4' },
  'app/superadmin/marketing-qr/page.tsx': { auth_call: 1, pr: 'PR4' },
  'app/superadmin/pos-root/page.tsx': { auth_call: 1, pr: 'PR4' },
  'app/superadmin/sellers/page.tsx': { auth_call: 1, pr: 'PR4' },
  'app/superadmin/visitas/page.tsx': { auth_call: 1, pr: 'PR4' },
}

/** Quita comentarios (bloque y línea) para no contar menciones en texto. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:"'`])\/\/.*$/gm, '$1')
}

function walk(dir: string, out: string[]) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!['node_modules', '.next', '__tests__'].includes(entry.name)) walk(full, out)
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
}

function scan(): Record<string, Counts> {
  const files: string[] = []
  for (const root of ROOTS) {
    try { walk(join(SAAS, root), files) } catch { /* raíz inexistente */ }
  }
  const result: Record<string, Counts> = {}
  for (const file of files) {
    const src = stripComments(readFileSync(file, 'utf8'))
    const counts: Counts = {}
    for (const [rule, re] of Object.entries(RULES) as [Rule, RegExp][]) {
      const n = (src.match(re) ?? []).length
      if (n) counts[rule] = n
    }
    if (Object.keys(counts).length) result[relative(SAAS, file).split(sep).join('/')] = counts
  }
  return result
}

const found = scan()
if (process.env.PRINT_IDENTITY_SCAN) console.log(JSON.stringify(found, null, 1))

function countsOf(entry: Counts & { pr?: Pr }): Counts {
  const { pr: _pr, ...counts } = entry
  return counts
}

describe('Contrato de identidad: auth()/getToken/comparaciones de sesión solo en helpers', () => {
  it('ningún uso nuevo fuera de los helpers ni de la línea base', () => {
    const violations: string[] = []
    for (const [file, counts] of Object.entries(found)) {
      if (PERMANENT[file]) continue
      const base = BASELINE[file]
      if (!base) {
        violations.push(`${file} ${JSON.stringify(counts)} — usá getSessionUser (lib/apiAuth). Uso nuevo prohibido.`)
        continue
      }
      for (const [rule, n] of Object.entries(counts) as [Rule, number][]) {
        const allowed = base[rule] ?? 0
        if (n > allowed) violations.push(`${file} ${rule}: ${n} > ${allowed} de la línea base — uso nuevo prohibido.`)
      }
    }
    expect(violations, violations.join('\n')).toEqual([])
  })

  it('la línea base solo se achica: si un archivo bajó, actualizá BASELINE', () => {
    const stale: string[] = []
    for (const [file, entry] of Object.entries(BASELINE)) {
      const expected = countsOf(entry)
      const actual = found[file] ?? {}
      for (const rule of Object.keys(RULES) as Rule[]) {
        if ((actual[rule] ?? 0) < (expected[rule] ?? 0)) {
          stale.push(`${file} ${rule}: ahora ${actual[rule] ?? 0}, línea base ${expected[rule]} — bajala (o borrá la entrada).`)
        }
      }
    }
    expect(stale, stale.join('\n')).toEqual([])
  })

  it('cada entrada pendiente tiene el PR que la elimina', () => {
    for (const [file, entry] of Object.entries(BASELINE)) {
      expect(['PR2', 'PR3', 'PR4'], file).toContain(entry.pr)
      expect(PERMANENT[file], `${file} no puede ser permanente y pendiente a la vez`).toBeUndefined()
    }
  })

  it('las excepciones permanentes siguen existiendo (no quedan entradas muertas)', () => {
    for (const file of Object.keys(PERMANENT)) {
      expect(() => readFileSync(join(SAAS, file)), file).not.toThrow()
    }
  })
})
