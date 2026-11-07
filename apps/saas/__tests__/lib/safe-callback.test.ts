import { describe, it, expect } from 'vitest'
import { safeCallbackUrl } from '@/lib/safe-callback'

describe('safeCallbackUrl (vuelta después del login, PR 9b)', () => {
  it('acepta rutas internas', () => {
    expect(safeCallbackUrl('/grupo')).toBe('/grupo')
    expect(safeCallbackUrl('/grupo/aceptar?token=abc')).toBe('/grupo/aceptar?token=abc')
  })

  it('rechaza otro dominio y valores raros', () => {
    const backslashHost = '/' + String.fromCharCode(92) + 'evil.com' // "/\evil.com"
    for (const bad of ['https://evil.com', '//evil.com', backslashHost, 'grupo', '', null, undefined, '/' + 'a'.repeat(600)]) {
      expect(safeCallbackUrl(bad)).toBeNull()
    }
  })
})
