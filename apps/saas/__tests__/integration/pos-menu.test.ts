import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import { signJwt } from '@takeasygo/business/jwt'
import { __resetPosJwtKeyCacheForTests } from '@/lib/posJwt'
import { auth } from '@/lib/auth'
import type { NextRequest } from 'next/server'

import { GET as menuGet } from '@/app/api/[tenant]/pos/menu/route'

/**
 * M4 — superficie POS: menú.
 *
 * Contrato idéntico al `GET /api/v1/menu/snapshot` de apps/sync, pero servido
 * por el SaaS. El aplanado NO está copiado: importa `flattenMenuSnapshot` de
 * @takeasygo/business, la misma función que consume sync.
 *
 * `signature` es el detector de cambios real que M5 compara antes de
 * reescribir Dexie.
 */

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string

const SLUG = 'test-tenant'
const MENU_URL = `http://localhost:3000/api/${SLUG}/pos/menu`

let tenantId: string
let locationId: string
let otherLocationId: string

function token(): string {
  return signJwt(
    { sub: '64b0000000000000000000a1', tenantId, role: 'cashier', deviceType: 'hub' },
    PRIVATE_PEM
  )
}

const AUTH = () => ({ authorization: `Bearer ${token()}`, 'x-location-id': locationId })

function req(url: string, headers: Record<string, string> = {}): NextRequest {
  return new Request(url, { method: 'GET', headers }) as unknown as NextRequest
}

const listParams = { params: Promise.resolve({ tenant: SLUG }) }

async function get(headers: Record<string, string> = {}) {
  const res = await menuGet(req(MENU_URL, headers), listParams)
  return { status: res.status, body: await res.json() }
}

beforeAll(() => {
  process.env.POS_JWT_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }) as string
  __resetPosJwtKeyCacheForTests()
})

beforeEach(async () => {
  ;(auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)

  const tenant = await Tenant.create({ name: 'Test Tenant', slug: SLUG, plan: 'full' })
  tenantId = tenant._id.toString()

  const loc = await Location.create({
    tenantId,
    name: 'Local Centro',
    slug: 'centro',
    address: 'Av. Siempreviva 742',
    isActive: true,
  })
  locationId = loc._id.toString()

  const other = await Location.create({
    tenantId,
    name: 'Local Norte',
    slug: 'norte',
    address: 'Av. Norte 100',
    isActive: true,
  })
  otherLocationId = other._id.toString()
})

describe('GET /pos/menu — guardas', () => {
  it('sin token → 401', async () => {
    const { status } = await get()
    expect(status).toBe(401)
  })

  it('token válido sin sede declarada (y varias sedes activas) → 400', async () => {
    const { status, body } = await get({ authorization: `Bearer ${token()}` })
    expect(status).toBe(400)
    expect(body.error.code).toBe('validation')
  })

  it('sede de otro tenant vía header → 403', async () => {
    const otherTenant = await Tenant.create({ name: 'Otro', slug: 'otro-tenant', plan: 'full' })
    const foreign = await Location.create({
      tenantId: otherTenant._id.toString(),
      name: 'Ajena',
      slug: 'ajena',
      address: 'x',
      isActive: true,
    })
    const { status } = await get({
      authorization: `Bearer ${token()}`,
      'x-location-id': foreign._id.toString(),
    })
    expect(status).toBe(403)
  })
})

