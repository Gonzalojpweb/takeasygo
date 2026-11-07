import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { RESERVED_SLUGS, isReservedSlug, tenantSlugError } from '@/lib/reserved-slugs'

describe('lib/reserved-slugs', () => {
  it('reserva el namespace del panel de organización', () => {
    for (const s of ['grupo', 'grupos', 'org', 'organizacion']) expect(isReservedSlug(s)).toBe(true)
  })

  it('cubre todas las rutas de primer nivel de app/ (salvo [tenant])', () => {
    const appDir = path.join(__dirname, '..', '..', 'app')
    const top = fs.readdirSync(appDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('[') && !d.name.startsWith('(') && !d.name.startsWith('_'))
      .map(d => d.name)
    const missing = top.filter(n => !RESERVED_SLUGS.has(n))
    expect(missing).toEqual([])
  })

  it('tenantSlugError: formato, reservado y válido', () => {
    expect(tenantSlugError('Con Espacio')).toMatch(/inválido/)
    expect(tenantSlugError('a')).toMatch(/inválido/)
    expect(tenantSlugError(undefined)).toMatch(/inválido/)
    expect(tenantSlugError('grupo')).toMatch(/reservado/)
    expect(tenantSlugError('mi-local')).toBeNull()
  })
})

describe('carpetas fijas de app/api', () => {
  const apiDir = path.join(__dirname, '..', '..', 'app', 'api')
  const apiTop = fs.readdirSync(apiDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('['))
    .map(d => d.name)

  it('están todas reservadas para comercios', () => {
    expect(apiTop.filter(n => !RESERVED_SLUGS.has(n))).toEqual([])
  })
})
