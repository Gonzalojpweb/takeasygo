// ============================================================================
// push-sede-scope.test.ts — Filtro de sede en los pushes del panel admin
// ============================================================================
// `sendAdminPushNotification(..., locationId)` filtra los subs con stamp de
// rol/assignedLocations con la misma regla que `canAccessLocation`:
//   - superadmin (o sin stamp legacy) → recibe
//   - con assignedLocations → solo si incluyen la sede del pedido
// Subs legacy sin stamp (anteriores al deploy) reciben todo hasta re-suscribirse.
// Sin locationId (legacy) → sin filtro (no regresión para callers viejos).
//
// Ejecutar: npx vitest run __tests__/lib/push-sede-scope.test.ts
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const mockFindLean = vi.fn()
  const mockFind = vi.fn(() => ({ lean: mockFindLean }))
  const mockDeleteOne = vi.fn()
  const mockSendNotification = vi.fn()
  const mockSetVapidDetails = vi.fn()
  const mockCanAccess = vi.fn()
  const mockToPesos = vi.fn((cents: number) => cents / 100)
  return { mockFindLean, mockFind, mockDeleteOne, mockSendNotification, mockSetVapidDetails, mockCanAccess, mockToPesos }
})

vi.mock('@/models/PushSubscription', () => ({
  default: {
    find: (q: unknown) => mocks.mockFind(q),
    deleteOne: (q: unknown) => mocks.mockDeleteOne(q),
  },
}))

vi.mock('web-push', () => ({
  default: {
    sendNotification: (...args: unknown[]) => mocks.mockSendNotification(...args),
    setVapidDetails: (...args: unknown[]) => mocks.mockSetVapidDetails(...args),
  },
}))

vi.mock('@/lib/plans', () => ({
  canAccess: (...args: unknown[]) => mocks.mockCanAccess(...args),
}))

vi.mock('@takeasygo/business', () => ({
  toPesos: (...args: unknown[]) => mocks.mockToPesos(...args),
}))

// canAccessLocation queda REAL: es la semántica de referencia del repo.
import { sendAdminPushNotification } from '@/lib/push'

const TENANT_ID = '507f1f77bcf86cd799439011'
const L1 = '6a31465d3c5154208ffa079c' // sede propia
const L2 = '6a6d3539833c88d2da1b6a7b' // sede ajena (la del pedido)

function sub(id: string, extra: Record<string, unknown> = {}) {
  return { _id: id, endpoint: `e-${id}`, p256dh: 'p', auth: 'a', ...extra }
}

function sentEndpoints(): string[] {
  return mocks.mockSendNotification.mock.calls.map((c) => c[0].endpoint)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.mockSetVapidDetails.mockReturnValue(undefined)
  mocks.mockDeleteOne.mockResolvedValue(undefined)
  mocks.mockCanAccess.mockReturnValue(true)
  mocks.mockSendNotification.mockResolvedValue({ statusCode: 201 })
})

describe('sendAdminPushNotification con locationId — filtro por sede', () => {
  const ALL_SUBS = [
    sub('legacy'),                                  // sin stamp → recibe todo
    sub('mgr-l1', { role: 'manager', assignedLocations: [L1] }), // sede ajena al pedido
    sub('mgr-l2', { role: 'manager', assignedLocations: [L2] }), // sede del pedido
    sub('admin-l1', { role: 'admin', assignedLocations: [L1] }), // admin con alcance acotado
    sub('super', { role: 'superadmin', assignedLocations: [L1] }), // superadmin → siempre
  ]

  it('pedido de L2: recibe legacy + de L2 + superadmin; NO reciben managers de L1', async () => {
    mocks.mockFindLean.mockResolvedValue(ALL_SUBS)

    await sendAdminPushNotification(
      TENANT_ID, 'full', 'Chopis Burger', 'chopisburger', 'ISO-9', 5000, 'Juan', L2
    )

    expect(sentEndpoints()).toEqual(['e-legacy', 'e-mgr-l2', 'e-super'])
    expect(mocks.mockSendNotification).toHaveBeenCalledTimes(3)
  })

  it('pedido de L1: el manager de L1 sí recibe y el de L2 no', async () => {
    mocks.mockFindLean.mockResolvedValue(ALL_SUBS)

    await sendAdminPushNotification(
      TENANT_ID, 'full', 'Chopis Burger', 'chopisburger', 'ISO-9', 5000, 'Juan', L1
    )

    expect(sentEndpoints()).toEqual(['e-legacy', 'e-mgr-l1', 'e-admin-l1', 'e-super'])
  })

  it('todos los subs son de otra sede (sin legacy) → no envía nada', async () => {
    mocks.mockFindLean.mockResolvedValue([
      sub('mgr-l1', { role: 'manager', assignedLocations: [L1] }),
      sub('admin-l1', { role: 'admin', assignedLocations: [L1] }),
    ])

    await sendAdminPushNotification(
      TENANT_ID, 'full', 'Chopis Burger', 'chopisburger', 'ISO-9', 5000, 'Juan', L2
    )

    expect(mocks.mockSendNotification).not.toHaveBeenCalled()
  })

  it('sin locationId (caller legacy) → envía a todos, sin filtro (no regresión)', async () => {
    mocks.mockFindLean.mockResolvedValue(ALL_SUBS)

    await sendAdminPushNotification(
      TENANT_ID, 'full', 'Chopis Burger', 'chopisburger', 'ISO-9', 5000, 'Juan'
    )

    expect(mocks.mockSendNotification).toHaveBeenCalledTimes(5)
  })
})
