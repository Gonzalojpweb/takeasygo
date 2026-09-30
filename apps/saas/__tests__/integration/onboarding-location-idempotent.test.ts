import { describe, it, expect, beforeEach, vi } from 'vitest'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import type { NextRequest } from 'next/server'

/**
 * Fase 9.1 — reedición tras rechazo.
 *
 * Un prospecto rechazado vuelve al wizard y recae en el paso "sede". El índice
 * único { tenantId, slug } hace que un `Location.create()` repetido tire 500 y
 * lo deje trabado sin poder reenviar. La ruta con `x-onboarding: 1` debe ser
 * idempotente; fuera de ese contexto el índice único sigue intacto.
 */

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/geocode', () => ({
  geocodeText: vi.fn().mockResolvedValue(null),
}))

import { POST as locationsPost } from '@/app/api/[tenant]/locations/route'

const params = { params: Promise.resolve({ tenant: 'test-tenant' }) }
const URL_BASE = 'http://localhost:3000/api/test-tenant/locations'

function req(body: Record<string, unknown>, headers: Record<string, string> = {}): NextRequest {
  return new Request(URL_BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

const SEDE = { name: 'Sede Principal', address: 'Av. Siempreviva 742', isActive: true }

beforeEach(async () => {
  await Tenant.create({ name: 'Test Tenant', slug: 'test-tenant', plan: 'full' })
})

describe('POST /api/[tenant]/locations — reenvío del wizard de onboarding', () => {
  it('crea la sede en el primer envío', async () => {
    const res = await locationsPost(req(SEDE, { 'x-onboarding': '1' }), params)
    expect(res.status).toBe(201)

    expect(await Location.countDocuments({})).toBe(1)
  })

  it('es idempotente: el segundo reenvío no duplica ni devuelve 500', async () => {
    const first = await locationsPost(req(SEDE, { 'x-onboarding': '1' }), params)
    expect(first.status).toBe(201)
    const firstBody = await first.json()

    const second = await locationsPost(req(SEDE, { 'x-onboarding': '1' }), params)
    expect(second.status).toBe(201)
    const secondBody = await second.json()

    expect(await Location.countDocuments({})).toBe(1)
    expect(String(secondBody.location._id)).toBe(String(firstBody.location._id))
    expect(secondBody.location.slug).toBe(firstBody.location.slug)
  })

  it('el reenvío actualiza los datos en lugar de dejar la sede vieja', async () => {
    const first = await locationsPost(
      req({ ...SEDE, phone: '11-0000-0000' }, { 'x-onboarding': '1' }),
      params
    )
    expect(first.status).toBe(201)

    const second = await locationsPost(
      req({ ...SEDE, phone: '11-9999-9999' }, { 'x-onboarding': '1' }),
      params
    )
    expect(second.status).toBe(201)

    expect(await Location.countDocuments({})).toBe(1)
    const stored = await Location.findOne({})
    expect(stored?.phone).toBe('11-9999-9999')
  })

  it('fuera del wizard (sin x-onboarding) el índice único sigue tirando error', async () => {
    const withSlug = { ...SEDE, slug: 'sede-principal' }
    expect((await locationsPost(req(withSlug), params)).status).toBe(201)
    expect((await locationsPost(req(withSlug), params)).status).toBe(500)

    expect(await Location.countDocuments({})).toBe(1)
  })

  it('sin x-onboarding puede crear una sede con nombre distinto', async () => {
    expect((await locationsPost(req({ ...SEDE, slug: 'sede-principal' }), params)).status).toBe(201)
    expect(
      (
        await locationsPost(
          req({ ...SEDE, name: 'Sucursal Centro', slug: 'sucursal-centro' }),
          params
        )
      ).status
    ).toBe(201)

    expect(await Location.countDocuments({})).toBe(2)
  })
})
