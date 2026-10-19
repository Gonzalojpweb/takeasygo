import { describe, it, expect, vi, beforeEach } from 'vitest'

const locationFindById = vi.fn()
vi.mock('@/models/Location', () => ({
  default: { findById: (...args: unknown[]) => locationFindById(...args) },
}))

import {
  resolveTransferAccountForLocation,
  pickAdminWhatsApp,
  resolveAdminWhatsApp,
} from '@/lib/location-resolvers'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function account(id: string, alias: string, isActive: boolean) {
  return {
    _id: id,
    label: `Cuenta ${id}`,
    alias,
    cbu: `cbu-${id}`,
    cvu: null,
    bankName: 'Banco',
    holderName: 'Titular',
    isActive,
  }
}

const ACTIVE_ID = '64b0000000000000000000a1'
const INACTIVE_ID = '64b0000000000000000000a2'
const DELETED_ID = '64b0000000000000000000a9'

function makeTenant(overrides: Record<string, unknown> = {}) {
  return {
    _id: '64b0000000000000000000t1',
    transferAccounts: [
      account(ACTIVE_ID, 'alias.activa', true),
      account(INACTIVE_ID, 'alias.sede', false),
    ],
    transfer: { enabled: true, alias: 'legacy.alias', cbu: '0000000000000000000000' },
    notifications: {
      whatsappPhone: '+5491100000000',
      notifyOnOrder: true,
      notifyOnReservation: true,
    },
    ...overrides,
  }
}

beforeEach(() => {
  locationFindById.mockReset()
})

// ── resolveTransferAccountForLocation ────────────────────────────────────────

describe('resolveTransferAccountForLocation', () => {
  it('usa el override de la sede aunque la cuenta NO esté activa globalmente (existence-wins)', () => {
    const resolved = resolveTransferAccountForLocation(makeTenant(), INACTIVE_ID)
    expect(resolved).not.toBeNull()
    expect(resolved!.accountId).toBe(INACTIVE_ID)
    expect(resolved!.alias).toBe('alias.sede')
  })

  it('usa el override cuando la cuenta existe y está activa', () => {
    const resolved = resolveTransferAccountForLocation(makeTenant(), ACTIVE_ID)
    expect(resolved!.accountId).toBe(ACTIVE_ID)
    expect(resolved!.alias).toBe('alias.activa')
  })

  it('override apuntando a una cuenta BORRADA → fallback a la cuenta activa del tenant', () => {
    const resolved = resolveTransferAccountForLocation(makeTenant(), DELETED_ID)
    expect(resolved).not.toBeNull()
    expect(resolved!.accountId).toBe(ACTIVE_ID)
    expect(resolved!.alias).toBe('alias.activa')
  })

  it('sin override → cuenta activa del tenant (comportamiento histórico)', () => {
    const resolved = resolveTransferAccountForLocation(makeTenant(), null)
    expect(resolved!.accountId).toBe(ACTIVE_ID)
  })

  it('override vacío = hereda (trata como sin override)', () => {
    const resolved = resolveTransferAccountForLocation(makeTenant(), '')
    expect(resolved!.accountId).toBe(ACTIVE_ID)
  })

  it('sin cuentas[] → legacy tenant.transfer (accountId null)', () => {
    const tenant = makeTenant({ transferAccounts: [] })
    const resolved = resolveTransferAccountForLocation(tenant, null)
    expect(resolved).not.toBeNull()
    expect(resolved!.accountId).toBeNull()
    expect(resolved!.alias).toBe('legacy.alias')
    expect(resolved!.cbu).toBe('0000000000000000000000')
  })

  it('sin cuentas y sin legacy → null', () => {
    const tenant = makeTenant({ transferAccounts: [], transfer: { enabled: false } })
    expect(resolveTransferAccountForLocation(tenant, null)).toBeNull()
  })

  it('ninguna activa ni legacy → null (pero override existente sigue ganando)', () => {
    const tenant = makeTenant({
      transferAccounts: [account(INACTIVE_ID, 'solo.sede', false)],
      transfer: { enabled: false },
    })
    expect(resolveTransferAccountForLocation(tenant, null)).toBeNull()
    const withOverride = resolveTransferAccountForLocation(tenant, INACTIVE_ID)
    expect(withOverride!.alias).toBe('solo.sede')
  })
})

