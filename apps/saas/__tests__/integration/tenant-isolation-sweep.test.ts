import { describe, it, expect, beforeAll, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import mongoose from 'mongoose'
import './setup'

import Tenant from '@/models/Tenant'
import User from '@/models/User'
import { auth } from '@/lib/auth'
import { clearFreshUserCache } from '@/lib/apiAuth'

/**
 * Línea base de AISLAMIENTO entre comercios (PR 1, 31/10/2026).
 *
 * Barre TODAS las rutas GET de app/api/[tenant] con el admin de la marca B
 * pidiendo datos de la marca A. Para cada ruta:
 *   - nunca puede aparecer un dato privado de A (marcadores SECRETO-A),
 *   - fuera de las rutas públicas por diseño (OPEN_BY_DESIGN del contrato de
 *     auth), la respuesta debe ser 401/403/404.
 * Control positivo: el admin de A sí entra a su propio comercio.
 *
 * KNOWN_FOREIGN_2XX documenta las rutas privadas que HOY responden 2xx a un
 * usuario de otro comercio sin filtrar datos (línea base). Solo se achica.
 */

vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ 'x-tenant-slug': 'iso-a' })),
  cookies: vi.fn(async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => {}, delete: () => {} })),
}))
vi.mock('@upstash/redis', () => ({
  Redis: class {
    get = vi.fn(async () => null)
    set = vi.fn(async () => 'OK')
    del = vi.fn(async () => 0)
    incr = vi.fn(async () => 1)
    expire = vi.fn(async () => 1)
    exists = vi.fn(async () => 0)
    sadd = vi.fn(async () => 1)
    sismember = vi.fn(async () => 0)
    static fromEnv() { return new this() }
  },
}))

const ROUTES_DIR = join(__dirname, '..', '..', 'app', 'api', '[tenant]')
const AUTH_CONTRACT = readFileSync(join(__dirname, '..', 'api-route-auth-contract.test.ts'), 'utf8')
const OPEN_BY_DESIGN = new Set(
  [...(AUTH_CONTRACT.match(/const OPEN_BY_DESIGN = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? '').matchAll(/'([^']+route\.ts)'/g)].map((m) => m[1])
)

/**
 * GET sin guard (responden a CUALQUIERA, no solo a otro comercio) que el
 * contrato de auth no detecta porque el archivo tiene guard en otro método.
 * Línea base 31/10/2026; cada una con su motivo. Solo se achica.
 */
const KNOWN_FOREIGN_2XX: Record<string, string> = {
  // Públicas por diseño (menú, club, tienda) — pendiente declararlas como GET públicos
  'locations/route.ts': 'público: barra de sedes del menú (LocationBar). Filtra de más → S7',
  'locations/[locationId]/route.ts': 'público: checkout del menú. Incluye WhatsApp de la sede → S7',
  'loyalty/settings/route.ts': 'público: configuración del club para la página del club',
  'promotions/route.ts': 'público: promociones del menú',
  'store/config/route.ts': 'público: configuración de la tienda de canjes',
  'store/items/route.ts': 'público: catálogo de la tienda de canjes (el detalle admin exige sesión)',
  // A corregir
  'settings/notifications/route.ts': 'S8: GET sin sesión devuelve las notificaciones del comercio (WhatsApp admin)',
  'delivery/persons/route.ts': 'S8: GET sin sesión devuelve repartidores (nombre y teléfono)',
}

/** Respuestas que HOY contienen datos privados de A (línea base 31/10/2026). Solo se achica. */
const KNOWN_LEAKS: Record<string, string> = {
  'settings/notifications/route.ts': 'S8: WhatsApp de notificaciones del comercio',
  'locations/route.ts': 'S7: documento completo de la sede (WhatsApp, apiToken/webhookSecret cifrados de Rapiboy, hash del agente)',
  'locations/[locationId]/route.ts': 'S7: WhatsApp de la sede',
}

// Datos que NO deben salir nunca a otro comercio ni al público. El CBU/alias y
// titular de transferencia NO van acá: el checkout los muestra al cliente.
const SECRETS = ['SECRETO-A-CLIENTE', 'secreto-a-socio@iso.test', 'secreto-a-admin@iso.test', 'SECRETO-A-WHATSAPP', 'SECRETO-A-RAPIBOY']
const PER_ROUTE_TIMEOUT_MS = 6_000

const ids = {
  tenantA: new mongoose.Types.ObjectId(),
  tenantB: new mongoose.Types.ObjectId(),
  locationA: new mongoose.Types.ObjectId(),
  orderA: new mongoose.Types.ObjectId(),
  memberA: new mongoose.Types.ObjectId(),
  adminA: new mongoose.Types.ObjectId(),
  adminB: new mongoose.Types.ObjectId(),
}

function listGetRoutes(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...listGetRoutes(join(dir, e.name), rel))
    else if (e.name === 'route.ts' && /export\s+(async\s+function|const)\s+GET\b/.test(readFileSync(join(dir, e.name), 'utf8'))) out.push(rel)
  }
  return out.sort()
}

