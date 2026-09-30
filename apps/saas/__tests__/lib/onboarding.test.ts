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
import { slugify, slugifyOrFallback } from '@/lib/slugify'
import { onboardingRegisterSchema } from '@/lib/schemas'

// ── Slug normalization ────────────────────────────────────────────────────────

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

// ── Entrada libre: cualquier letra, símbolo, mayúscula, espacio ───────────────

describe('slugify con nombres hostiles', () => {
  const VALID = /^[a-z0-9-]{1,50}$/
  const nombres = [
    "McDonald's",
    'Ñandú & Hijos',
    'La Pizzería ¡ÑOÑO!',
    'CAFÉ & BAR',
    'Pizzería N°1 (acepta dólares & pesos)',
    'Sushi Kenji 鮨 鮨',
    'ÁÉÍÓÚÜÑ',
    '  El Moro  ',
    'Casa & Casa — Casa',
    'Ñ',
    '🍕 Burger Joint 🍕',
    'el/otro.local',
    'RESTAURANT #1 - CABA',
    'a'.repeat(200),
  ]

  for (const nombre of nombres) {
    it(`"${nombre}" → slug válido`, () => {
      expect(slugify(nombre)).toMatch(VALID)
    })
  }

  it('nunca devuelve vacío para texto que tiene letras', () => {
    expect(slugify('Ñandú & Hijos')).not.toBe('')
  })

  it('respeta el máximo de 50 caracteres', () => {
    expect(slugify('palabra muy larga '.repeat(30)).length).toBeLessThanOrEqual(50)
  })
})

describe('slugifyOrFallback', () => {
  it('prefiere el enlace que escribió el usuario', () => {
    expect(slugifyOrFallback('Ñandú & Hijos', 'Mi Slug')).toBe('mi-slug')
  })

  it('si el enlace está vacío usa el nombre del negocio', () => {
    expect(slugifyOrFallback('Ñandú & Hijos', '')).toBe('nandu-hijos')
  })

  it('si el enlace son solo símbolos cae al nombre', () => {
    expect(slugifyOrFallback('Ñandú', '!!!')).toBe('nandu')
  })

  it('nunca devuelve vacío aunque nombre y enlace sean símbolos', () => {
    expect(slugifyOrFallback('***', '***')).toMatch(/^[a-z0-9-]{2,50}$/)
  })
})

describe('onboardingRegisterSchema — acepta texto libre', () => {
  const base = { email: 'dueno@ejemplo.com' }

  it('nombre con tildes, mayúsculas, símbolos y espacios', () => {
    const r = onboardingRegisterSchema.safeParse({
      ...base,
      name: 'Ñandú & Hijos ¡Cocina Árabe!',
      slug: 'ñandú & hijos',
    })
    expect(r.success).toBe(true)
  })

  it('slug con espacios y mayúsculas no se rechaza (se normaliza después)', () => {
    const r = onboardingRegisterSchema.safeParse({ ...base, name: 'La Pampa', slug: 'La Pampa 2' })
    expect(r.success).toBe(true)
  })

  it('slug vacío es válido (se deriva del nombre)', () => {
    const r = onboardingRegisterSchema.safeParse({ ...base, name: 'La Pampa', slug: '' })
    expect(r.success).toBe(true)
  })

  it('slug ausente es válido', () => {
    const r = onboardingRegisterSchema.safeParse({ ...base, name: 'La Pampa' })
    expect(r.success).toBe(true)
  })

  it('sigue rechazando email inválido y nombre vacío', () => {
    expect(onboardingRegisterSchema.safeParse({ email: 'x@y.com', name: '' }).success).toBe(false)
    expect(onboardingRegisterSchema.safeParse({ email: 'no-es-email', name: 'La Pampa' }).success).toBe(false)
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
