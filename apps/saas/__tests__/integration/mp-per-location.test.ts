// ============================================================================
// mp-per-location.test.ts — Simulaciones MP compartido o por sede (B3)
// ============================================================================
// Verifica que con el flag `mp.perLocation`:
//   1. Flag OFF: siempre cuenta activa del tenant (comportamiento actual).
//   2. Flag ON + mpMode 'shared': cuenta activa (sin cambios).
//   3. Flag ON + mpMode 'perLocation': usa Location.settings.mpAccountId,
//      fallback a activa si la sede no tiene override.
//   4. Fail closed si la sede apunta a cuenta inexistente.
//   5. Webhook valida locationId en modo perLocation.
//
// Ejecutar: npx vitest run __tests__/integration/mp-per-location.test.ts
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import './setup'

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

import { getMpAccountForLocation, getActiveMpAccount, findMpAccountById } from '@/lib/mercadopago'
import { FLAGS } from '@/lib/feature-flags'

// ── Fixtures ──────────────────────────────────────────────────────────

function makeTenant(overrides: Record<string, unknown> = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    slug: 'test-tenant',
    mercadopago: { isConfigured: false, accessToken: null, publicKey: null, webhookSecret: null },
    mpOAuth: {},
    mpAccounts: [
      {
        _id: new mongoose.Types.ObjectId(),
        label: 'Cuenta Principal',
        accessToken: 'enc-token-activa',
        publicKey: 'enc-pk-activa',
        webhookSecret: 'enc-whs-activa',
        isActive: true,
      },
      {
        _id: new mongoose.Types.ObjectId(),
        label: 'Cuenta Saavedra',
        accessToken: 'enc-token-saavedra',
        publicKey: 'enc-pk-saavedra',
        webhookSecret: 'enc-whs-saavedra',
        isActive: false,
      },
    ],
    flags: {},
    mpMode: 'shared',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── 1. Flag OFF: siempre cuenta activa ────────────────────────────────

describe('Flag OFF (default)', () => {
  it('usa cuenta activa aunque la sede tenga override', () => {
    const tenant = makeTenant({
      flags: { [FLAGS.MP_PER_LOCATION]: false },
      mpMode: 'perLocation',
    })
    const locationOverride = tenant.mpAccounts[1]._id.toString()

    const result = getMpAccountForLocation(tenant, locationOverride)

    // Ignora el override, usa la activa
    expect(result?.label).toBe('Cuenta Principal')
    expect(result?.accountId).toBe(tenant.mpAccounts[0]._id.toString())
  })

  it('mpMode perLocation pero flag OFF → cuenta activa', () => {
    const tenant = makeTenant({
      flags: {}, // sin flag = default false
      mpMode: 'perLocation',
    })
    const locationOverride = tenant.mpAccounts[1]._id.toString()

    const result = getMpAccountForLocation(tenant, locationOverride)
    expect(result?.label).toBe('Cuenta Principal')
  })
})

// ── 2. Flag ON + mpMode 'shared' ──────────────────────────────────────

describe('Flag ON + mpMode shared', () => {
  it('usa cuenta activa aunque la sede tenga override', () => {
    const tenant = makeTenant({
      flags: { [FLAGS.MP_PER_LOCATION]: true },
      mpMode: 'shared',
    })
    const locationOverride = tenant.mpAccounts[1]._id.toString()

    const result = getMpAccountForLocation(tenant, locationOverride)
    expect(result?.label).toBe('Cuenta Principal')
  })
})

// ── 3. Flag ON + mpMode 'perLocation' ─────────────────────────────────

describe('Flag ON + mpMode perLocation', () => {
  it('usa el override de la sede cuando está seteado', () => {
    const tenant = makeTenant({
      flags: { [FLAGS.MP_PER_LOCATION]: true },
      mpMode: 'perLocation',
    })
    const locationOverride = tenant.mpAccounts[1]._id.toString()

    const result = getMpAccountForLocation(tenant, locationOverride)
    expect(result?.label).toBe('Cuenta Saavedra')
    expect(result?.accountId).toBe(tenant.mpAccounts[1]._id.toString())
  })

  it('fallback a cuenta activa cuando la sede no tiene override', () => {
    const tenant = makeTenant({
      flags: { [FLAGS.MP_PER_LOCATION]: true },
      mpMode: 'perLocation',
    })

    const result = getMpAccountForLocation(tenant, null)
    expect(result?.label).toBe('Cuenta Principal')
  })

  it('fallback a cuenta activa cuando el override es string vacío', () => {
    const tenant = makeTenant({
      flags: { [FLAGS.MP_PER_LOCATION]: true },
      mpMode: 'perLocation',
    })

    const result = getMpAccountForLocation(tenant, '')
    expect(result?.label).toBe('Cuenta Principal')
  })

  it('fail closed si la sede apunta a cuenta inexistente', () => {
    const tenant = makeTenant({
      flags: { [FLAGS.MP_PER_LOCATION]: true },
      mpMode: 'perLocation',
    })

    const result = getMpAccountForLocation(tenant, 'no-existe-999')
    expect(result).toBeNull()
  })

  it('la cuenta resuelta tiene los campos correctos', () => {
    const tenant = makeTenant({
      flags: { [FLAGS.MP_PER_LOCATION]: true },
      mpMode: 'perLocation',
    })
    const locationOverride = tenant.mpAccounts[1]._id.toString()

    const result = getMpAccountForLocation(tenant, locationOverride)
    expect(result).not.toBeNull()
    expect(result!.accountId).toBe(locationOverride)
    expect(result!.accessToken).toBe('enc-token-saavedra')
    expect(result!.publicKey).toBe('enc-pk-saavedra')
    expect(result!.webhookSecret).toBe('enc-whs-saavedra')
    expect(result!.label).toBe('Cuenta Saavedra')
  })
})

// ── 4. findMpAccountById: webhook resuelve por mpAccountId ────────────

describe('findMpAccountById (webhook)', () => {
  it('encuentra cuenta por _id', () => {
    const tenant = makeTenant()
    const targetId = tenant.mpAccounts[1]._id.toString()

    const result = findMpAccountById(tenant, targetId)
    expect(result).not.toBeNull()
    expect(result!.label).toBe('Cuenta Saavedra')
  })

  it('devuelve null si la cuenta no existe (orphan)', () => {
    const tenant = makeTenant()
    const result = findMpAccountById(tenant, 'borrada-999')
    expect(result).toBeNull()
  })

  it('legacy accountId funciona con tenant que usa mpAccounts', () => {
    const tenant = makeTenant()
    // 'legacy' no está en mpAccounts → null
    const result = findMpAccountById(tenant, 'legacy')
    expect(result).toBeNull()
  })
})

// ── 5. Compatibilidad legacy ──────────────────────────────────────────

describe('Compatibilidad legacy', () => {
  it('tenant sin mpAccounts usa mercadopago legacy como activa', () => {
    const tenant = {
      mercadopago: { isConfigured: true, accessToken: 'enc-legacy', publicKey: 'pk-l', webhookSecret: 'whs-l' },
      mpOAuth: { isConnected: false },
      mpAccounts: [],
      flags: {},
      mpMode: 'shared',
    }

    const result = getActiveMpAccount(tenant)
    expect(result).not.toBeNull()
    expect(result!.accountId).toBe('legacy')
    expect(result!.accessToken).toBe('enc-legacy')
  })

  it('getMpAccountForLocation con flag OFF en tenant legacy → cuenta legacy', () => {
    const tenant = {
      mercadopago: { isConfigured: true, accessToken: 'enc-legacy', publicKey: 'pk-l', webhookSecret: 'whs-l' },
      mpOAuth: { isConnected: false },
      mpAccounts: [],
      flags: {},
      mpMode: 'shared',
    }

    const result = getMpAccountForLocation(tenant, 'cualquier-cosa')
    expect(result?.accountId).toBe('legacy')
  })
})

// ── 6. getActiveMpAccount edge cases ──────────────────────────────────

describe('getActiveMpAccount', () => {
  it('mpAccounts sin ninguna activa → null', () => {
    const tenant = makeTenant({
      mpAccounts: [{ _id: new mongoose.Types.ObjectId(), label: 'Inactiva', isActive: false, accessToken: 'x', publicKey: 'y', webhookSecret: 'z' }],
    })
    const result = getActiveMpAccount(tenant)
    expect(result).toBeNull()
  })

  it('sin mpAccounts ni legacy → null', () => {
    const tenant = { mpAccounts: [], mercadopago: { isConfigured: false }, flags: {} }
    const result = getActiveMpAccount(tenant)
    expect(result).toBeNull()
  })
})
