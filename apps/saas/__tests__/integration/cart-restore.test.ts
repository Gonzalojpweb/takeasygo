import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Order from '@/models/Order'
import { rateLimit } from '@/lib/rateLimit'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/crypto', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/crypto')>()
  return {
    ...orig,
    safeDecrypt: vi.fn((t: string) => (typeof t === 'string' ? t.replace(/^enc:/, '') : '')),
    decrypt: vi.fn(() => 'APP_USR-test-token'),
  }
})

import { GET as cartRestore } from '@/app/api/[tenant]/orders/[orderId]/cart-restore/route'
import { orderItemsToCartItems, buildCustomizationSummary } from '@/lib/cart-from-order'

/**
 * Re-armado del carrito desde un pedido cancelado.
 *
 * Lo que se prueba acá es lo que NO se puede ver en la UI: que la customización
 * y la variante que el cliente eligió hace una hora sigan ahí cuando vuelve al
 * checkout. Si esto se pierde, el cliente rehace el pedido a mano y le sale
 * distinto — o directamente no puede reproducirlo.
 */

const SLUG = 'test-tenant'
const TRACKING_TOKEN = 'tok-cart-restore-777'

let tenant: any
let location: any

function params(orderId?: string) {
  return { params: Promise.resolve({ tenant: SLUG, ...(orderId ? { orderId } : {}) }) }
}

function req(orderId: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost/api/${SLUG}/orders/${orderId}/cart-restore`, {
    headers,
  }) as any
}

/** Item del menú con UNA customización de una opción. */
function plainItem(menuItemId: string, name = 'Cachapa') {
  return {
    menuItemId,
    itemType: 'menuItem' as const,
    name,
    basePrice: 3000,
    extraPrice: 0,
    price: 3000,
    quantity: 1,
    subtotal: 3000,
    customizations: [],
  }
}

/** Item con customización anidada y variante: el caso que hay que preservar. */
function customizedItem(menuItemId: string, variantName: string) {
  return {
    menuItemId,
    itemType: 'menuItem' as const,
    name: 'Empanada',
    basePrice: 4000,
    extraPrice: 1500,
    // price = basePrice + extraPrice: el extra de la customización ya está cocido
    price: 5500,
    quantity: 2,
    subtotal: 11000,
    customizations: [
      {
        groupName: 'Relleno',
        selectedOptions: [
          {
            name: 'Carne cortada a cuchillo',
            extraPrice: 1500,
            subGroups: [
              {
                groupName: 'Cocción',
                selectedOptions: [{ name: 'A punto', extraPrice: 0 }],
              },
            ],
          },
        ],
      },
    ],
    selectedVariant: { name: variantName, price: 500 },
  }
}

async function makeOrder(overrides: Record<string, any> = {}) {
  return Order.create({
    tenantId: tenant._id,
    locationId: location._id,
    orderNumber: `CR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    status: 'cancelled',
    orderMode: 'takeaway',
    items: [plainItem('64b000000000000000000001')],
    subtotal: 3000,
    total: 3000,
    customer: { name: 'Juan Pérez', phone: '+5491100000000', email: 'juan@test.com' },
    notes: 'Sin sal',
    trackingToken: TRACKING_TOKEN,
    ...overrides,
  })
}

