import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => null) }))
import {
  base32Encode,
  base32Decode,
  hotp,
  verifyTotp,
  currentStep,
  generateTotpSecret,
  generateRecoveryCodes,
  matchRecoveryCode,
  looksLikeRecoveryCode,
  totpUri,
} from '@/lib/totp'
import { isMfaVerifiedSuperAdminToken } from '@/lib/superadmin-guard'

// Secreto de prueba de la RFC 4226/6238 ("12345678901234567890" en ASCII).
const RFC_SECRET = Buffer.from('12345678901234567890')
const RFC_SECRET_B32 = base32Encode(RFC_SECRET)

describe('base32', () => {
  it('ida y vuelta', () => {
    const buf = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 77])
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true)
  })
  it('valor conocido', () => {
    expect(RFC_SECRET_B32).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
  })
})

describe('HOTP (RFC 4226, apéndice D)', () => {
  const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489']
  expected.forEach((code, counter) => {
    it(`contador ${counter}`, () => expect(hotp(RFC_SECRET, counter)).toBe(code))
  })
})

describe('TOTP (RFC 6238, SHA1, 8→6 dígitos)', () => {
  // Vectores de la RFC con 8 dígitos; acá usamos los últimos 6.
  const vectors: Array<[number, string]> = [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ]
  for (const [t, code] of vectors) {
    it(`t=${t}`, () => {
      expect(verifyTotp(RFC_SECRET_B32, code, null, t * 1000)).toBe(Math.floor(t / 30))
    })
  }

  it('tolera ±1 paso y rechaza ±2', () => {
    const now = 1_700_000_000_000
    const step = currentStep(now)
    const secret = generateTotpSecret()
    const buf = base32Decode(secret)
    expect(verifyTotp(secret, hotp(buf, step - 1), null, now)).toBe(step - 1)
    expect(verifyTotp(secret, hotp(buf, step + 1), null, now)).toBe(step + 1)
    expect(verifyTotp(secret, hotp(buf, step + 2), null, now)).toBeNull()
    expect(verifyTotp(secret, hotp(buf, step - 2), null, now)).toBeNull()
  })

  it('anti-replay: rechaza un paso ya usado', () => {
    const now = 1_700_000_000_000
    const step = currentStep(now)
    const secret = generateTotpSecret()
    const code = hotp(base32Decode(secret), step)
    expect(verifyTotp(secret, code, step - 1, now)).toBe(step)
    expect(verifyTotp(secret, code, step, now)).toBeNull()
  })

  it('rechaza formatos inválidos', () => {
    expect(verifyTotp(RFC_SECRET_B32, '', null)).toBeNull()
    expect(verifyTotp(RFC_SECRET_B32, '12345', null)).toBeNull()
    expect(verifyTotp(RFC_SECRET_B32, 'abcdef', null)).toBeNull()
    expect(verifyTotp('no-es-base32!', '123456', null)).toBeNull()
  })

  it('URI otpauth', () => {
    const uri = totpUri('ABC', 'admin@example.com')
    expect(uri.startsWith('otpauth://totp/TakeasyGO%3Aadmin%40example.com?')).toBe(true)
    expect(uri).toContain('secret=ABC')
    expect(uri).toContain('issuer=TakeasyGO')
  })
})

describe('códigos de recuperación', () => {
  it('genera 10 únicos con formato XXXXX-XXXXX y hashes distintos', () => {
    const { plain, hashed } = generateRecoveryCodes()
    expect(plain).toHaveLength(10)
    expect(new Set(plain).size).toBe(10)
    for (const c of plain) expect(c).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/)
    expect(hashed.every((h, i) => h !== plain[i] && /^[a-f0-9]{64}$/.test(h))).toBe(true)
  })

  it('coincide sin importar mayúsculas ni guion, y no confunde con TOTP', () => {
    const { plain, hashed } = generateRecoveryCodes(3)
    expect(matchRecoveryCode(plain[1], hashed)).toBe(1)
    expect(matchRecoveryCode(plain[2].toLowerCase().replace('-', ''), hashed)).toBe(2)
    expect(matchRecoveryCode('AAAAA-AAAAA', hashed)).toBe(-1)
    expect(looksLikeRecoveryCode('123456')).toBe(false)
    expect(matchRecoveryCode('123456', hashed)).toBe(-1)
    expect(matchRecoveryCode(plain[0], [])).toBe(-1)
  })
})

describe('token de SuperAdmin pleno', () => {
  it('solo contraseña + MFA + rol superadmin', () => {
    expect(isMfaVerifiedSuperAdminToken({ role: 'superadmin', authProvider: 'credentials', mfa: true })).toBe(true)
    expect(isMfaVerifiedSuperAdminToken({ role: 'superadmin', authProvider: 'credentials', mfa: false })).toBe(false)
    expect(isMfaVerifiedSuperAdminToken({ role: 'superadmin', authProvider: 'google', mfa: true })).toBe(false)
    expect(isMfaVerifiedSuperAdminToken({ role: 'superadmin_pending', authProvider: 'credentials', mfa: false })).toBe(false)
    expect(isMfaVerifiedSuperAdminToken({ role: 'superadmin' })).toBe(false)
    expect(isMfaVerifiedSuperAdminToken(null)).toBe(false)
  })
})
