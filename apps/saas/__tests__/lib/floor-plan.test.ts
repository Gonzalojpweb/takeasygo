import { describe, it, expect } from 'vitest'
import {
  FLOOR_WIDTH,
  FLOOR_HEIGHT,
  TABLE_SHAPES,
  autoLayout,
  clampLayout,
  tableSize,
  validateTableLayout,
} from '@takeasygo/business'
import { TABLE_SHAPE_VALUES } from '@/models/Table'

// 30/10 — plano del salón: reglas compartidas server/POS.

describe('floor-plan', () => {
  it('el modelo usa las mismas formas que business', () => {
    expect([...TABLE_SHAPE_VALUES]).toEqual([...TABLE_SHAPES])
  })

  it('valida, ajusta a la grilla y mantiene la mesa dentro del plano', () => {
    const r = validateTableLayout({ x: 994, y: 13, shape: 'round' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.layout).toEqual({ x: FLOOR_WIDTH - 90, y: 10, shape: 'round', rotation: 0 })
    expect(validateTableLayout({ x: 1, y: 1, shape: 'hexagon' }).ok).toBe(false)
    expect(validateTableLayout({ x: '1', y: 1, shape: 'round' }).ok).toBe(false)
    expect(validateTableLayout({ x: 1, y: 1, shape: 'rect', rotation: 45 }).ok).toBe(false)
  })

  it('girar una rectangular intercambia ancho y alto', () => {
    expect(tableSize('rect', 0)).toEqual({ w: 128, h: 88 })
    expect(tableSize('rect', 90)).toEqual({ w: 88, h: 128 })
    const l = clampLayout({ x: 0, y: FLOOR_HEIGHT, shape: 'rect', rotation: 90 })
    expect(l.y).toBe(FLOOR_HEIGHT - 128)
  })

  it('autoLayout respeta las guardadas y no superpone las nuevas', () => {
    const placed = autoLayout([
      { id: 'a', number: 1, capacity: 2, layout: { x: 60, y: 60, shape: 'round', rotation: 0 } },
      { id: 'b', number: 2, capacity: 4 },
      { id: 'c', number: 3, capacity: 6 },
    ])
    const a = placed.find((p) => p.id === 'a')!
    expect(a).toMatchObject({ auto: false, layout: { x: 60, y: 60 } })
    const others = placed.filter((p) => p.auto)
    expect(others.map((p) => p.layout.shape)).toEqual(['square', 'rect'])
    for (const p of placed) for (const q of placed) {
      if (p === q) continue
      const apart = p.layout.x + p.w <= q.layout.x || q.layout.x + q.w <= p.layout.x || p.layout.y + p.h <= q.layout.y || q.layout.y + q.h <= p.layout.y
      expect(apart).toBe(true)
    }
    // Determinista: mismo input, mismo plano (dos tablets ven lo mismo).
    expect(autoLayout([{ id: 'b', number: 2, capacity: 4 }])).toEqual(autoLayout([{ id: 'b', number: 2, capacity: 4 }]))
  })
})
