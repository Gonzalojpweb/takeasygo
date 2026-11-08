import { describe, it, expect } from 'vitest'
import { computeClubProgress, clubProgressMessage } from '@/lib/club-progress'

const rewards = [
  { _id: 'r1', name: 'Café + medialuna', pointsCost: 150 },
  { _id: 'r2', name: 'Tostado', pointsCost: 300 },
  { _id: 'r3', name: 'Licuado', pointsCost: 450 },
  { _id: 'r4', name: 'Torta', pointsCost: 600 },
  { _id: 'r5', name: 'Brunch para dos', pointsCost: 1200 },
]

describe('computeClubProgress', () => {
  it('sin premios devuelve progreso vacío', () => {
    expect(computeClubProgress(500, [])).toMatchObject({ next: null, pct: 0, milestones: [] })
  })

  it('ubica el próximo premio a dos tercios de la barra', () => {
    const p = computeClubProgress(225, rewards)
    expect(p.next?._id).toBe('r2')
    expect(p.scale).toBe(450)
    expect(p.pct).toBe(50)
    expect(p.available).toBe(1)
    expect(p.missing).toBe(75)
    expect(p.milestones.map(m => [m.id, m.state])).toEqual([
      ['r1', 'done'],
      ['r2', 'next'],
    ]) // r3 en 100 % queda fuera: un hito lejano pegado al borde se superpone
  })

  it('no estira la escala más allá del premio más caro', () => {
    const p = computeClubProgress(1000, rewards)
    expect(p.next?._id).toBe('r5')
    expect(p.scale).toBe(1200)
    expect(p.available).toBe(4)
  })

  it('con saldo para todo llena la barra y no hay próximo', () => {
    const p = computeClubProgress(5000, rewards)
    expect(p.next).toBeNull()
    expect(p.pct).toBe(100)
    expect(p.milestones.every(m => m.state === 'done')).toBe(true)
  })

  it('con 0 puntos el primer premio no queda pegado al borde', () => {
    const p = computeClubProgress(0, [{ _id: 'a', name: 'A', pointsCost: 100 }])
    expect(p.scale).toBe(100) // tope: el premio más caro
    expect(p.pct).toBe(0)
    expect(p.milestones[0]).toMatchObject({ state: 'next', left: 97 })
  })

  it('ignora premios sin costo válido', () => {
    const p = computeClubProgress(10, [{ _id: 'x', name: 'X', pointsCost: 0 }, ...rewards])
    expect(p.milestones.find(m => m.id === 'x')).toBeUndefined()
  })
})

describe('clubProgressMessage', () => {
  it('nombra cuántos premios ya alcanza y cuánto falta', () => {
    const m = clubProgressMessage(computeClubProgress(225, rewards))
    expect(m.strong).toBe('Ya podés canjear 1 premio.')
    expect(m.rest).toBe('Te faltan 75 pts para Tostado.')
  })

  it('sin premios alcanzados, destaca lo que falta', () => {
    const m = clubProgressMessage(computeClubProgress(100, rewards))
    expect(m.strong).toBe('Te faltan 50 pts para Café + medialuna.')
  })

  it('formatea miles en es-AR', () => {
    const m = clubProgressMessage(computeClubProgress(0, [{ _id: 'a', name: 'Brunch', pointsCost: 1500 }]))
    expect(m.strong).toBe('Te faltan 1.500 pts para Brunch.')
  })
})
