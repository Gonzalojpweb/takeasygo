import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/apiAuth', () => ({ getSessionUser: vi.fn() }))

import { getSessionUser } from '@/lib/apiAuth'
import { getPageScope, sanitizeLocationForClient } from '@/lib/page-scope'

const L1 = '64b0000000000000000000c1'

describe('getPageScope', () => {
  it('usuario de tenant (sin sedes) → sin filtros', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ role: 'admin', assignedLocations: [] } as any)
    const scope = await getPageScope()
    expect(scope.isScoped).toBe(false)
    expect(scope.locationFilter).toEqual({})
  })

  it('usuario de sede → filtros por sus sedes (ObjectIds) y compartidos con null', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ role: 'manager', assignedLocations: [L1] } as any)
    const scope = await getPageScope()
    expect(scope.isScoped).toBe(true)
    expect(String(scope.locationFilter.locationId!.$in[0])).toBe(L1)
    expect(scope.sharedFilter.locationId!.$in).toContain(null)
  })

  it('superadmin → sin filtros aunque tenga sedes', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ role: 'superadmin', assignedLocations: [L1] } as any)
    expect((await getPageScope()).isScoped).toBe(false)
  })
})

describe('sanitizeLocationForClient', () => {
  it('saca el hash del token del agente y las credenciales de Rapiboy', () => {
    const out = sanitizeLocationForClient({
      name: 'Sede',
      printerAgent: { secretHash: 'h', lastSeenAt: null },
      rapiboyConfig: { enabled: true, apiToken: 'enc', webhookSecret: 'enc2' },
    }) as any
    expect(out.printerAgent.secretHash).toBeUndefined()
    expect(out.printerAgent.hasToken).toBe(true)
    expect(out.rapiboyConfig.apiToken).toBeUndefined()
    expect(out.rapiboyConfig.webhookSecret).toBeUndefined()
    expect(out.rapiboyConfig.hasApiToken).toBe(true)
    expect(out.rapiboyConfig.enabled).toBe(true)
  })
})
