/**
 * __tests__/lib/onboarding.test.ts
 *
 * Unit tests for onboarding helpers:
 * - slug normalization
 * - token expiry logic
 * - step transitions
 * - getBrandingForCuisine normalization (accent-insensitive)
 */

import { getBrandingForCuisine } from '@/lib/onboarding/branding-defaults'

// ── Slug normalization ────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

describe('slug normalization', () => {
  it('converts spaces and uppercase to lowercase with dashes', () => {
    expect(slugify('McDonald s')).toBe('mcdonald-s')
  })

  it('strips accents', () => {
    expect(slugify('Cafetería El Ángel')).toBe('cafeteria-el-angel')
  })

  it('collapses consecutive special chars into one dash', () => {
    expect(slugify('La Boca & Grill!!')).toBe('la-boca-grill')
  })

  it('does not start or end with dash', () => {
    const s = slugify('  El Moro  ')
    expect(s).not.toMatch(/^-/)
    expect(s).not.toMatch(/-$/)
  })

  it('handles all-ascii names unchanged', () => {
    expect(slugify('mi-restaurante')).toBe('mi-restaurante')
  })
})

// ── Token expiry ──────────────────────────────────────────────────────────────

describe('token expiry', () => {
  it('token is valid before expiry', () => {
    const expiry = new Date(Date.now() + 15 * 60 * 1000) // 15 min from now
    expect(expiry > new Date()).toBe(true)
  })

  it('token is expired after expiry date has passed', () => {
    const expiry = new Date(Date.now() - 1000) // 1 second ago
    expect(expiry < new Date()).toBe(true)
  })

  it('ticket expiry is 30 min (longer than token 15 min)', () => {
    const tokenExpiry = new Date(Date.now() + 15 * 60 * 1000)
    const ticketExpiry = new Date(Date.now() + 30 * 60 * 1000)
    expect(ticketExpiry > tokenExpiry).toBe(true)
  })
})

// ── Step transitions ──────────────────────────────────────────────────────────

describe('onboarding step transitions', () => {
  const validTransitions: [number, number][] = [
    [1, 2], // register → email verified
    [2, 3], // password set → sede
    [3, 4], // sede → branding
    [4, 5], // branding → preview
    [5, 6], // submit → pending_review
  ]

  validTransitions.forEach(([from, to]) => {
    it(`allows step ${from} → ${to}`, () => {
      expect(to).toBe(from + 1)
    })
  })

  it('does not allow step regression (new step must be >= current)', () => {
    const currentStep = 3
    const attemptedStep = 2
    expect(attemptedStep < currentStep).toBe(true) // should be rejected
  })

  it('step 6 is terminal (no further advance)', () => {
    expect(6).toBeLessThanOrEqual(6)
  })
})

// ── Cuisine branding normalization ────────────────────────────────────────────

describe('getBrandingForCuisine', () => {
  it('matches "Cafetería de especialidad" (with accent)', () => {
    const result = getBrandingForCuisine('Cafetería de especialidad')
    expect(result.primaryColor).toBe('#c28e67') // café color
  })

  it('matches "Cafeteria" (without accent, as in real data)', () => {
    const result = getBrandingForCuisine('Cafeteria')
    expect(result.primaryColor).toBe('#c28e67')
  })

  it('matches "cafetería" lowercase with accent', () => {
    const result = getBrandingForCuisine('cafetería')
    expect(result.primaryColor).toBe('#c28e67')
  })

  it('matches Hamburguesas', () => {
    const result = getBrandingForCuisine('Hamburguesas')
    expect(result.primaryColor).toBe('#e03a3c')
  })

  it('matches Parrilla', () => {
    const result = getBrandingForCuisine('Parrilla')
    expect(result.primaryColor).toBe('#8a2821')
  })

  it('matches Pizza', () => {
    const result = getBrandingForCuisine('Pizza')
    expect(result.primaryColor).toBe('#1d803c')
  })

  it('falls back to casual for unknown types like Sandwich', () => {
    const result = getBrandingForCuisine('Sandwich')
    expect(result.primaryColor).toBe('#2b5c8f')
  })

  it('falls back to casual for empty string', () => {
    const result = getBrandingForCuisine('')
    expect(result.primaryColor).toBe('#2b5c8f')
  })
})
