import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SHARED_SURFACES, SHARED_SURFACE_ROLES, canSeeSharedSurfaces, SAAS_TO_POS_ROLE, POS_ONLY_ADMIN_PATHS, isPosOnlyAdminPath } from '@takeasygo/business'
import { canAccess, PRINTER_LIMIT } from '@/lib/plans'
import { hasPosCapability } from '@/lib/pos-online/permissions'

/**
 * Fase 0 (29/10/2026) — reglas base SaaS ↔ POS:
 *  · Las 6 funciones compartidas solo para admin, encargado y caja.
 *  · Mapeo de roles del SaaS que quedaban sin POS.
 *  · Delivery en Crecimiento y límite de impresoras por plan.
 */

const count = vi.fn()
vi.mock('@/models/Printer', () => ({ default: { countDocuments: (...a: unknown[]) => count(...a) } }))

const SAAS = join(__dirname, '..', '..')
const REPO = join(SAAS, '..', '..')
const allowed = new Set<string>(SHARED_SURFACE_ROLES)

describe('funciones compartidas (business/surfaces)', () => {
  it('declaran solo roles admin, encargado y caja en los dos lados', () => {
    expect(SHARED_SURFACES.map((s) => s.id).sort()).toEqual(['caja', 'facturacion', 'flota', 'pausados', 'reservas', 'ventas'])
    for (const s of SHARED_SURFACES) {
      for (const r of s.posRoles) expect(allowed.has(r), `${s.id} POS: ${r}`).toBe(true)
      for (const r of s.saasRoles) expect(allowed.has(r), `${s.id} SaaS: ${r}`).toBe(true)
    }
    expect(canSeeSharedSurfaces('waiter')).toBe(false)
    expect(canSeeSharedSurfaces('kitchen')).toBe(false)
    expect(canSeeSharedSurfaces('cashier')).toBe(true)
  })

  it('el sidebar del SaaS no se las muestra al mozo ni a cocina', () => {
    const src = readFileSync(join(SAAS, 'components', 'admin', 'AdminSidebar.tsx'), 'utf8')
    for (const s of SHARED_SURFACES) {
      const path = s.saasPath.replace('/admin', '')
      const line = src.split('\n').find((l) => l.includes(`\${base}${path}\``))
      expect(line, `sidebar sin ${s.saasPath}`).toBeDefined()
      const roles = [...(/roles: \[([^\]]*)\]/.exec(line!)?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
      for (const r of roles) expect(['admin', 'manager', 'cashier'], `${s.saasPath} muestra a ${r}`).toContain(r)
    }
  })

  it('los contextos del POS (caja, ventas, facturación, flota) no incluyen mozo ni cocina', async () => {
    const { ROS_CONTEXTS } = await import(join(REPO, 'apps', 'pos', 'src', 'components', 'layout', 'contexts.ts'))
    for (const id of ['caja', 'ventas', 'facturacion', 'flota']) {
      const ctx = (ROS_CONTEXTS as { id: string; roles: readonly string[] }[]).find((c) => c.id === id)!
      for (const r of ctx.roles) expect(allowed.has(r), `${id}: ${r}`).toBe(true)
    }
  })

  it('las rutas de reservas y pausar del POS excluyen al mozo', () => {
    const route = (rel: string) => readFileSync(join(SAAS, 'app', 'api', '[tenant]', 'pos', ...rel.split('/'), 'route.ts'), 'utf8')
    const cap = (src: string, method: string) => new RegExp(`export const ${method} = posRoute(?:<[^>]*>)?\\('([a-z.]+)'`).exec(src)![1]
    for (const [rel, method] of [['reservations', 'GET'], ['reservations/seen', 'POST'], ['reservations/[id]', 'PATCH'], ['menu/items/[itemId]', 'PATCH']] as const) {
      const c = cap(route(rel), method)
      expect(hasPosCapability('waiter', c as never), `${method} ${rel} (${c})`).toBe(false)
      expect(hasPosCapability('cashier', c as never), `${method} ${rel} (${c})`).toBe(true)
    }
  })
})

describe('mapeo de roles SaaS → POS', () => {
  it('encargado de operaciones y recepción entran al POS; cocina y auditor todavía no', () => {
    expect(SAAS_TO_POS_ROLE.operations_manager).toBe('manager')
    expect(SAAS_TO_POS_ROLE.host).toBe('waiter')
    expect(SAAS_TO_POS_ROLE.kitchen_lead).toBeNull()
    expect(SAAS_TO_POS_ROLE.auditor).toBeNull()
    expect(SAAS_TO_POS_ROLE.consumer).toBeNull()
  })
})

describe('impresoras', () => {
  it('el modelo Printer acepta exactamente los documentos de business/printing', async () => {
    const { PRINTER_DOCUMENTS } = await import('@takeasygo/business')
    const src = readFileSync(join(SAAS, 'models', 'Printer.ts'), 'utf8')
    const values = [...(/PRINTER_DOCUMENT_VALUES = \[([^\]]*)\]/.exec(src)?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect(values).toEqual([...PRINTER_DOCUMENTS])
  })
})

describe('planes', () => {
  it('delivery está en Trial, Crecimiento y Premium', () => {
    expect(canAccess('buy', 'delivery')).toBe(true)
    expect(canAccess('try', 'delivery')).toBe(false)
    expect(canAccess('full', 'delivery')).toBe(true)
  })

  it('impresoras por sede: Inicial 2, Crecimiento 3, Premium 4', () => {
    expect(PRINTER_LIMIT).toMatchObject({ try: 2, trial: 2, buy: 3, full: 4, anfitrion: 0 })
  })
})

describe('printerLimitError', () => {
  it('frena el alta cuando la sede llegó al tope del plan, y la deja pasar si hay lugar', async () => {
    const { printerLimitError } = await import('@/lib/printers/limits')
    const tenant = { _id: '64b000000000000000000001', plan: 'try' as const }
    const loc = '64b000000000000000000002'
    count.mockResolvedValue(2)
    const res = await printerLimitError(tenant, loc)
    expect(res?.status).toBe(403)
    expect((await res!.json()).error).toContain('hasta 2 impresoras')
    count.mockResolvedValue(1)
    expect(await printerLimitError(tenant, loc)).toBeNull()
    count.mockResolvedValue(3)
    expect(await printerLimitError({ ...tenant, plan: 'full' }, loc)).toBeNull()
    expect(count.mock.calls[0][0]).toMatchObject({ isActive: true })
  })
})

describe('panel web reducido «solo POS» (fase 6)', () => {
  it('cada sección permitida existe en el sidebar del panel', () => {
    const src = readFileSync(join(SAAS, 'components', 'admin', 'AdminSidebar.tsx'), 'utf8')
    for (const path of POS_ONLY_ADMIN_PATHS) {
      const href = path === '' ? 'href: base,' : '${base}/' + path + '`'
      expect(src.includes(href), 'sidebar sin ' + (path || 'Dashboard')).toBe(true)
    }
  })

  it('deja la oficina y saca venta online, club, marketing y comisiones', () => {
    for (const ok of ['', 'menu', 'settings', 'factura-electronica', 'users', 'printers', 'caja-pos']) expect(isPosOnlyAdminPath(ok)).toBe(true)
    for (const no of ['orders', 'orders/history', 'club', 'store', 'promotions', 'marketing-qr', 'commissions', 'crm', 'delivery', 'reservas']) expect(isPosOnlyAdminPath(no)).toBe(false)
  })
})