// ── pickAdminWhatsApp ────────────────────────────────────────────────────────

describe('pickAdminWhatsApp', () => {
  it('el WhatsApp de la sede pisa al general', () => {
    const target = pickAdminWhatsApp(makeTenant(), { whatsappPhone: '+5491122223333' })
    expect(target.phone).toBe('+5491122223333')
  })

  it('override vacío o null → hereda el WhatsApp general', () => {
    expect(pickAdminWhatsApp(makeTenant(), { whatsappPhone: '' }).phone).toBe('+5491100000000')
    expect(pickAdminWhatsApp(makeTenant(), { whatsappPhone: null }).phone).toBe('+5491100000000')
    expect(pickAdminWhatsApp(makeTenant(), null).phone).toBe('+5491100000000')
  })

  it('sin WhatsApp de la sede ni global → null (no se notifica)', () => {
    const tenant = makeTenant({ notifications: { whatsappPhone: null } })
    expect(pickAdminWhatsApp(tenant, null).phone).toBeNull()
  })

  it('flags: override de la sede gana sobre el global', () => {
    const target = pickAdminWhatsApp(makeTenant(), { notifyOnOrder: false, notifyOnReservation: false })
    expect(target.notifyOnOrder).toBe(false)
    expect(target.notifyOnReservation).toBe(false)
  })

  it('flags: null en la sede hereda el global', () => {
    const target = pickAdminWhatsApp(makeTenant(), { notifyOnOrder: null, notifyOnReservation: null })
    expect(target.notifyOnOrder).toBe(true)
    expect(target.notifyOnReservation).toBe(true)
  })

  it('flags: no inyecta defaults — si el global falta queda undefined (cada call site conserva su chequeo)', () => {
    const tenant = makeTenant({ notifications: undefined })
    const target = pickAdminWhatsApp(tenant, null)
    expect(target.notifyOnOrder).toBeUndefined()
    expect(target.notifyOnReservation).toBeUndefined()
  })
})

// ── resolveAdminWhatsApp (con Location mockeado) ─────────────────────────────

function mockLocationQuery(doc: unknown) {
  locationFindById.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(doc) }),
  })
}

describe('resolveAdminWhatsApp', () => {
  it('sin locationId → resuelve solo contra el tenant (no consulta la sede)', async () => {
    const target = await resolveAdminWhatsApp(makeTenant(), null)
    expect(target.phone).toBe('+5491100000000')
    expect(locationFindById).not.toHaveBeenCalled()
  })

  it('con la sede del MISMO tenant → usa los overrides de la sede', async () => {
    mockLocationQuery({
      tenantId: '64b0000000000000000000t1',
      settings: { whatsappPhone: '+5491155556666', notifyOnOrder: false },
    })
    const target = await resolveAdminWhatsApp(makeTenant(), '64b0000000000000000000l1')
    expect(target.phone).toBe('+5491155556666')
    expect(target.notifyOnOrder).toBe(false)
    expect(target.notifyOnReservation).toBe(true)
  })

  it('la sede pertenece a OTRO tenant → ignora sus overrides (anti cross-tenant)', async () => {
    mockLocationQuery({
      tenantId: '64b0000000000000000000t2',
      settings: { whatsappPhone: '+5491199998888' },
    })
    const target = await resolveAdminWhatsApp(makeTenant(), '64b0000000000000000000l1')
    expect(target.phone).toBe('+5491100000000')
  })

  it('la sede no existe → fallback al global', async () => {
    mockLocationQuery(null)
    const target = await resolveAdminWhatsApp(makeTenant(), '64b0000000000000000000l1')
    expect(target.phone).toBe('+5491100000000')
  })

  it('error consultando → fallback al global (las notificaciones no deben caer)', async () => {
    locationFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.reject(new Error('db down')) }),
    })
    const target = await resolveAdminWhatsApp(makeTenant(), '64b0000000000000000000l1')
    expect(target.phone).toBe('+5491100000000')
  })
})
