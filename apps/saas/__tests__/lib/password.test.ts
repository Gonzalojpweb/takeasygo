/**
 * __tests__/lib/password.test.ts
 *
 * Reglas de contraseña del onboarding: el cliente (checklist) y el server
 * (zod + route) comparten este módulo, así que se testea una sola vez.
 * - sanitizePassword: NFC + sin caracteres de control
 * - passwordRules: longitud, letra y número
 * - passwordError: primer requisito incumplido (o null)
 */

import {
  PASSWORD_MIN,
  PASSWORD_MAX,
  sanitizePassword,
  passwordRules,
  passwordError,
} from '@/lib/password'

// ── sanitizePassword ─────────────────────────────────────────────────────────

describe('sanitizePassword', () => {
  it('deja pasar una contraseña normal sin tocarla', () => {
    expect(sanitizePassword('Secreta123')).toBe('Secreta123')
    expect(sanitizePassword('contraseña-áéíóú')).toBe('contraseña-áéíóú')
  })

  it('elimina CRLF y NUL pegados al pegar desde un formateador', () => {
    expect(sanitizePassword('Secreta123\r\n')).toBe('Secreta123')
    expect(sanitizePassword('abc\u0000def1')).toBe('abcdef1')
    expect(sanitizePassword('a\u0009b\u000Ac\u000Dd1')).toBe('abcd1')
  })

  it('elimina DEL y los controles C1 (U+007F-U+009F)', () => {
    expect(sanitizePassword('abc\u007Fdef1')).toBe('abcdef1')
    expect(sanitizePassword('ab\u0085c\u009Cd1')).toBe('abcd1')
  })

  it('no elimina la ñ ni los caracteres visibles', () => {
    expect(sanitizePassword('mañana2024')).toBe('mañana2024')
    expect(sanitizePassword('p@ss_w0rd!¿?')).toBe('p@ss_w0rd!¿?')
  })

  it('normaliza a NFC (composición Unicode)', () => {
    const descompuesta = 'caf\u0065\u03011' // "café1" con e + combining acute
    expect(sanitizePassword(descompuesta)).toBe('café1')
    expect(sanitizePassword(descompuesta).normalize('NFC')).toBe(sanitizePassword(descompuesta))
  })

  it('tolera null/undefined defensivamente', () => {
    expect(sanitizePassword(null as unknown as string)).toBe('')
    expect(sanitizePassword(undefined as unknown as string)).toBe('')
  })
})

// ── passwordRules ────────────────────────────────────────────────────────────

describe('passwordRules', () => {
  it(`acepta desde ${PASSWORD_MIN} caracteres`, () => {
    expect(passwordRules('abc1234').length).toBe(false)
    expect(passwordRules('abc12345').length).toBe(true)
  })

  it(`acepta hasta ${PASSWORD_MAX} caracteres`, () => {
    expect(passwordRules('a1'.repeat(PASSWORD_MAX / 2)).length).toBe(true)
    expect(passwordRules(('a1'.repeat(PASSWORD_MAX / 2)) + 'a').length).toBe(false)
  })

  it('reconoce letras con acento como letra', () => {
    expect(passwordRules('contraseña1').letter).toBe(true)
    expect(passwordRules('mañana2024').letter).toBe(true)
    expect(passwordRules('12345678').letter).toBe(false)
  })

  it('reconoce números (ascii y otros dígitos)', () => {
    expect(passwordRules('abcdefgh1').number).toBe(true)
    expect(passwordRules('abcdefgh').number).toBe(false)
  })
})

// ── passwordError ────────────────────────────────────────────────────────────

describe('passwordError', () => {
  it('devuelve null con una contraseña válida', () => {
    expect(passwordError('Secreta123')).toBeNull()
    expect(passwordError('mañana2024')).toBeNull()
    expect(passwordError('aaaaaaaa1')).toBeNull()
  })

  it('prioriza la longitud sobre letra/número', () => {
    expect(passwordError('abc')).toMatch(/entre \d+ y \d+ caracteres/)
    expect(passwordError('1234567')).toMatch(/caracteres/)
    expect(passwordError('12345678')).toBe('Debe incluir al menos una letra')
    expect(passwordError('abcdefgh')).toBe('Debe incluir al menos un número')
  })

  it('valida sobre el texto saneado, no sobre el crudo', () => {
    // 12 caracteres crudos pero solo 4 válidos después de sanear.
    expect(passwordError('abc1\r\n\u0000\u0000')).toMatch(/caracteres/)
    // La misma contraseña válida con basura pegada termina OK.
    expect(passwordError('Secreta123\r\n')).toBeNull()
  })

  it('una contraseña muy larga queda fuera de rango', () => {
    expect(passwordError('a'.repeat(PASSWORD_MAX) + '1')).toMatch(/caracteres/)
  })

  it('el error coincide con lo que muestra el checklist del cliente', () => {
    const pw = 'short'
    const rules = passwordRules(sanitizePassword(pw))
    const err = passwordError(pw)
    const firstFailing =
      !rules.length
        ? `La contraseña debe tener entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres`
        : !rules.letter
          ? 'Debe incluir al menos una letra'
          : !rules.number
            ? 'Debe incluir al menos un número'
            : null
    expect(err).toBe(firstFailing)
  })
})
