import { describe, it, expect } from 'vitest'
import { StatsAccumulator } from './store'

describe('acumulador de estadísticas de pantalla', () => {
  it('suma reproducciones, tiempo y errores por pieza y corta ventanas', () => {
    const acc = new StatsAccumulator(1_000_000)
    acc.addTime('a', 10_000.4); acc.addPlay('a')
    acc.addTime('a', 5_000); acc.addPlay('a')
    acc.addError('b')
    const batch = acc.cut(1_900_000)!
    expect(batch.windowStart).toBe(new Date(1_000_000).toISOString())
    expect(batch.windowEnd).toBe(new Date(1_900_000).toISOString())
    expect(batch.batchId).toMatch(/^[a-f0-9]{24}$/)
    expect(batch.items).toEqual([
      { pieceId: 'a', plays: 2, playMs: 15_000, errors: 0 },
      { pieceId: 'b', plays: 0, playMs: 0, errors: 1 },
    ])
    // La ventana siguiente arranca donde terminó la anterior, vacía.
    expect(acc.cut(2_000_000)).toBeNull()
  })
})

describe('proof of play en el lote', () => {
  it('manda inicio y fin de cada reproducción (y por paso), dentro de la ventana y con tope', () => {
    const acc = new StatsAccumulator(1_000_000)
    acc.addPlay('a'.repeat(24)); acc.addTime('a'.repeat(24), 12_000)
    acc.addProof('a'.repeat(24), null, 1_001_000, 1_013_000)
    acc.addProof('a'.repeat(24), 0, 1_001_000, 1_007_000)
    acc.addProof('a'.repeat(24), null, 1_020_000, 1_010_000)
    const b = acc.cut(1_100_000)!
    expect(b.proofs).toEqual([
      { pieceId: 'a'.repeat(24), step: null, startedAt: new Date(1_001_000).toISOString(), endedAt: new Date(1_013_000).toISOString() },
      { pieceId: 'a'.repeat(24), step: 0, startedAt: new Date(1_001_000).toISOString(), endedAt: new Date(1_007_000).toISOString() },
    ])
    expect(acc.cut(1_200_000)).toBeNull()
  })
})
