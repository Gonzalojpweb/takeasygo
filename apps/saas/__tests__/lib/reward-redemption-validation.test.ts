import { describe, it, expect } from 'vitest'
import {
  evaluateRewardRedemption,
  computeMicroAdvance,
  isPendingAdvanceBlocking,
  PENDING_ADVANCE_ERROR,
  MICRO_ADVANCE_RATIO,
} from '@takeasygo/business'

describe('evaluateRewardRedemption — modo checkout (adelanto permitido)', () => {
  it('saldo suficiente → válido, sin adelanto ni micro-adelanto', () => {
    const r = evaluateRewardRedemption({
      mode: 'checkout',
      pointsBalance: 500,
      pointsRequired: 100,
      advanceLimit: 250,
      advanceMaxLimit: 500,
    })

    expect(r.valid).toBe(true)
    if (!r.valid) return
    expect(r.projectedBalance).toBe(400)
    expect(r.advanceAmount).toBe(0)
    expect(r.microAdvanceRequired).toBe(false)
  })

  it('saldo exacto → válido con micro-adelanto (20% del costo, tope del tenant)', () => {
    const r = evaluateRewardRedemption({
      mode: 'checkout',
      pointsBalance: 100,
      pointsRequired: 100,
      advanceLimit: 250,
      advanceMaxLimit: 500,
    })

    expect(r.valid).toBe(true)
    if (!r.valid) return
    expect(r.projectedBalance).toBe(0)
    expect(r.microAdvanceRequired).toBe(true)
    expect(r.microAdvanceAmount).toBe(Math.ceil(100 * MICRO_ADVANCE_RATIO))
    expect(r.advanceAmount).toBe(0)
  })

  it('insuficiente con adelanto disponible → válido, adelanta exactamente la falta', () => {
    const r = evaluateRewardRedemption({
      mode: 'checkout',
      pointsBalance: 80,
      pointsRequired: 100,
      advanceLimit: 250,
      advanceMaxLimit: 500,
    })

    expect(r.valid).toBe(true)
    if (!r.valid) return
    expect(r.projectedBalance).toBe(-20)
    expect(r.advanceAmount).toBe(20)
    expect(r.microAdvanceRequired).toBe(false)
  })

  it('insuficiente sin adelanto configurado → rechazado con mensaje', () => {
    const r = evaluateRewardRedemption({
      mode: 'checkout',
      pointsBalance: 0,
      pointsRequired: 100,
      advanceLimit: 0,
      advanceMaxLimit: 0,
    })

    expect(r.valid).toBe(false)
    if (r.valid) return
    expect(r.reason).toBe('advance_limit_exceeded')
    expect(r.missingPoints).toBe(100)
    expect(r.error).toBe(
      'Te faltan 100 puntos para canjear este premio. Límite de adelanto: no disponible.'
    )
  })

  it('la falta supera el límite efectivo (min(sosLimit, sosMaxLimit)) → rechazado', () => {
    const r = evaluateRewardRedemption({
      mode: 'checkout',
      pointsBalance: 0,
      pointsRequired: 100,
      advanceLimit: 250,
      advanceMaxLimit: 50,
    })

    expect(r.valid).toBe(false)
    if (r.valid) return
    expect(r.reason).toBe('advance_limit_exceeded')
    expect(r.advanceLimitAvailable).toBe(50)
    expect(r.error).toBe(
      'Te faltan 100 puntos para canjear este premio. Límite de adelanto: 50.'
    )
  })

  it('adelanto pendiente bloquea solo cuando haría falta adelantar', () => {
    const blocked = evaluateRewardRedemption({
      mode: 'checkout',
      pointsBalance: 0,
      pointsRequired: 100,
      advanceLimit: 250,
      advanceMaxLimit: 500,
      hasPendingAdvance: true,
      pendingAdvanceUsed: 30,
    })
    expect(blocked.valid).toBe(false)
    if (blocked.valid) return
    expect(blocked.reason).toBe('pending_advance')
    expect(blocked.error).toBe(PENDING_ADVANCE_ERROR)

    const allowed = evaluateRewardRedemption({
      mode: 'checkout',
      pointsBalance: 500,
      pointsRequired: 100,
      hasPendingAdvance: true,
      pendingAdvanceUsed: 30,
    })
    expect(allowed.valid).toBe(true)
  })

  it('puntos requeridos inválidos → rechazado', () => {
    const r = evaluateRewardRedemption({
      mode: 'checkout',
      pointsBalance: 100,
      pointsRequired: 0,
    })
    expect(r.valid).toBe(false)
    if (r.valid) return
    expect(r.reason).toBe('invalid_points')
    expect(r.error).toBe('Puntos requeridos inválidos')
  })
})