describe('GET /pos/menu — snapshot', () => {
  it('sin menú → snapshot vacío con version 1 y signature', async () => {
    const { status, body } = await get(AUTH())
    expect(status).toBe(200)
    expect(body.products).toEqual([])
    expect(body.categories).toEqual([])
    expect(body.version).toBe(1)
    expect(typeof body.signature).toBe('string')
    expect(body.signature).toHaveLength(64)
    expect(body.tenantId).toBe(tenantId)
    expect(body.serverTime).toBeTruthy()
  })

  it('aplana categorías e ítems y hereda los grupos de la categoría', async () => {
    await Menu.create({
      tenantId,
      locationId,
      categories: [
        {
          name: 'Pizzas',
          sortOrder: 2,
          customizationGroups: [
            { name: 'Queso', type: 'single', required: false, options: [{ name: 'Extra', extraPrice: 100 }] },
          ],
          items: [{ name: 'Muzzarella', price: 8000 }],
        },
        {
          name: 'Bebidas',
          sortOrder: 1,
          items: [{ name: 'Agua', price: 1500 }],
        },
      ],
    })

    const { body } = await get(AUTH())

    expect(body.categories.map((c: { name: string }) => c.name)).toEqual(['Bebidas', 'Pizzas'])
    expect(body.categories[1].isVisible).toBe(true)
    expect(body.categories[1].sortOrder).toBe(2)

    expect(body.products).toHaveLength(2)
    const muz = body.products.find((p: { name: string }) => p.name === 'Muzzarella')
    expect(muz.category).toBe('Pizzas')
    expect(muz.tenantId).toBe(tenantId)
    expect(muz.id).toBeTruthy()
    expect(muz.price).toBe(8000)
    expect(muz.modifiers).toHaveLength(1)
    expect(muz.modifiers[0].name).toBe('Queso')
    expect(muz.modifiers[0].options[0]).toEqual({ name: 'Extra', price: 100 })
  })

  it('disabledGroupIds por nombre filtra el grupo heredado', async () => {
    await Menu.create({
      tenantId,
      locationId,
      categories: [
        {
          name: 'Pizzas',
          customizationGroups: [{ name: 'Queso', type: 'single', options: [{ name: 'Extra', extraPrice: 100 }] }],
          items: [
            { name: 'Muzzarella', price: 8000, disabledGroupIds: ['Queso'] },
            { name: 'Fugazzeta', price: 9000 },
          ],
        },
      ],
    })

    const { body } = await get(AUTH())
    const muz = body.products.find((p: { name: string }) => p.name === 'Muzzarella')
    const fug = body.products.find((p: { name: string }) => p.name === 'Fugazzeta')
    expect(muz.modifiers).toBeUndefined()
    expect(fug.modifiers.map((m: { name: string }) => m.name)).toEqual(['Queso'])
  })

  it('mitad y mitad: con 2 o más halfPrice inyecta los tres grupos sintéticos', async () => {
    await Menu.create({
      tenantId,
      locationId,
      categories: [
        {
          name: 'Pizzas',
          items: [
            { name: 'Muzzarella', price: 8000, halfPrice: 5000 },
            { name: 'Fugazzeta', price: 9000, halfPrice: 5500 },
            { name: 'Calzone', price: 7000 },
          ],
        },
      ],
    })

    const { body } = await get(AUTH())
    const muz = body.products.find((p: { name: string }) => p.name === 'Muzzarella')
    const cal = body.products.find((p: { name: string }) => p.name === 'Calzone')

    expect(muz.halfPrice).toBe(5000)
    expect(muz.modifiers.map((m: { name: string }) => m.name)).toEqual([
      '__half_type',
      '__half_first',
      '__half_second',
    ])
    expect(muz.modifiers[1].options).toEqual([
      { name: 'Muzzarella', price: 5000 },
      { name: 'Fugazzeta', price: 5500 },
    ])

    // Sin halfPrice no recibe nada sintético.
    expect(cal.halfPrice).toBeUndefined()
    expect(cal.modifiers).toBeUndefined()
  })

  it('con un solo halfPrice en la categoría no inyecta mitad y mitad', async () => {
    await Menu.create({
      tenantId,
      locationId,
      categories: [
        {
          name: 'Pizzas',
          items: [
            { name: 'Muzzarella', price: 8000, halfPrice: 5000 },
            { name: 'Calzone', price: 7000 },
          ],
        },
      ],
    })

    const { body } = await get(AUTH())
    const muz = body.products.find((p: { name: string }) => p.name === 'Muzzarella')
    expect(muz.modifiers).toBeUndefined()
  })

  it('ignora menús inactivos y solo sirve la sede declarada', async () => {
    // `menus` tiene índice único por {tenantId, locationId}: cada sede tiene
    // UN solo documento, así que el menú inactivo va en una tercera sede.
    const inactiveLocation = await Location.create({
      tenantId,
      name: 'Local Cerrado',
      slug: 'cerrado',
      address: 'y',
      isActive: true,
    })
    await Menu.create({
      tenantId,
      locationId: inactiveLocation._id.toString(),
      isActive: false,
      categories: [{ name: 'Oculta', items: [{ name: 'Nada', price: 1 }] }],
    })
    await Menu.create({
      tenantId,
      locationId: otherLocationId,
      categories: [{ name: 'OtraSede', items: [{ name: 'Ajeno', price: 2 }] }],
    })
    await Menu.create({
      tenantId,
      locationId,
      categories: [{ name: 'Activa', items: [{ name: 'Visible', price: 3 }] }],
    })

    const { body } = await get(AUTH())
    expect(body.products.map((p: { name: string }) => p.name)).toEqual(['Visible'])
    expect(body.categories.map((c: { name: string }) => c.name)).toEqual(['Activa'])
  })
})

describe('GET /pos/menu — signature', () => {
  it('es estable entre dos lecturas y cambia cuando el menú cambia', async () => {
    await Menu.create({
      tenantId,
      locationId,
      categories: [{ name: 'Pizzas', items: [{ name: 'Muzzarella', price: 8000 }] }],
    })

    const first = await get(AUTH())
    const second = await get(AUTH())
    expect(first.body.signature).toBe(second.body.signature)
    expect(first.body.products).toEqual(second.body.products)

    await Menu.updateOne(
      { tenantId },
      { $set: { 'categories.0.items.0.price': 9500 } }
    )

    const third = await get(AUTH())
    expect(third.body.signature).not.toBe(first.body.signature)
    expect(third.body.products.find((p: { name: string }) => p.name === 'Muzzarella').price).toBe(9500)
  })

  it('version es un entero en segundos desde la última edición', async () => {
    const created = await Menu.create({
      tenantId,
      locationId,
      categories: [{ name: 'Pizzas', items: [{ name: 'Muzzarella', price: 8000 }] }],
    })
    const stored = await Menu.findById(created._id).lean<{ updatedAt: Date }>()
    const { body } = await get(AUTH())
    expect(body.version).toBe(Math.floor(new Date(stored!.updatedAt).getTime() / 1000))
    expect(body.version).toBeGreaterThan(0)
  })
})
