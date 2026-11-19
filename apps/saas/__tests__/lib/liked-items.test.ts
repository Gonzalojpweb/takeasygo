import { describe, it, expect } from 'vitest'
import {
  collectMenuEntries,
  formatLikes,
  pickLikedItems,
  resolveMinLikes,
  sanitizeLikedCarouselSettings,
  LIKED_DEFAULT_TITLE,
} from '@/lib/menu/liked-items'

const cat = { _id: 'c1', name: 'Platos' }
const entry = (id: string, likes: number) => ({ item: { _id: id, name: id, likesCount: likes }, category: cat })

describe('pickLikedItems', () => {
  it('no muestra la sección si menos de 3 platos llegan al mínimo', () => {
    expect(pickLikedItems([entry('a', 5), entry('b', 3), entry('c', 2)])).toEqual([])
  })

  it('con 1 like por plato (el caso real de hoy) no aparece', () => {
    expect(pickLikedItems([entry('a', 1), entry('b', 1), entry('c', 1), entry('d', 1), entry('e', 1)])).toEqual([])
  })

  it('aparece con 3 platos de 3 likes o más, ordenados por likes', () => {
    const out = pickLikedItems([entry('a', 3), entry('b', 9), entry('c', 4), entry('d', 1)])
    expect(out.map(e => e.item._id)).toEqual(['b', 'c', 'a'])
  })

  it('a igual cantidad de likes desempata el orden del menú', () => {
    const out = pickLikedItems([entry('x', 4), entry('y', 4), entry('z', 4)])
    expect(out.map(e => e.item._id)).toEqual(['x', 'y', 'z'])
  })

  it('respeta el mínimo configurado (con piso 2)', () => {
    const list = [entry('a', 2), entry('b', 2), entry('c', 2)]
    expect(pickLikedItems(list, { minLikes: 3 })).toEqual([])
    expect(pickLikedItems(list, { minLikes: 2 })).toHaveLength(3)
    expect(pickLikedItems(list, { minLikes: 1 })).toHaveLength(3) // 1 se sube al piso 2
  })

  it('nunca muestra más de 6 y rota por ventanas recorriendo todos', () => {
    const list = Array.from({ length: 10 }, (_, i) => entry(`p${i}`, 20 - i))
    const seen = new Set<string>()
    for (let rotation = 0; rotation < 5; rotation++) {
      const out = pickLikedItems(list, { rotation })
      expect(out).toHaveLength(6)
      expect(new Set(out.map(e => e.item._id)).size).toBe(6)
      out.forEach(e => seen.add(String(e.item._id)))
      // dentro de cada tanda, ordenados por likes
      const likes = out.map(e => e.item.likesCount)
      expect([...likes].sort((a, b) => b - a)).toEqual(likes)
    }
    expect(seen.size).toBe(10)
  })

  it('con 6 o menos que califican no rota', () => {
    const list = Array.from({ length: 6 }, (_, i) => entry(`p${i}`, 10 - i))
    expect(pickLikedItems(list, { rotation: 7 }).map(e => e.item._id)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5'])
  })

  it('no repite un plato', () => {
    const out = pickLikedItems([entry('a', 5), entry('a', 5), entry('b', 4), entry('c', 3)])
    expect(out.map(e => e.item._id)).toEqual(['a', 'b', 'c'])
  })
})

describe('collectMenuEntries', () => {
  it('recorre ítems y subcategorías y deja afuera los no visibles', () => {
    const categories = [{
      _id: 'c1',
      items: [{ _id: 'a', isAvailable: true }, { _id: 'b', isAvailable: false }],
      subcategories: [{ sortOrder: 1, items: [{ _id: 'd', isAvailable: true }] }, { sortOrder: 0, items: [{ _id: 'c', isAvailable: true }] }],
    }]
    const out = collectMenuEntries(categories, (i: any) => i.isAvailable)
    expect(out.map(e => e.item._id)).toEqual(['a', 'c', 'd'])
    expect(out[0].category).toBe(categories[0])
  })
})

describe('sanitizeLikedCarouselSettings', () => {
  it('normaliza título, posición, umbral y colores', () => {
    const out = sanitizeLikedCarouselSettings({
      showSection: true,
      sectionTitle: '   ',
      position: 'inventada',
      minLikes: 0,
      style: { accentColor: '#ff0000', textColor: 'red; background:url(x)' },
    })
    expect(out?.sectionTitle).toBe(LIKED_DEFAULT_TITLE)
    expect(out?.position).toBe('afterBestsellers')
    expect(out?.minLikes).toBe(2)
    expect(out?.style.accentColor).toBe('#ff0000')
    expect(out?.style.textColor).toBe('')
  })

  it('rechaza lo que no es objeto', () => {
    expect(sanitizeLikedCarouselSettings('x')).toBeNull()
    expect(sanitizeLikedCarouselSettings(null)).toBeNull()
  })
})

describe('helpers', () => {
  it('resolveMinLikes usa 3 por defecto', () => {
    expect(resolveMinLikes(undefined)).toBe(3)
    expect(resolveMinLikes('7')).toBe(7)
    expect(resolveMinLikes(500)).toBe(50)
  })

  it('formatLikes al estilo Instagram', () => {
    expect(formatLikes(12)).toBe('12')
    expect(formatLikes(1200)).toBe('1,2 mil')
    expect(formatLikes(1000)).toBe('1 mil')
    expect(formatLikes(15400)).toBe('15 mil')
  })
})
