import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import mongoose from 'mongoose'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { signJwt } from '@takeasygo/business/jwt'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import type { NextRequest } from 'next/server'

import { resolvePosContext } from '@/lib/pos-online/tenantContext'
import { PosError, isPosError } from '@/lib/pos-online/errors'

/**
 * M4 — resolución de tenant + sesión + sede.
 *
 * Regla: el server nunca inventa una sede. Token con sede = alcance fijo;
 * token sin sede (legacy) = la declara la petición; ninguna de las dos y
 * una sola sede activa = se resuelve sola; varias o ninguna = error tipado.
 */

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string

let tenantId: string
let otherTenantId: string
let locationId: string
let otherLocationId: string

function token(role: 'cashier' | 'admin' | 'superadmin', tid?: string, loc?: string): string {
  return signJwt(
    {
      sub: '64b0000000000000000000a1',
      tenantId: tid ?? tenantId,
      role,
      deviceType: 'hub',
      ...(loc ? { locationId: loc } : {}),
    },
    PRIVATE_PEM
  )
}

function bearer(token: string | null): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {}
}

function req(url: string, headers: Record<string, string> = {}): NextRequest {
  return new Request(url, { method: 'GET', headers }) as unknown as NextRequest
}

async function expectPosError(
  promise: Promise<unknown>,
  code: string,
  status: number
): Promise<PosError> {
  let caught: unknown
  try {
    await promise
  } catch (e) {
    caught = e
  }
  expect(isPosError(caught)).toBe(true)
  expect((caught as PosError).code).toBe(code)
  expect((caught as PosError).status).toBe(status)
  return caught as PosError
}

beforeAll(() => {
  process.env.POS_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string
  __resetPosJwtKeyCacheForTests()
})

beforeEach(async () => {
  // Sin sesión NextAuth: la única vía es el Bearer RS256.
  ;(auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)

  // setup.ts borra las colecciones en cada afterEach.
  const tenant = await Tenant.create({ name: 'Test Tenant', slug: 'test-tenant', plan: 'full' })
  tenantId = tenant._id.toString()

  const other = await Tenant.create({ name: 'Other', slug: 'other-tenant', plan: 'full' })
  otherTenantId = other._id.toString()

  const loc = await Location.create({
    tenantId,
    name: 'Local Centro',
    slug: 'centro',
    address: 'Av. Siempreviva 742',
    isActive: true,
  })
  locationId = loc._id.toString()

  const otherLoc = await Location.create({
    tenantId: otherTenantId,
    name: 'Other Local',
    slug: 'otro',
    address: 'Calle 1',
    isActive: true,
  })
  otherLocationId = otherLoc._id.toString()
})

const SLUG = 'test-tenant'
const URL_ = `http://localhost:3000/api/${SLUG}/pos/orders`

describe('resolvePosContext — tenant y sesión', () => {
  it('rechaza sin token (401)', async () => {
    await expectPosError(resolvePosContext(req(URL_), SLUG), 'unauthorized', 401)
  })

  it('rechaza un token con firma inválida (401)', async () => {
    const rogue = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const bad = signJwt(
      { sub: 'x', tenantId, role: 'cashier', deviceType: 'hub' },
      rogue.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
    )
    await expectPosError(resolvePosContext(req(URL_, bearer(bad)), SLUG), 'unauthorized', 401)
  })

  it('rechaza un token de OTRO tenant (403)', async () => {
    await expectPosError(
      resolvePosContext(req(URL_, bearer(token('cashier', otherTenantId))), SLUG),
      'forbidden',
      403
    )
  })

  it('un superadmin NO perteneciente al tenant sí pasa (bypass)', async () => {
    const ctx = await resolvePosContext(req(URL_, bearer(token('superadmin', otherTenantId))), SLUG)
    expect(ctx.tenantId).toBe(tenantId)
    expect(ctx.user.role).toBe('superadmin')
  })

  it('slug inválido → 404 sin tocar la DB', async () => {
    await expectPosError(resolvePosContext(req(URL_, bearer(token('cashier'))), '../etc'), 'not_found', 404)
  })

  it('tenant inexistente/inactivo → 404', async () => {
    await expectPosError(
      resolvePosContext(req(URL_, bearer(token('cashier'))), 'no-existe'),
      'not_found',
      404
    )
  })
})

describe('resolvePosContext — la ruta [tenant] acepta slug u ObjectId', () => {
  // El POS no tiene el slug: decodifica `tenantId` (ObjectId) del JWT que emite
  // apps/sync. Sin esto, ningún POS podría llamar a /api/[tenant]/pos/*.
  it('acepta el ObjectId del tenant', async () => {
    const ctx = await resolvePosContext(req(URL_, bearer(token('cashier'))), tenantId)
    expect(ctx.tenantId).toBe(tenantId)
    expect(ctx.tenantSlug).toBe(SLUG)
  })

  it('con ObjectId ajeno en la ruta y token propio → 403', async () => {
    await expectPosError(
      resolvePosContext(req(URL_, bearer(token('cashier'))), otherTenantId),
      'forbidden',
      403
    )
  })

  it('ObjectId inexistente → 404 genérico', async () => {
    await expectPosError(
      resolvePosContext(req(URL_, bearer(token('cashier'))), 'ffffffffffffffffffffffff'),
      'not_found',
      404
    )
  })

  it('si un slug fuera 24 hex, manda el _id (un slug no desplaza al POS)', async () => {
    // tenant B toma como slug el ObjectId de A.
    await Tenant.create({ name: 'B', slug: tenantId, plan: 'full' })

    // Pidiendo esa clave con el token de A se resuelve A (gana _id)…
    const ctx = await resolvePosContext(req(URL_, bearer(token('cashier'))), tenantId)
    expect(ctx.tenantId).toBe(tenantId)
    expect(ctx.tenantSlug).toBe(SLUG)

    // …y el token de B no puede colarse en A.
    await expectPosError(
      resolvePosContext(req(URL_, bearer(token('cashier', otherTenantId))), tenantId),
      'forbidden',
      403
    )
  })
})