function paramsFor(rel: string, slug: string): Record<string, string> {
  const params: Record<string, string> = { tenant: slug }
  for (const [, name] of rel.matchAll(/\[([a-zA-Z.]+)\]/g)) {
    if (name === 'locationId') params[name] = String(ids.locationA)
    else if (name === 'orderId') params[name] = String(ids.orderA)
    else if (name === 'memberId') params[name] = String(ids.memberA)
    else if (name === 'email') params[name] = 'secreto-a-socio@iso.test'
    else if (name === 'itemIndex') params[name] = '0'
    else if (['token', 'code', 'key'].includes(name)) params[name] = 'x'.repeat(16)
    else params[name] = String(new mongoose.Types.ObjectId())
  }
  return params
}

type Outcome = { rel: string; status: number | 'timeout' | 'throw'; leak: string | null; detail?: string }

async function callGet(rel: string, slug: string): Promise<Outcome> {
  const params = paramsFor(rel, slug)
  const urlPath = rel.replace(/\/route\.ts$/, '').replace(/\[([a-zA-Z.]+)\]/g, (_, n) => params[n])
  const url = `http://localhost/api/${slug}/${urlPath === 'route.ts' ? '' : urlPath}?locationId=${ids.locationA}`
  try {
    const mod = await import(/* @vite-ignore */ join(ROUTES_DIR, rel))
    const req = new NextRequest(url, { headers: { 'x-tenant-slug': slug, 'x-forwarded-for': '198.51.100.7' } })
    const res: Response | 'timeout' = await Promise.race([
      mod.GET(req, { params: Promise.resolve(params) }),
      new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), PER_ROUTE_TIMEOUT_MS)),
    ])
    if (res === 'timeout') return { rel, status: 'timeout', leak: null }
    const text = await res.text().catch(() => '')
    return { rel, status: res.status, leak: SECRETS.find((s) => text.includes(s)) ?? null }
  } catch (err) {
    return { rel, status: 'throw', leak: null, detail: String((err as Error)?.message ?? err).slice(0, 120) }
  }
}

function sessionOf(id: mongoose.Types.ObjectId, tenantId: mongoose.Types.ObjectId, slug: string) {
  return { user: { id: String(id), role: 'admin', tenantId: String(tenantId), tenantSlug: slug, assignedLocations: [], email: `${slug}@iso.test` }, expires: '' }
}

const ROUTES = listGetRoutes(ROUTES_DIR)
let foreign: Outcome[] = []

beforeAll(async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })))
  const db = mongoose.connection.db!
  await Tenant.create([
    {
      _id: ids.tenantA, name: 'Iso A', slug: 'iso-a', plan: 'full', status: 'active', isActive: true,
      transfer: { enabled: true, alias: 'alias.a', cbu: '0000000000000000000001', cvu: null, bankName: 'B', holderName: 'Titular A' },
      notifications: { whatsappPhone: 'SECRETO-A-WHATSAPP', notifyOnOrder: true, notifyOnReservation: true },
      loyalty: { enabled: true, clubName: 'Club A', welcomeMessage: 'Hola' },
    },
    { _id: ids.tenantB, name: 'Iso B', slug: 'iso-b', plan: 'full', status: 'active', isActive: true },
  ])
  await User.create([
    { _id: ids.adminA, name: 'Admin A', email: 'secreto-a-admin@iso.test', phone: '+5491100000a1', role: 'admin', tenantId: ids.tenantA, isActive: true },
    { _id: ids.adminB, name: 'Admin B', email: 'admin-b@iso.test', phone: '+5491100000b1', role: 'admin', tenantId: ids.tenantB, isActive: true },
  ])
  // Inserciones crudas: datos privados de A con marcadores, sin validar el esquema completo.
  await db.collection('locations').insertOne({ _id: ids.locationA, tenantId: ids.tenantA, name: 'Sede A', slug: 'sede-a', isActive: true, status: 'active', settings: { acceptsOrders: true, orderModes: ['takeaway'], whatsappPhone: 'SECRETO-A-WHATSAPP' }, rapiboyConfig: { enabled: false, apiToken: 'SECRETO-A-RAPIBOY', webhookSecret: 'SECRETO-A-RAPIBOY' }, timezone: 'America/Argentina/Buenos_Aires' })
  await db.collection('orders').insertOne({ _id: ids.orderA, tenantId: ids.tenantA, locationId: ids.locationA, orderNumber: 'A-1', status: 'pending', orderMode: 'takeaway', items: [], total: 1000, subtotal: 1000, customer: { name: 'SECRETO-A-CLIENTE', phone: '1100000000', email: 'secreto-a-socio@iso.test' }, payment: { status: 'pending', method: 'cash' }, createdAt: new Date(), updatedAt: new Date(), deletedAt: null })
  await db.collection('loyaltymembers').insertOne({ _id: ids.memberA, tenantId: ids.tenantA, name: 'SECRETO-A-CLIENTE', phone: '1100000001', phoneHash: 'h-a', email: 'secreto-a-socio@iso.test', status: 'active', joinedAt: new Date(), loyalty: { points: 10 }, createdAt: new Date() })

  // El setup global borra las colecciones afterEach: el barrido corre entero acá.
  clearFreshUserCache()
  vi.mocked(auth).mockResolvedValue(sessionOf(ids.adminB, ids.tenantB, 'iso-b') as any)
  for (const rel of ROUTES) foreign.push(await callGet(rel, 'iso-a'))
}, 1_800_000)

