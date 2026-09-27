import { describe, it, expect } from 'vitest'
import { isTenantPubliclyOperational } from '@/lib/tenant-gates'

const base = { isActive: true, status: 'active' }

describe('isTenantPubliclyOperational — onboarding.status', () => {
  it('onboarding ausente (tenant precargo, el caso de los 55 existentes) → OPERATIVO', () => {
    expect(isTenantPubliclyOperational({ isActive: true, status: 'active' })).toBe(true)
  })

  it("onboarding.status ausente dentro del objeto → OPERATIVO", () => {
    expect(isTenantPubliclyOperational({ ...base, onboarding: {} })).toBe(true)
  })

  it("onboarding.status null → tratado como 'none' → OPERATIVO", () => {
    expect(isTenantPubliclyOperational({ ...base, onboarding: { status: null as unknown as string } })).toBe(true)
  })

  it("'none' → OPERATIVO", () => {
    expect(isTenantPubliclyOperational({ ...base, onboarding: { status: 'none' } })).toBe(true)
  })

  it("'approved' → OPERATIVO", () => {
    expect(isTenantPubliclyOperational({ ...base, onboarding: { status: 'approved' } })).toBe(true)
  })

  it("'draft' → NO operativo", () => {
    expect(isTenantPubliclyOperational({ ...base, onboarding: { status: 'draft' } })).toBe(false)
  })

  it("'pending_review' → NO operativo (es el estado del wizard)", () => {
    expect(isTenantPubliclyOperational({ ...base, onboarding: { status: 'pending_review' } })).toBe(false)
  })

  it("'rejected' → NO operativo", () => {
    expect(isTenantPubliclyOperational({ ...base, onboarding: { status: 'rejected' } })).toBe(false)
  })

  it('status de onboarding desconocido → NO operativo (fail-safe)', () => {
    expect(isTenantPubliclyOperational({ ...base, onboarding: { status: 'banana' } })).toBe(false)
  })
})

describe('isTenantPubliclyOperational — isActive', () => {
  it('isActive false → NO operativo, aunque onboarding sea approved', () => {
    expect(isTenantPubliclyOperational({ isActive: false, status: 'active', onboarding: { status: 'approved' } })).toBe(false)
  })

  it('isActive false + onboarding none → NO operativo', () => {
    expect(isTenantPubliclyOperational({ isActive: false, status: 'active' })).toBe(false)
  })
})

describe('isTenantPubliclyOperational — status del tenant', () => {
  it("status 'active' → OPERATIVO", () => {
    expect(isTenantPubliclyOperational({ ...base })).toBe(true)
  })

  it("status 'paused' → OPERATIVO (misma semántica que el POST /orders preexistente)", () => {
    expect(isTenantPubliclyOperational({ isActive: true, status: 'paused' })).toBe(true)
  })

  it("status 'deleted' → NO operativo", () => {
    expect(isTenantPubliclyOperational({ isActive: true, status: 'deleted' })).toBe(false)
  })

  it('status desconocido → NO operativo (fail-safe)', () => {
    expect(isTenantPubliclyOperational({ isActive: true, status: 'whatever' })).toBe(false)
  })
})

describe('isTenantPubliclyOperational — tenant inexistente', () => {
  it('null → NO operativo (no lanza)', () => {
    expect(isTenantPubliclyOperational(null)).toBe(false)
  })

  it('undefined → NO operativo (no lanza)', () => {
    expect(isTenantPubliclyOperational(undefined)).toBe(false)
  })
})

describe('isTenantPubliclyOperational — combinaciones', () => {
  const cases: Array<[string, Parameters<typeof isTenantPubliclyOperational>[0], boolean]> = [
    ['tenant vivo aprobado', { isActive: true, status: 'active', onboarding: { status: 'approved' } }, true],
    ['tenant vivo precargo', { isActive: true, status: 'active' }, true],
    ['tenant vivo en revisión', { isActive: true, status: 'active', onboarding: { status: 'pending_review' } }, false],
    ['tenant vivo borrador', { isActive: true, status: 'active', onboarding: { status: 'draft' } }, false],
    ['tenant vivo rechazado', { isActive: true, status: 'active', onboarding: { status: 'rejected' } }, false],
    ['tenant pausado precargo', { isActive: true, status: 'paused' }, true],
    ['tenant pausado en revisión', { isActive: true, status: 'paused', onboarding: { status: 'pending_review' } }, false],
    ['tenant deshabilitado', { isActive: false, status: 'active', onboarding: { status: 'approved' } }, false],
    ['tenant eliminado', { isActive: true, status: 'deleted', onboarding: { status: 'approved' } }, false],
    ['todo mal a la vez', { isActive: false, status: 'deleted', onboarding: { status: 'pending_review' } }, false],
  ]

  it.each(cases)('%s', (_name, input, expected) => {
    expect(isTenantPubliclyOperational(input)).toBe(expected)
  })
})
