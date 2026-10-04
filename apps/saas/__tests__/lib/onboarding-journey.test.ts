/**
 * __tests__/lib/onboarding-journey.test.ts
 *
 * Tests for the onboarding journey: 7 milestones, goal-gradient weights,
 * progress computation, ETA, copy, and phase transitions.
 */

import {
  JOURNEY,
  progressFor,
  remaining,
  etaMinutes,
  copyFor,
  currentHito,
  phaseAIndex,
  phaseBIndex,
  serverToGlobal,
  globalToServer,
} from '@/lib/onboarding-journey'

describe('JOURNEY', () => {
  it('tiene 7 hitos definidos', () => {
    expect(JOURNEY).toHaveLength(7)
  })

  it('los hitos tienen label y hint', () => {
    for (const h of JOURNEY) {
      expect(h.label).toBeDefined()
      expect(h.hint).toBeDefined()
      expect(h.phase).toBeDefined()
    }
  })

  it('no tiene duplicados', () => {
    const keys = JOURNEY.map((h) => h.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('progressFor', () => {
  it('calcula el % de progreso con goal-gradient', () => {
    // WEIGHTS = [1,1,1.5,2,2.5,3,4], suma = 15
    // progressFor(n) = round((suma primeros n pesos / 15) * 100), mìnimo 6
    expect(progressFor(0)).toBe(6)
    expect(progressFor(1)).toBe(7) // round(1/15*100) = 7, max(7,6)=7
    expect(progressFor(3)).toBe(23) // round((1+1+1.5)/15*100) = round(23.33) = 23
    expect(progressFor(7)).toBe(100) // 15/15*100 = 100
  })

  it('siempre devuelve como mínimo 6 % (piso visual)', () => {
    expect(progressFor(0)).toBe(6)
    expect(progressFor(1)).toBe(7)
  })
})

describe('remaining', () => {
  it('devuelve los hitos pendientes', () => {
    expect(remaining(0)).toBe(7)
    expect(remaining(7)).toBe(0)
    expect(remaining(3)).toBe(4)
  })
})

describe('etaMinutes', () => {
  it('calcula el tiempo estimado restante', () => {
    // 0 hitos → 0 min
    expect(etaMinutes(0)).toBe(0)
    // 1 hito (datos) → 2 min
    expect(etaMinutes(1)).toBe(2)
    // 2 hitos (datos + email) → 4 min
    expect(etaMinutes(2)).toBe(4)
    // 3 hitos (datos + email + clave) → 6 min
    expect(etaMinutes(3)).toBe(6)
    // 4 hitos (añadimos plan) → 6 + 4 = 10 min
    expect(etaMinutes(4)).toBe(10)
    // 7 hitos (completo) → 2*2 + 4*4 = 20 min
    expect(etaMinutes(7)).toBe(20)
  })
})

describe('copyFor', () => {
  it('devuelve copy dinámico según hitos pendientes', () => {
    expect(copyFor(7)).toBe('¡Listo!')
    expect(copyFor(6)).toBe('Te queda 1 paso')
    expect(copyFor(5)).toBe('Te quedan 2 pasos')
    expect(copyFor(1)).toBe('Te quedan 6 pasos')
    expect(copyFor(0)).toBe('Te quedan 7 pasos')
  })
})

describe('currentHito', () => {
  it('devuelve label y hint del hito actual', () => {
    const { label, hint } = currentHito(1)
    expect(label).toBe('Datos del negocio')
    expect(hint).toBe('Nombre, slug y email del restaurante')

    const { label: l, hint: h } = currentHito(2)
    expect(l).toBe('Verificá tu email')
    expect(h).toBe('Llegó a tu bandeja (revistá Spam si no aparece)')
  })

  it('devuelve null para índices fuera de rango', () => {
    expect(currentHito(0)).toBeNull()
    expect(currentHito(8)).toBeNull()
  })
})

describe('phaseAIndex', () => {
  it('mapea step local A al índice global', () => {
    expect(phaseAIndex(1)).toBe(1)
    expect(phaseAIndex(2)).toBe(2)
    expect(phaseAIndex(3)).toBe(3)
  })
})

describe('phaseBIndex', () => {
  it('mapea step server B al índice global', () => {
    expect(phaseBIndex(3)).toBe(3)
    expect(phaseBIndex(4)).toBe(4)
    expect(phaseBIndex(5)).toBe(5)
    expect(phaseBIndex(6)).toBe(6)
    expect(phaseBIndex(7)).toBe(7)
  })
})

describe('serverToGlobal y globalToServer', () => {
  it('serverToGlobal y globalToServer son inversos', () => {
    for (const step of [1, 2, 3, 4, 5, 6, 7]) {
      const global = serverToGlobal(step)
      const back = globalToServer(global)
      expect(back).toBe(step)
    }
  })
})