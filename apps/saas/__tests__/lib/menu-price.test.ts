import { describe, expect, it } from 'vitest'
import { channelPrice, salonPrice, flattenMenu } from '@takeasygo/business'
import { listUnitPrice } from '@/lib/commission-base'

/** 23/11/2026: plato cargado solo con «Para llevar» → el salón no puede quedar en $0. */
describe('precio por canal', () => {
  it('salón en 0 con precio para llevar → vale el de para llevar', () => {
    expect(salonPrice({ price: 0, takeawayPrice: 950_000 })).toBe(950_000)
    expect(salonPrice({ price: 800_000, takeawayPrice: 950_000 })).toBe(800_000)
    expect(channelPrice({ price: 0, takeawayPrice: 950_000 }, 'dine-in')).toBe(950_000)
    expect(channelPrice({ price: 0, takeawayPrice: 950_000 }, 'business')).toBe(950_000)
    expect(channelPrice({ price: 800_000 }, 'takeaway')).toBe(800_000)
    expect(channelPrice({ price: 800_000, takeawayPrice: 0 }, 'delivery')).toBe(800_000)
  })

  it('el POS no vende a $0 un plato (ni una variante) cargado solo para llevar', () => {
    const { products } = flattenMenu({
      tenantId: 't',
      categories: [{ _id: 'c', name: 'Arepas', items: [
        { _id: 'a', name: 'Sola', price: 0, takeawayPrice: 950_000 },
        { _id: 'b', name: 'Con variantes', price: 0, variants: [{ name: 'Chica', price: 0, takeawayPrice: 600_000 }, { name: 'Grande', price: 0, takeawayPrice: 900_000 }] },
      ] }],
    } as never)
    expect(products.find((p) => p.id === 'a')!.price).toBe(950_000)
    const b = products.find((p) => p.id === 'b')!
    expect(b.price).toBe(600_000)
    expect(b.modifiers![0].options.map((o) => o.price)).toEqual([0, 300_000])
  })

  it('comisión: el precio de carta de salón tampoco queda en 0', () => {
    expect(listUnitPrice({ price: 0, originalPrice: 0, takeawayPrice: 950_000 }, 'dine-in')).toBe(950_000)
  })
})