describe('resolvePosContext — sede fijada por el token (multi-sede)', () => {
  it('usa el locationId del token y marca scopedByToken', async () => {
    const ctx = await resolvePosContext(
      req(URL_, bearer(token('cashier', tenantId, locationId))),
      SLUG
    )
    expect(ctx.locationId).toBe(locationId)
    expect(ctx.scopedByToken).toBe(true)
  })

  it('la sede del token debe pertenecer al tenant', async () => {
    await expectPosError(
      resolvePosContext(req(URL_, bearer(token('cashier', tenantId, otherLocationId))), SLUG),
      'forbidden',
      403
    )
  })

  it('la sede del token debe estar activa', async () => {
    const paused = await Location.create({
      tenantId,
      name: 'Pausada',
      slug: 'pausada',
      address: 'x',
      isActive: false,
    })
    await expectPosError(
      resolvePosContext(
        req(URL_, bearer(token('cashier', tenantId, paused._id.toString()))),
        SLUG
      ),
      'forbidden',
      403
    )
  })

  it('un token atado a una sede NO puede declarar otra (403)', async () => {
    const second = await Location.create({
      tenantId,
      name: 'Segunda',
      slug: 'segunda',
      address: 'y',
      isActive: true,
    })
    await expectPosError(
      resolvePosContext(
        req(
          `${URL_}?locationId=${second._id.toString()}`,
          bearer(token('cashier', tenantId, locationId))
        ),
        SLUG
      ),
      'forbidden',
      403
    )
  })

  it('declarar exactamente la misma sede está bien', async () => {
    const ctx = await resolvePosContext(
      req(
        `${URL_}?locationId=${locationId}`,
        bearer(token('cashier', tenantId, locationId))
      ),
      SLUG
    )
    expect(ctx.locationId).toBe(locationId)
    expect(ctx.scopedByToken).toBe(true)
  })

  it('locationId declarado por header también cuenta', async () => {
    const ctx = await resolvePosContext(
      req(URL_, { ...bearer(token('cashier', tenantId, locationId)), 'x-location-id': locationId }),
      SLUG
    )
    expect(ctx.locationId).toBe(locationId)
  })

  it('locationId no-ObjectId dentro del token → 400 (nunca llega a la DB)', async () => {
    await expectPosError(
      resolvePosContext(req(URL_, bearer(token('cashier', tenantId, 'no-objectid'))), SLUG),
      'validation',
      400
    )
  })
})

describe('resolvePosContext — token legacy sin sede', () => {
  it('la sede declarada se valida contra el tenant', async () => {
    const ctx = await resolvePosContext(
      req(`${URL_}?locationId=${locationId}`, bearer(token('cashier'))),
      SLUG
    )
    expect(ctx.locationId).toBe(locationId)
    expect(ctx.scopedByToken).toBe(false)
  })

  it('una sede declarada de OTRO tenant → 403 (sin filtrar tenancy)', async () => {
    await expectPosError(
      resolvePosContext(
        req(`${URL_}?locationId=${otherLocationId}`, bearer(token('cashier'))),
        SLUG
      ),
      'forbidden',
      403
    )
  })

  it('con UNA sola sede activa se resuelve sola (POS legacy no se rompe)', async () => {
    const ctx = await resolvePosContext(req(URL_, bearer(token('cashier'))), SLUG)
    expect(ctx.locationId).toBe(locationId)
    expect(ctx.scopedByToken).toBe(false)
  })

  it('con DOS sedes activas exige locationId (400), no elige una al azar', async () => {
    await Location.create({
      tenantId,
      name: 'Segunda',
      slug: 'segunda',
      address: 'y',
      isActive: true,
    })
    const err = await expectPosError(
      resolvePosContext(req(URL_, bearer(token('cashier'))), SLUG),
      'validation',
      400
    )
    expect(err.detail).toContain('Ambiguous')
  })

  it('sin sedes activas → 400 con mensaje accionable', async () => {
    await Location.deleteMany({})
    const err = await expectPosError(
      resolvePosContext(req(URL_, bearer(token('cashier'))), SLUG),
      'validation',
      400
    )
    expect(err.message).toContain('Vinculá el POS')
  })
})

describe('resolvePosContext — no filtra información', () => {
  it('una sede inexistente responde 403, no 404 (no revela existencia)', async () => {
    const ghost = new mongoose.Types.ObjectId().toString()
    await expectPosError(
      resolvePosContext(
        req(`${URL_}?locationId=${ghost}`, bearer(token('cashier'))),
        SLUG
      ),
      'forbidden',
      403
    )
  })

  it('el slug desconocido responde 404 genérico, sin distinguir inactivo de inexistente', async () => {
    const err = await expectPosError(
      resolvePosContext(req(URL_, bearer(token('cashier'))), 'inactive-slug'),
      'not_found',
      404
    )
    expect(err.message).toBe('Tenant no encontrado')
  })
})
