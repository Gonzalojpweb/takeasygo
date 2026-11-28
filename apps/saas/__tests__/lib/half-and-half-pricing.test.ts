import { describe, it, expect } from 'vitest'
import {
  calculateHalfHalfPrice,
  flattenMenu,
  halfHalfTotal,
  halfShare,
  normalizeHalfPricing,
  resolveHalfPriceCustomizations,
} from '@takeasygo/business'

// Muzzarella Grande $10.000 (media cargada $5.500) · Especial Grande $14.000 (sin media).
const muzza = { name: 'Muzzarella', price: 1_000_000, halfPrice: 550_000, variants: [{ name: 'Chica', price: 700_000 }, { name: 'Grande', price: 1_000_000 }] }
const especial = { name: 'Especial', price: 1_400_000, variants: [{ name: 'Chica', price: 900_000 }, { name: 'Grande', price: 1_400_000 }] }
const halves = [
  { groupName: 'Primera mitad', selectedOptions: [{ name: 'Muzzarella' }] },
  { groupName: 'Segunda mitad', selectedOptions: [{ name: 'Especial' }] },
]

describe('mitad y mitad: regla de cada comercio', () => {
  it('la más cara (default, lo de siempre)', () => {
    expect(calculateHalfHalfPrice(muzza, especial)).toBe(1_400_000)
    expect(calculateHalfHalfPrice(muzza, especial, 'max')).toBe(1_400_000)
  })

  it('promedio: mitad de cada Grande (ignora el precio de media)', () => {
    expect(calculateHalfHalfPrice(muzza, especial, 'average')).toBe(500_000 + 700_000)
  })

  it('suma de medias: precio de media cargado, o la mitad de la Grande si no hay', () => {
    expect(calculateHalfHalfPrice(muzza, especial, 'half_sum')).toBe(550_000 + 700_000)
  })

  it('halfShare / halfHalfTotal son los ladrillos compartidos con el POS', () => {
    expect(halfShare(1_000_000, 550_000, 'max')).toBe(1_000_000)
    expect(halfShare(1_000_000, 550_000, 'average')).toBe(500_000)
    expect(halfShare(1_000_000, 550_000, 'half_sum')).toBe(550_000)
    expect(halfShare(1_000_000, null, 'half_sum')).toBe(500_000)
    expect(halfHalfTotal(1_000_000, 1_400_000, 'max')).toBe(1_400_000)
    expect(halfHalfTotal(500_000, 700_000, 'average')).toBe(1_200_000)
  })

  it('un valor desconocido o vacío es «la más cara»', () => {
    expect(normalizeHalfPricing(undefined)).toBe('max')
    expect(normalizeHalfPricing('cualquiera')).toBe('max')
    expect(normalizeHalfPricing('half_sum')).toBe('half_sum')
  })

  it('checkout online: cobra según la regla y guarda lo que aporta cada mitad', () => {
    const items = [muzza, especial]
    expect(resolveHalfPriceCustomizations(halves, items)!.extraPrice).toBe(1_400_000)
    const avg = resolveHalfPriceCustomizations(halves, items, 'average')!
    expect(avg.extraPrice).toBe(1_200_000)
    expect(avg.resolved.map(g => g.selectedOptions[0].extraPrice)).toEqual([500_000, 700_000])
    expect(resolveHalfPriceCustomizations(halves, items, 'half_sum')!.extraPrice).toBe(1_250_000)
  })

  it('POS: la carta aplanada arma los sabores con la regla del comercio', () => {
    const menu = {
      tenantId: 't',
      categories: [{ _id: 'c', name: 'Pizzas', items: [{ _id: 'm', ...muzza }, { _id: 'e', ...especial }, { _id: 'f', name: 'Fainá', price: 300_000 }] }],
    }
    const flavorsWith = (halfPricing?: string) => {
      const p = flattenMenu(menu as never, { halfPricing }).products.find(x => x.id === 'm')!
      return { rule: p.halfPricing, options: p.modifiers!.find(g => g.name === '__half_first')!.options.map(o => [o.name, o.price]) }
    }
    expect(flavorsWith()).toEqual({ rule: 'max', options: [['Muzzarella', 1_000_000], ['Especial', 1_400_000]] })
    expect(flavorsWith('average')).toEqual({ rule: 'average', options: [['Muzzarella', 500_000], ['Especial', 700_000]] })
    expect(flavorsWith('half_sum')).toEqual({ rule: 'half_sum', options: [['Muzzarella', 550_000], ['Especial', 700_000]] })
    // La fainá no tiene Grande: no entra a la mitad y mitad.
    const faina = flattenMenu(menu as never).products.find(x => x.id === 'f')!
    expect(faina.modifiers?.some(g => g.name === '__half_first')).toBeFalsy()
  })
})
