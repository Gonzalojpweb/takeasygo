import { describe, it, expect } from 'vitest'
import Tenant from '@/models/Tenant'

describe('Tenant.onboarding.menuPhotos', () => {
  it('acepta hasta 6 fotos', () => {
    const t = new Tenant({ name: 'X', slug: 'x', onboarding: { menuPhotos: Array(6).fill('https://cdn/a.jpg') } })
    expect(t.validateSync()).toBeUndefined()
  })

  it('rechaza la 7ma foto', () => {
    const t = new Tenant({ name: 'X', slug: 'x', onboarding: { menuPhotos: Array(7).fill('https://cdn/a.jpg') } })
    const err = t.validateSync()
    expect(err?.errors['onboarding.menuPhotos']).toBeDefined()
  })
})
