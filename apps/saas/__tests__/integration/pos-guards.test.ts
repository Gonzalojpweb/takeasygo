import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import mongoose from 'mongoose'
import './setup'

import Tenant from '@/models/Tenant'
import { signJwt } from '@takeasygo/business/jwt'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import type { NextRequest } from 'next/server'
import type { JwtPayload } from '@takeasygo/types'

/**
 * Regresión de seguridad — M1.
 *
 * Verifica que las escrituras que estaban sin NINGÚN guard ahora rechazan
 * peticiones no autenticadas, y que el puente RS256 del POS (M2) las
 * autentica correctamente con el rol y el tenant del token.
 */

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

// La ruta promotions/reorder usa next/headers para su chequeo CSRF.
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue({
    get: (k: string) => (k === 'x-tenant-slug' ? 'test-tenant' : null),
  }),
}))

import { POST as specialDatesPost, GET as specialDatesGet } from '@/app/api/[tenant]/special-dates/route'
import { DELETE as specialDateDelete } from '@/app/api/[tenant]/special-dates/[id]/route'
import { PUT as promotionsReorderPut } from '@/app/api/[tenant]/promotions/reorder/route'
import { POST as preclosePrintPost } from '@/app/api/[tenant]/preclose/print/route'
import { POST as transfersPost, GET as transfersGet } from '@/app/api/[tenant]/inventory/transfers/route'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string

let tenantId: string

function bearer(token: string | null): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {}
}

function posToken(role: JwtPayload['role'], tid = tenantId): string {
  return signJwt(
    {
      sub: '64b0000000000000000000a1',
      tenantId: tid,
      role,
      deviceType: 'hub',
    },
    PRIVATE_PEM
  )
}

function req(
  method: string,
  url: string,
  body: unknown,
  headers: Record<string, string> = {}
): NextRequest {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest
}

const params = { params: Promise.resolve({ tenant: 'test-tenant' }) }
const notFoundParams = { params: Promise.resolve({ tenant: 'test-tenant', id: '64b0000000000000000000ff' }) }
const URL_BASE = 'http://localhost:3000/api/test-tenant'

beforeAll(() => {
  process.env.POS_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string
  __resetPosJwtKeyCacheForTests()
})

beforeEach(async () => {
  // Sin sesión NextAuth: la única vía de autenticación es el Bearer RS256.
  // (setup.ts también mockea auth; lo forzamos a null para cada test.)
  ;(auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)

  // setup.ts borra las colecciones en cada afterEach: crear el tenant por test.
  const tenant = await Tenant.create({ name: 'Test Tenant', slug: 'test-tenant', plan: 'full' })
  tenantId = tenant._id.toString()
})

type Case = {
  name: string
  call: (headers: Record<string, string>) => Promise<Response>
}

const CASES: Case[] = [
  {
    name: 'GET special-dates',
    call: (h) => specialDatesGet(req('GET', `${URL_BASE}/special-dates`, undefined, h), params),
  },
  {
    name: 'POST special-dates',
    call: (h) => specialDatesPost(req('POST', `${URL_BASE}/special-dates`, {}, h), params),
  },
  {
    name: 'DELETE special-dates/[id]',
    call: (h) => specialDateDelete(req('DELETE', `${URL_BASE}/special-dates/x`, undefined, h), notFoundParams),
  },
  {
    name: 'PUT promotions/reorder',
    // Enviamos el header CSRF para que el chequeo pase y se ejerza realmente
    // requireAdminRole (si no, devolvería 401 por el header y no probaría nada).
    call: (h) =>
      promotionsReorderPut(
        req('PUT', `${URL_BASE}/promotions/reorder`, { orderedIds: [] }, { ...h, 'x-tenant-slug': 'test-tenant' }),
        params
      ),
  },
  {
    name: 'POST preclose/print',
    call: (h) => preclosePrintPost(req('POST', `${URL_BASE}/preclose/print`, {}, h), params),
  },
  {
    name: 'POST inventory/transfers',
    call: (h) => transfersPost(req('POST', `${URL_BASE}/inventory/transfers`, {}, h), params),
  },
  {
    name: 'GET inventory/transfers',
    call: (h) => transfersGet(req('GET', `${URL_BASE}/inventory/transfers`, undefined, h), params),
  },
]

describe('M1 — Guards de escritura: sin token → 401', () => {
  for (const c of CASES) {
    it(`${c.name} rechaza sin Authorization`, async () => {
      const res = await c.call({})
      expect(res.status).toBe(401)
    })
  }
})

// Auditoría de seguridad 30/10/2026 (A1): el token del POS SOLO vale en la
// superficie del POS (/api/{tenant}/pos/*) y en el logout. Antes abría las
// rutas del panel (inventario, fechas especiales, settings…) con el rol del
// token; el POS no las usa. Fuera de /pos/* se rechaza (401) con cualquier rol.
describe('A1 — token POS fuera de /pos/* → 401 con cualquier rol', () => {
  it('POST inventory/transfers rechaza un token POS aunque sea admin', async () => {
    const res = await transfersPost(req('POST', `${URL_BASE}/inventory/transfers`, {}, bearer(posToken('admin'))), params)
    expect(res.status).toBe(401)
  })

  it('POST inventory/transfers rechaza un token POS de cajero', async () => {
    const res = await transfersPost(req('POST', `${URL_BASE}/inventory/transfers`, {}, bearer(posToken('cashier'))), params)
    expect(res.status).toBe(401)
  })

  it('POST special-dates rechaza un token POS aunque sea admin', async () => {
    const res = await specialDatesPost(
      req('POST', `${URL_BASE}/special-dates`, {}, bearer(posToken('admin'))),
      params
    )
    expect(res.status).toBe(401)
  })

  it('POST special-dates rechaza un token POS de cajero', async () => {
    const res = await specialDatesPost(
      req('POST', `${URL_BASE}/special-dates`, {}, bearer(posToken('cashier'))),
      params
    )
    expect(res.status).toBe(401)
  })

  it('DELETE special-dates/[id] rechaza un token POS de mozo', async () => {
    const res = await specialDateDelete(
      req('DELETE', `${URL_BASE}/special-dates/x`, undefined, bearer(posToken('waiter'))),
      notFoundParams
    )
    expect(res.status).toBe(401)
  })
})

describe('M1 — Aislamiento de tenant', () => {
  it('rechaza un token emitido para OTRO tenant (401/403)', async () => {
    const otherTenant = new mongoose.Types.ObjectId().toString()
    const res = await specialDatesPost(
      req('POST', `${URL_BASE}/special-dates`, {}, bearer(posToken('admin', otherTenant))),
      params
    )
    expect([401, 403]).toContain(res.status)
  })

  it('rechaza un token con firma inválida', async () => {
    const rogue = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const token = signJwt(
      { sub: 'x', tenantId: tenantId, role: 'admin', deviceType: 'hub' },
      rogue.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
    )
    const res = await specialDatesPost(
      req('POST', `${URL_BASE}/special-dates`, {}, bearer(token)),
      params
    )
    expect(res.status).toBe(401)
  })

  it('rechaza un Bearer que no es un JWT', async () => {
    const res = await transfersPost(
      req('POST', `${URL_BASE}/inventory/transfers`, {}, bearer('no-es-un-jwt')),
      params
    )
    expect(res.status).toBe(401)
  })
})
