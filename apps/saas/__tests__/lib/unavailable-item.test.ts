import { describe, it, expect } from 'vitest'
import { menuItemNamesOf, unavailableItemMessage } from '@/lib/orders/unavailable-item'

describe('aviso de producto que ya no está', () => {
  it('usa el nombre de la carta, nunca el id', () => {
    expect(unavailableItemMessage('Milanesa napolitana', 'otro')).toBe('«Milanesa napolitana» ya no está disponible. Sacalo del carrito para continuar.')
  })
  it('si el plato se borró, usa el nombre del carrito', () => {
    expect(unavailableItemMessage(undefined, 'Chowfan')).toContain('«Chowfan»')
  })
  it('un id hexadecimal nunca se muestra; sin nombre queda un texto genérico', () => {
    const msg = unavailableItemMessage(undefined, '65f1a2b3c4d5e6f708192a3b')
    expect(msg).toBe('Uno de los productos del carrito ya no está disponible. Sacalo para continuar.')
    expect(msg).not.toMatch(/[a-f\d]{24}/i)
  })
  it('promociones', () => {
    expect(unavailableItemMessage(null, '2x1 en pizzas', 'promotion')).toContain('La promoción «2x1 en pizzas»')
  })
  it('nombres de toda la carta, también subcategorías y platos pausados', () => {
    const names = menuItemNamesOf({ categories: [{ items: [{ _id: 'a', name: 'Coca' }], subcategories: [{ items: [{ _id: 'b', name: 'Flan' }] }] }] })
    expect([names.get('a'), names.get('b')]).toEqual(['Coca', 'Flan'])
  })
})
