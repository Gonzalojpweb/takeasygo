import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CART_KEY,
  FORM_KEY,
  STEP_KEY,
  checkoutPathFor,
  prepareCheckoutRestore,
} from '@/lib/cart-restore-client'

/**
 * Estos tests cubren el contrato de escritura en `sessionStorage`, que es la
 * única forma que tiene el `CheckoutContext` de saber a qué paso volver. El
 * formato de la clave de paso importa: se compara contra texto plano, así que un
 * `JSON.stringify` de más dejaba al cliente en el carrito en vez de en "Pago".
 */

class MemoryStorage {
  private store = new Map<string, string>()

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }
}

const basePayload = {
  orderNumber: 'E2E-R-1',
  orderMode: 'takeaway',
  locationId: 'loc-1',
  cartItems: [
    { cartItemId: 'i-1', menuItemId: 'm-1', name: 'Empanada', quantity: 2, price: 5500, subtotal: 11000 },
  ],
  customer: { name: 'Cliente E2E', phone: '+5491100000000', email: 'cliente@e2e.test' },
  notes: 'sin cebolla',
  empty: false,
}

function mockRestoreOk(payload: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => payload }))
  )
}

const SLUG = 'e2e-mp-test'

describe('checkoutPathFor', () => {
  it('mapea cada modo de pedido a su checkout', () => {
    expect(checkoutPathFor('takeaway')).toBe('takeaway/checkout')
    expect(checkoutPathFor('delivery')).toBe('delivery/checkout')
    expect(checkoutPathFor('business')).toBe('business/checkout')
  })

  it('resuelve dine-in por takeaway (no hay checkout propio)', () => {
    expect(checkoutPathFor('dine-in')).toBe('takeaway/checkout')
  })
})

describe('prepareCheckoutRestore', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.stubGlobal('sessionStorage', new MemoryStorage())
  })

  it('deja el carrito, el formulario y el paso "pay" listos para el checkout', async () => {
    mockRestoreOk(basePayload)

    const result = await prepareCheckoutRestore({
      tenantSlug: SLUG,
      orderId: 'ord-1',
      trackingToken: 'tok-1',
    })

    expect(result).not.toBeNull()
    const storage = globalThis.sessionStorage as unknown as MemoryStorage

    expect(JSON.parse(storage.getItem(CART_KEY(SLUG)) as string)).toHaveLength(1)
    expect(JSON.parse(storage.getItem(FORM_KEY(SLUG)) as string)).toEqual({
      name: 'Cliente E2E',
      phone: '+5491100000000',
      email: 'cliente@e2e.test',
      notes: 'sin cebolla',
    })
    // Texto plano: es lo que el CheckoutContext compara con `=== 'pay'`.
    expect(storage.getItem(STEP_KEY(SLUG))).toBe('pay')
  })

  it('manda el token como header y no como query param', async () => {
    mockRestoreOk(basePayload)
    const spy = globalThis.fetch as unknown as ReturnType<typeof vi.fn>

    await prepareCheckoutRestore({ tenantSlug: SLUG, orderId: 'ord-1', trackingToken: 'tok-1' })

    expect(spy).toHaveBeenCalledWith('/api/e2e-mp-test/orders/ord-1/cart-restore', {
      headers: { 'x-tracking-token': 'tok-1' },
    })
  })

  it('abre el checkout con ?step=pay cuando el pago se puede reanudar', async () => {
    mockRestoreOk(basePayload)

    const result = await prepareCheckoutRestore({
      tenantSlug: SLUG,
      orderId: 'ord-1',
      trackingToken: 'tok-1',
    })

    expect(result?.url).toBe('/e2e-mp-test/menu/loc-1/takeaway/checkout?step=pay')
  })

  it('delivery restaura el carrito pero NO salta al paso de pago', async () => {
    mockRestoreOk({ ...basePayload, orderMode: 'delivery' })

    const result = await prepareCheckoutRestore({
      tenantSlug: SLUG,
      orderId: 'ord-1',
      trackingToken: 'tok-1',
    })

    const storage = globalThis.sessionStorage as unknown as MemoryStorage
    expect(result?.url).toBe('/e2e-mp-test/menu/loc-1/delivery/checkout')
    expect(storage.getItem(STEP_KEY(SLUG))).toBe('cart')
    // Los ítems con customización sí se recuperan: es lo caro de perder.
    expect(JSON.parse(storage.getItem(CART_KEY(SLUG)) as string)).toHaveLength(1)
  })

  it('sin nombre de cliente no avanza al paso de pago', async () => {
    mockRestoreOk({ ...basePayload, customer: { name: '', phone: '', email: '' } })

    const result = await prepareCheckoutRestore({
      tenantSlug: SLUG,
      orderId: 'ord-1',
      trackingToken: 'tok-1',
    })

    const storage = globalThis.sessionStorage as unknown as MemoryStorage
    expect(result?.url).toBe('/e2e-mp-test/menu/loc-1/takeaway/checkout')
    expect(storage.getItem(STEP_KEY(SLUG))).toBe('cart')
  })

  it('no escribe nada si el pedido vino sin items', async () => {
    mockRestoreOk({ ...basePayload, cartItems: [], empty: true })

    const result = await prepareCheckoutRestore({
      tenantSlug: SLUG,
      orderId: 'ord-1',
      trackingToken: 'tok-1',
    })

    const storage = globalThis.sessionStorage as unknown as MemoryStorage
    expect(result).toBeNull()
    expect(storage.getItem(CART_KEY(SLUG))).toBeNull()
    expect(storage.getItem(STEP_KEY(SLUG))).toBeNull()
  })

  it('sin sede no arma una URL que no existe', async () => {
    mockRestoreOk({ ...basePayload, locationId: null })

    const result = await prepareCheckoutRestore({
      tenantSlug: SLUG,
      orderId: 'ord-1',
      trackingToken: 'tok-1',
    })

    expect(result).toBeNull()
  })

  it('sin tracking token no pega el endpoint', async () => {
    mockRestoreOk(basePayload)
    const spy = globalThis.fetch as unknown as ReturnType<typeof vi.fn>

    const result = await prepareCheckoutRestore({
      tenantSlug: SLUG,
      orderId: 'ord-1',
      trackingToken: null,
    })

    expect(result).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  it('propaga el error del server en vez de dejar el checkout a medias', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({ error: 'Pedido no encontrado' }) }))
    )

    await expect(
      prepareCheckoutRestore({ tenantSlug: SLUG, orderId: 'ord-1', trackingToken: 'tok-1' })
    ).rejects.toThrow('Pedido no encontrado')

    const storage = globalThis.sessionStorage as unknown as MemoryStorage
    expect(storage.getItem(CART_KEY(SLUG))).toBeNull()
  })
})