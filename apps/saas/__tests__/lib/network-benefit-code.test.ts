import { describe, it, expect } from 'vitest'
import { base32Decode, hotp, currentStep } from '@/lib/totp'
import { benefitCode, benefitPayload, newBenefitRef, newBenefitSecret, parseBenefitInput, verifyBenefitCode } from '@/lib/network/benefit-code'

describe('código del QR dinámico', () => {
  const secret = newBenefitSecret()
  const now = 1_800_000_000_000

  it('referencia legible de 8 caracteres sin 0/O/1/I', () => {
    for (let i = 0; i < 50; i++) expect(newBenefitRef()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
  })

  it('el código cambia cada 30 s y se verifica con ±1 paso (no ±2)', () => {
    const { code, step } = benefitCode(secret, now)
    expect(verifyBenefitCode(secret, code, null, now)).toBe(step)
    const buf = base32Decode(secret)
    expect(verifyBenefitCode(secret, hotp(buf, step - 1), null, now)).toBe(step - 1)
    expect(verifyBenefitCode(secret, hotp(buf, step + 1), null, now)).toBe(step + 1)
    expect(verifyBenefitCode(secret, hotp(buf, step - 2), null, now)).toBeNull()
    expect(verifyBenefitCode(secret, hotp(buf, step + 2), null, now)).toBeNull()
    // Una captura vieja (2 minutos) ya no sirve.
    expect(verifyBenefitCode(secret, code, null, now + 120_000)).toBeNull()
    expect(currentStep(now)).toBe(step)
  })

  it('formatos del QR y del código manual', () => {
    const { qr, manual } = benefitPayload('ABCD2345', '012345')
    expect(qr).toBe('TGO1:ABCD2345:012345')
    expect(manual).toBe('ABCD2345-012345')
    expect(parseBenefitInput(qr)).toEqual({ ref: 'ABCD2345', code: '012345' })
    expect(parseBenefitInput(' abcd2345-012345 ')).toEqual({ ref: 'ABCD2345', code: '012345' })
    expect(parseBenefitInput('ABCD2345 012345')).toEqual({ ref: 'ABCD2345', code: '012345' })
    expect(parseBenefitInput('ABCD-12')).toBeNull()
    expect(parseBenefitInput(42)).toBeNull()
  })

  it('rechaza códigos mal formados o secreto inválido', () => {
    expect(verifyBenefitCode(secret, 'abc123', null, now)).toBeNull()
    expect(verifyBenefitCode('no-es-base32!', '123456', null, now)).toBeNull()
  })
})