describe('Aislamiento entre comercios: admin de B contra todas las rutas GET de A', () => {
  it('barre todas las rutas GET', () => {
    expect(ROUTES.length).toBeGreaterThan(150)
    expect(foreign.length).toBe(ROUTES.length)
  })

  it('ninguna respuesta contiene datos privados de A (fuera de la línea base)', () => {
    const leaks = foreign.filter((o) => o.leak && !KNOWN_LEAKS[o.rel]).map((o) => `${o.rel} (${o.status}) → ${o.leak}`)
    expect(leaks, leaks.join('\n')).toEqual([])
  })

  it('las rutas privadas niegan (401/403/404) al usuario de otro comercio', () => {
    const allowed = foreign
      .filter((o) => typeof o.status === 'number' && o.status >= 200 && o.status < 300)
      .filter((o) => !OPEN_BY_DESIGN.has(o.rel) && !KNOWN_FOREIGN_2XX[o.rel])
      .map((o) => `${o.rel} → ${o.status}`)
    expect(allowed, allowed.join('\n')).toEqual([])
  })

  it('la línea base solo se achica: si una ruta ya no filtra o ya niega, sacala de la lista', () => {
    const byRel = new Map(foreign.map((o) => [o.rel, o]))
    const stale = [
      ...Object.keys(KNOWN_LEAKS).filter((rel) => !byRel.get(rel)?.leak).map((rel) => `KNOWN_LEAKS ${rel} ya no filtra`),
      ...Object.keys(KNOWN_FOREIGN_2XX)
        .filter((rel) => { const s = byRel.get(rel)?.status; return !(typeof s === 'number' && s >= 200 && s < 300) })
        .map((rel) => `KNOWN_FOREIGN_2XX ${rel} ya niega (${byRel.get(rel)?.status})`),
    ]
    expect(stale, stale.join('\n')).toEqual([])
  })

  it('reporte de la línea base (5xx, timeouts y excepciones quedan registrados)', () => {
    const tally: Record<string, number> = {}
    for (const o of foreign) {
      const k = typeof o.status === 'number' ? `${Math.floor(o.status / 100)}xx${[401, 403, 404].includes(o.status) ? `(${o.status})` : ''}` : o.status
      tally[k] = (tally[k] ?? 0) + 1
    }
    const odd = foreign.filter((o) => typeof o.status !== 'number' || o.status >= 500 || (o.status >= 400 && ![401, 403, 404].includes(o.status)))
    if (process.env.PRINT_ISOLATION_REPORT) {
      console.log('[aislamiento] resumen', JSON.stringify(tally))
      for (const o of odd) console.log('[aislamiento] revisar', o.rel, o.status, o.detail ?? '')
    }
    expect(Object.values(tally).reduce((a, b) => a + b, 0)).toBe(ROUTES.length)
  })
})

describe('Control positivo: el admin de A entra a su propio comercio', () => {
  it('GET /api/iso-a/orders responde 200 al admin de A', async () => {
    // Re-siembra mínima (el setup vació las colecciones después del beforeAll).
    await Tenant.create({ _id: ids.tenantA, name: 'Iso A', slug: 'iso-a', plan: 'full', status: 'active', isActive: true })
    await User.create({ _id: ids.adminA, name: 'Admin A', email: 'secreto-a-admin@iso.test', phone: '+5491100000a1', role: 'admin', tenantId: ids.tenantA, isActive: true })
    clearFreshUserCache()
    vi.mocked(auth).mockResolvedValue(sessionOf(ids.adminA, ids.tenantA, 'iso-a') as any)
    const own = await callGet('orders/route.ts', 'iso-a')
    expect(own.status).toBe(200)

    clearFreshUserCache()
    vi.mocked(auth).mockResolvedValue(sessionOf(ids.adminB, ids.tenantB, 'iso-b') as any)
    await User.create({ _id: ids.adminB, name: 'Admin B', email: 'admin-b@iso.test', phone: '+5491100000b1', role: 'admin', tenantId: ids.tenantB, isActive: true })
    const other = await callGet('orders/route.ts', 'iso-a')
    expect(other.status).toBe(403)
  })
})
