import { describe, it, expect } from 'vitest'
import { isLargeGroup, isOptionSoldOut, markSoldOutGroups, soldOutKeysFor } from '@/lib/menu/sold-out-options'
import { groupBySection, sectionChoices, suggestSection } from '@/lib/menu/option-sections'
import { sanitizeMenuForPublic } from '@/lib/menu-sanitize'

describe('agotados', () => {
  it('une la lista de la categoría y la del ítem sin repetir', () => {
    expect(soldOutKeysFor(['a', 'b'], ['b', 'c'], undefined)).toEqual(['a', 'b', 'c'])
  })

  it('reconoce por id y por nombre viejo', () => {
    expect(isOptionSoldOut({ _id: 'x1', name: 'Pistacho' }, ['x1'])).toBe(true)
    expect(isOptionSoldOut({ _id: 'x1', name: 'Pistacho' }, ['Pistacho'])).toBe(true)
    expect(isOptionSoldOut({ _id: 'x1', name: 'Pistacho' }, ['x2'])).toBe(false)
  })

  it('marca soldOut también en subgrupos y no borra opciones', () => {
    const groups = [{ name: 'Sabores', options: [{ _id: 'a', name: 'Chocolate' }, { _id: 'b', name: 'Vainilla', subGroups: [{ options: [{ _id: 'c', name: 'Baño' }] }] }] }]
    const out = markSoldOutGroups(groups, ['a', 'c'])
    expect(out[0].options).toHaveLength(2)
    expect(out[0].options![0].soldOut).toBe(true)
    expect(out[0].options![1].soldOut).toBeUndefined()
    expect(out[0].options![1].subGroups![0].options![0].soldOut).toBe(true)
    expect((groups[0].options[0] as any).soldOut).toBeUndefined() // no muta el original
  })

  it('grupo grande = más de 12 opciones', () => {
    expect(isLargeGroup({ options: Array(12).fill(0) })).toBe(false)
    expect(isLargeGroup({ options: Array(13).fill(0) })).toBe(true)
  })

  it('el menú público marca agotados de categoría e ítem (y deja los ocultos afuera)', () => {
    const menu = {
      categories: [{
        name: 'Helados',
        soldOutOptionIds: ['s1'],
        disabledOptionIds: ['Oculto'],
        customizationGroups: [{ name: 'Sabores', options: [{ _id: 's1', name: 'Pistacho' }, { _id: 's2', name: 'Chocolate' }, { _id: 's3', name: 'Oculto' }] }],
        items: [{ name: '¼ kg', soldOutOptionIds: ['e1'], customizationGroups: [{ name: 'Extras', options: [{ _id: 'e1', name: 'Rocklets' }] }] }],
      }],
    }
    const out = sanitizeMenuForPublic(menu)
    const cg = out.categories[0].customizationGroups[0].options
    expect(cg.map((o: any) => o.name)).toEqual(['Pistacho', 'Chocolate'])
    expect(cg[0].soldOut).toBe(true)
    expect(cg[1].soldOut).toBeUndefined()
    expect(out.categories[0].items[0].customizationGroups[0].options[0].soldOut).toBe(true)
  })
})

describe('familias', () => {
  it('sugiere por palabras clave', () => {
    expect(suggestSection('Chocolate con Almendras')).toBe('Chocolates')
    expect(suggestSection('Dulce de Leche Granizado')).toBe('Dulce de leche')
    expect(suggestSection('Limón Siciliano')).toBe('Frutales')
    expect(suggestSection('Sambayón')).toBe('Cremas')
    expect(suggestSection('Pistacho')).toBeNull()
  })

  it('lista híbrida: sugeridas + las propias, sin repetir', () => {
    const out = sectionChoices(['Cremas', 'De autor', ' de autor '])
    expect(out).toContain('De autor')
    expect(out.filter(s => s.toLowerCase() === 'cremas')).toHaveLength(1)
    expect(out.filter(s => s.toLowerCase() === 'de autor')).toHaveLength(1)
  })

  it('agrupa respetando el orden y deja «Otros» al final', () => {
    const out = groupBySection([{ n: 1, section: 'B' }, { n: 2 }, { n: 3, section: 'A' }, { n: 4, section: 'B' }])
    expect(out.map(([k, l]) => [k, l.length])).toEqual([['B', 2], ['A', 1], ['Otros', 1]])
  })
})
