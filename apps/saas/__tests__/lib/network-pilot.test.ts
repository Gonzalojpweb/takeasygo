import { describe, it, expect } from 'vitest'
import { assignGroup, computePilotMetrics, type PilotEventLike } from '@/lib/network/pilot'

describe('asignación al grupo de control', () => {
  it('es determinística: mismo consumidor, campaña y relación ⇒ mismo grupo', () => {
    const g = assignGroup('user-1', 'camp-1', 'rel-1', 20)
    for (let i = 0; i < 5; i++) expect(assignGroup('user-1', 'camp-1', 'rel-1', 20)).toBe(g)
  })

  it('respeta el % de control aproximadamente', () => {
    let control = 0
    for (let i = 0; i < 4000; i++) if (assignGroup(`u${i}`, 'camp', 'rel', 20) === 'control') control++
    expect(control / 4000).toBeGreaterThan(0.17)
    expect(control / 4000).toBeLessThan(0.23)
  })

  it('0 % de control: todos reciben el beneficio', () => {
    expect(assignGroup('u', 'c', 'r', 0)).toBe('treatment')
  })
})

describe('métricas del piloto', () => {
  const assignments = [
    { _id: 't1', group: 'treatment' as const },
    { _id: 't2', group: 'treatment' as const },
    { _id: 't3', group: 'treatment' as const },
    { _id: 't4', group: 'treatment' as const },
    { _id: 'c1', group: 'control' as const },
    { _id: 'c2', group: 'control' as const },
  ]
  const ev = (assignmentId: string, group: 'treatment' | 'control', type: PilotEventLike['type'], orderId: string, amountCents = 0): PilotEventLike =>
    ({ assignmentId, consumerUserId: assignmentId, group, type, orderId, amountCents })

  it('mide personas, no pedidos; calcula la diferencia y la facturación incremental', () => {
    const events = [
      ev('t1', 'treatment', 'issued', 'e1'), ev('t2', 'treatment', 'issued', 'e2'), ev('t3', 'treatment', 'issued', 'e3'), ev('t4', 'treatment', 'issued', 'e4'),
      // t1 compra 3 veces (1 persona, 3 pedidos), t2 una vez con canje.
      ev('t1', 'treatment', 'receiver_purchase', 'r1', 100_000), ev('t1', 'treatment', 'receiver_purchase', 'r2', 100_000), ev('t1', 'treatment', 'repurchase', 'r2'),
      ev('t1', 'treatment', 'receiver_purchase', 'r3', 100_000), ev('t1', 'treatment', 'repurchase', 'r3'),
      ev('t2', 'treatment', 'receiver_purchase', 'r4', 200_000), ev('t2', 'treatment', 'redeemed', 'r4'),
      // control: c1 compra una vez (ya compraba).
      ev('c1', 'control', 'receiver_purchase', 'r5', 100_000),
    ]
    const m = computePilotMetrics(assignments, events)
    expect(m.treatment).toMatchObject({ persons: 4, buyers: 2, orders: 4, revenueCents: 500_000, issued: 4, redemptions: 1, repeatBuyers: 1 })
    expect(m.treatment.conversion).toBe(0.5)
    expect(m.control).toMatchObject({ persons: 2, buyers: 1, orders: 1, revenueCents: 100_000, issued: 0 })
    expect(m.control.conversion).toBe(0.5)
    expect(m.liftPoints).toBe(0) // mismos compradores proporcionales: los canjes no son incrementales
    expect(m.treatment.revenuePerPersonCents).toBe(125_000)
    expect(m.control.revenuePerPersonCents).toBe(50_000)
    expect(m.incrementalRevenueCents).toBe(300_000) // (125.000 − 50.000) × 4
    expect(m.sampleNote).toMatch(/no es concluyente/)
  })

  it('sin datos no divide por cero', () => {
    const m = computePilotMetrics([], [])
    expect(m.treatment.conversion).toBe(0)
    expect(m.liftPoints).toBe(0)
  })
})