// El setup global limpia las colecciones entre tests; acá sólo se crean los
// fixtures de cada uno.
beforeEach(async () => {
  vi.mocked(rateLimit).mockResolvedValue({ success: true, remaining: 10 } as any)
  tenant = await Tenant.create({
    name: 'Tenant de prueba',
    slug: SLUG,
    plan: 'full',
    status: 'active',
    isActive: true,
  })
  location = await Location.create({
    tenantId: tenant._id,
    name: 'Sede Centro',
    slug: 'centro',
    address: 'Av. Siempreviva 742',
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   EL MAPPER — la parte pura
   ══════════════════════════════════════════════════════════════════════════ */
describe('orderItemsToCartItems — la variante y la customización sobreviven', () => {
  it('conserva la variante elegida', () => {
    const out = orderItemsToCartItems([customizedItem('64b000000000000000000002', 'Grande')])
    expect(out).toHaveLength(1)
    expect(out[0].selectedVariant).toEqual({ name: 'Grande', price: 500 })
  })

  it('conserva la customización con su precio extra', () => {
    const out = orderItemsToCartItems([customizedItem('64b000000000000000000002', 'Grande')])
    expect(out[0].extraPrice).toBe(1500)
    expect(out[0].customizations).toHaveLength(1)
    expect(out[0].customizations[0].groupName).toBe('Relleno')
    expect(out[0].customizations[0].selectedOptions[0].name).toBe('Carne cortada a cuchillo')
  })

  it('el precio por unidad ya incluye el extra: no se recalcula', () => {
    const out = orderItemsToCartItems([customizedItem('64b000000000000000000002', 'Grande')])
    // price = 5500 (base 4000 + extra 1500), NO 4000, NO 7000.
    expect(out[0].price).toBe(5500)
    expect(out[0].quantity).toBe(2)
    expect(out[0].basePrice).toBe(4000)
  })

  it('arma el resumen de texto con los sub-grupos anidados', () => {
    const out = orderItemsToCartItems([customizedItem('64b000000000000000000002', 'Grande')])
    expect(out[0].customizationSummary).toBe(
      'Relleno: Carne cortada a cuchillo (Cocción: A punto)'
    )
  })

  it('sin customizaciones, el resumen queda vacío', () => {
    const out = orderItemsToCartItems([plainItem('64b000000000000000000001')])
    expect(out[0].customizationSummary).toBe('')
    expect(out[0].customizations).toEqual([])
  })

  it('dos líneas del mismo item NO se pisan entre sí', () => {
    const a = customizedItem('64b000000000000000000002', 'Grande')
    const b = customizedItem('64b000000000000000000002', 'Mediana')
    const out = orderItemsToCartItems([a, b])
    expect(out).toHaveLength(2)
    expect(out[0].cartItemId).not.toBe(out[1].cartItemId)
    expect(out[0].selectedVariant!.name).toBe('Grande')
    expect(out[1].selectedVariant!.name).toBe('Mediana')
  })

  it('las promociones se marcan como promoción, no como item del menú', () => {
    const out = orderItemsToCartItems([
      {
        itemType: 'promotion',
        promotionId: 'promo-abc',
        promotionTitle: '2x1 en empanadas',
        name: 'Empanada',
        basePrice: 0,
        extraPrice: 0,
        price: 2000,
        quantity: 2,
        subtotal: 2000,
        customizations: [],
      },
    ])
    expect(out[0].type).toBe('promotion')
    expect(out[0].promotionId).toBe('promo-abc')
    expect(out[0]._promotionTitle).toBe('2x1 en empanadas')
  })

  it('los premios ocultos NO vuelven al carrito: no son productos del menú', () => {
    const out = orderItemsToCartItems([
      { ...plainItem('64b000000000000000000001'), itemType: 'reward' },
      plainItem('64b000000000000000000002'),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].menuItemId).toBe('64b000000000000000000002')
  })

  it('un pedido vacío devuelve un carrito vacío (la UI avisa, no crashea)', () => {
    expect(orderItemsToCartItems([])).toEqual([])
    expect(orderItemsToCartItems(undefined as any)).toEqual([])
  })

  it('buildCustomizationSummary no explota con un sub-grupo vacío', () => {
    expect(
      buildCustomizationSummary([
        { groupName: 'Relleno', selectedOptions: [{ name: 'Queso', subGroups: [] }] },
      ])
    ).toBe('Relleno: Queso')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   EL ENDPOINT — es público, así que las guardas son lo importante
   ══════════════════════════════════════════════════════════════════════════ */
describe('cart-restore — guardas', () => {
  it('sin tracking-token responde 401', async () => {
    const order = await makeOrder()
    const res = await cartRestore(req(order._id.toString()), params(order._id.toString()))
    expect(res.status).toBe(401)
  })

  it('con tracking-token incorrecto responde 403', async () => {
    const order = await makeOrder()
    const res = await cartRestore(
      req(order._id.toString(), { 'x-tracking-token': 'inventado' }),
      params(order._id.toString())
    )
    expect(res.status).toBe(403)
  })

  it('no sirve un pedido de otro tenant (404)', async () => {
    const order = await makeOrder()
    const res = await cartRestore(
      req(order._id.toString(), { 'x-tracking-token': TRACKING_TOKEN }),
      { params: Promise.resolve({ tenant: 'otro-tenant', orderId: order._id.toString() }) }
    )
    expect(res.status).toBe(404)
  })

  it('NO rearma un pedido que ya se cobró: lo devolvería a duplicar', async () => {
    const order = await makeOrder({ status: 'confirmed' })
    const res = await cartRestore(
      req(order._id.toString(), { 'x-tracking-token': TRACKING_TOKEN }),
      params(order._id.toString())
    )
    expect(res.status).toBe(400)
  })

  it('un pedido cancelado SÍ se rearma: es el flujo del botón "Cancelar pedido"', async () => {
    // Cancelar limpia el carrito del cliente; este endpoint es lo que evita que
    // tenga que armarlo de nuevo a mano y perder una customización.
    const order = await makeOrder({ status: 'cancelled' })
    const res = await cartRestore(
      req(order._id.toString(), { 'x-tracking-token': TRACKING_TOKEN }),
      params(order._id.toString())
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.empty).toBe(false)
    expect(body.cartItems.length).toBeGreaterThan(0)
  })

  it('un pedido todavía.awaiting_payment también se rearma (el panel offering retry)', async () => {
    const order = await makeOrder({ status: 'awaiting_payment' })
    const res = await cartRestore(
      req(order._id.toString(), { 'x-tracking-token': TRACKING_TOKEN }),
      params(order._id.toString())
    )
    expect(res.status).toBe(200)
    expect((await res.json()).empty).toBe(false)
  })

  it('rate limit: corta antes de tocar la base', async () => {
    vi.mocked(rateLimit).mockResolvedValue({ success: false, remaining: 0 } as any)
    const res = await cartRestore(
      req('64b0000000000000000000ff', { 'x-tracking-token': TRACKING_TOKEN }),
      params('64b0000000000000000000ff')
    )
    expect(res.status).toBe(429)
  })
})

describe('cart-restore — contenido', () => {
  it('devuelve los items con variante y customización, y los datos del cliente', async () => {
    const order = await makeOrder({
      status: 'awaiting_payment',
      items: [customizedItem('64b000000000000000000002', 'Grande')],
    })
    const res = await cartRestore(
      req(order._id.toString(), { 'x-tracking-token': TRACKING_TOKEN }),
      params(order._id.toString())
    )
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.empty).toBe(false)
    expect(body.orderNumber).toBe(order.orderNumber)
    expect(body.locationId).toBe(location._id.toString())
    expect(body.customer.name).toBe('Juan Pérez')
    expect(body.notes).toBe('Sin sal')

    expect(body.cartItems).toHaveLength(1)
    expect(body.cartItems[0].selectedVariant).toEqual({ name: 'Grande', price: 500 })
    expect(body.cartItems[0].price).toBe(5500)
    expect(body.cartItems[0].quantity).toBe(2)
    expect(body.cartItems[0].customizationSummary).toBe(
      'Relleno: Carne cortada a cuchillo (Cocción: A punto)'
    )
  })

  it('marca empty cuando el pedido sólo tenía premios ocultos', async () => {
    const order = await makeOrder({
      items: [{ ...plainItem('64b000000000000000000001'), itemType: 'reward' }],
    })
    const res = await cartRestore(
      req(order._id.toString(), { 'x-tracking-token': TRACKING_TOKEN }),
      params(order._id.toString())
    )
    const body = await res.json()
    expect(body.empty).toBe(true)
    expect(body.cartItems).toEqual([])
  })

  it('no filtra el token: la respuesta no lo devuelve', async () => {
    const order = await makeOrder()
    const res = await cartRestore(
      req(order._id.toString(), { 'x-tracking-token': TRACKING_TOKEN }),
      params(order._id.toString())
    )
    expect(JSON.stringify(await res.json())).not.toContain(TRACKING_TOKEN)
  })
})