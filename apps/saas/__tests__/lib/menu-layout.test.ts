import { describe, it, expect } from 'vitest'
import { resolveCategoryLayout, resolveSubcategoryLayout, findAnchorCategoryId, itemInitial } from '@/lib/menu-layout'

describe('resolveCategoryLayout', () => {
  it('sin formato propio usa el layout general', () => {
    expect(resolveCategoryLayout({}, 'takeaway', true)).toBe('grid')
    expect(resolveCategoryLayout({ displayLayout: 'inherit' }, 'dine-in', false)).toBe('list')
  })

  it('el formato de la categoría pisa al general en ambos menús', () => {
    expect(resolveCategoryLayout({ displayLayout: 'carousel' }, 'takeaway', true)).toBe('carousel')
    expect(resolveCategoryLayout({ displayLayout: 'grid', displayLayoutApplyTo: 'both' }, 'dine-in', false)).toBe('grid')
  })

  it('respeta en qué menú aplica', () => {
    const cat = { displayLayout: 'carousel', displayLayoutApplyTo: 'takeaway' }
    expect(resolveCategoryLayout(cat, 'takeaway', false)).toBe('carousel')
    expect(resolveCategoryLayout(cat, 'dine-in', false)).toBe('list')
    const salon = { displayLayout: 'list', displayLayoutApplyTo: 'dine-in' }
    expect(resolveCategoryLayout(salon, 'takeaway', true)).toBe('grid')
    expect(resolveCategoryLayout(salon, 'dine-in', true)).toBe('list')
  })

  it('ignora valores desconocidos', () => {
    expect(resolveCategoryLayout({ displayLayout: 'mosaico' }, 'takeaway', true)).toBe('grid')
  })
})

describe('findAnchorCategoryId', () => {
  const cats = [
    { _id: 'a', combosAfter: false },
    { _id: 'b', combosAfter: true },
    { _id: 'c' },
  ]
  it('devuelve la categoría marcada', () => {
    expect(findAnchorCategoryId(cats, c => c.combosAfter)).toBe('b')
  })
  it('sin marca (o con la marcada oculta) devuelve null', () => {
    expect(findAnchorCategoryId(cats.filter(c => c._id !== 'b'), c => c.combosAfter)).toBeNull()
  })
})

describe('itemInitial', () => {
  it('toma la primera letra o número', () => {
    expect(itemInitial('empanada de carne')).toBe('E')
    expect(itemInitial('  ¡Ñoquis!')).toBe('Ñ')
    expect(itemInitial('7 quesos')).toBe('7')
    expect(itemInitial('')).toBe('·')
  })
})

describe('resolveSubcategoryLayout', () => {
  it('sin formato propio hereda el ya resuelto de su categoría', () => {
    expect(resolveSubcategoryLayout({}, 'takeaway', 'carousel')).toBe('carousel')
    expect(resolveSubcategoryLayout({ displayLayout: 'inherit' }, 'dine-in', 'grid')).toBe('grid')
  })

  it('su formato pisa al de la categoría', () => {
    expect(resolveSubcategoryLayout({ displayLayout: 'list' }, 'takeaway', 'carousel')).toBe('list')
  })

  it('en el menú donde no aplica usa el de la categoría', () => {
    const sub = { displayLayout: 'carousel', displayLayoutApplyTo: 'takeaway' }
    expect(resolveSubcategoryLayout(sub, 'takeaway', 'grid')).toBe('carousel')
    expect(resolveSubcategoryLayout(sub, 'dine-in', 'grid')).toBe('grid')
  })
})