describe('evaluateRewardRedemption — modo standalone (sin adelanto)', () => {
  it('saldo suficiente → válido', () => {
    const r = evaluateRewardRedemption({
      mode: 'standalone',
      pointsBalance: 500,
      pointsRequired: 100,
      advanceLimit: 250,
    })
    expect(r.valid).toBe(true)
    if (!r.valid) return
    expect(r.projectedBalance).toBe(400)
    expect(r.microAdvanceRequired).toBe(false)
    expect(r.advanceAmount).toBe(0)
  })

  it('saldo exacto → válido con micro-adelanto', () => {
    const r = evaluateRewardRedemption({
      mode: 'standalone',
      pointsBalance: 100,
      pointsRequired: 100,
      advanceLimit: 250,
    })
    expect(r.valid).toBe(true)
    if (!r.valid) return
    expect(r.microAdvanceRequired).toBe(true)
    expect(r.microAdvanceAmount).toBe(20)
  })

  it('insuficiente → rechazado aunque el tenant tenga límite de adelanto (no aplica)', () => {
    const r = evaluateRewardRedemption({
      mode: 'standalone',
      pointsBalance: 40,
      pointsRequired: 100,
      advanceLimit: 250,
      advanceMaxLimit: 500,
    })
    expect(r.valid).toBe(false)
    if (r.valid) return
    expect(r.reason).toBe('insufficient')
    expect(r.missingPoints).toBe(60)
  })

  it('adelanto pendiente con puntos usados → bloquea incluso con saldo suficiente', () => {
    const r = evaluateRewardRedemption({
      mode: 'standalone',
      pointsBalance: 500,
      pointsRequired: 100,
      hasPendingAdvance: true,
      pendingAdvanceUsed: 30,
    })
    expect(r.valid).toBe(false)
    if (r.valid) return
    expect(r.reason).toBe('pending_advance')
    expect(r.error).toBe(PENDING_ADVANCE_ERROR)
  })

  it('adelanto declarado sin puntos usados → no bloquea', () => {
    const r = evaluateRewardRedemption({
      mode: 'standalone',
      pointsBalance: 500,
      pointsRequired: 100,
      hasPendingAdvance: true,
      pendingAdvanceUsed: 0,
    })
    expect(r.valid).toBe(true)
  })
})

describe('computeMicroAdvance', () => {
  it('es el 20% del costo redondeado hacia arriba', () => {
    expect(computeMicroAdvance(100, 250)).toBe(20)
    expect(computeMicroAdvance(15, 250)).toBe(3)
    expect(computeMicroAdvance(0, 250)).toBe(0)
  })

  it('nunca supera el límite del tenant', () => {
    expect(computeMicroAdvance(1000, 100)).toBe(100)
  })
})

describe('isPendingAdvanceBlocking', () => {
  it('solo bloquea si hay adelanto pendiente', () => {
    expect(isPendingAdvanceBlocking(false, 50, false)).toBe(false)
    expect(isPendingAdvanceBlocking(undefined, 50, true)).toBe(false)
    expect(isPendingAdvanceBlocking(true, 50, false)).toBe(true)
    expect(isPendingAdvanceBlocking(true, 50, true)).toBe(true)
    expect(isPendingAdvanceBlocking(true, 0, true)).toBe(false)
    expect(isPendingAdvanceBlocking(true, undefined, true)).toBe(false)
  })
})
