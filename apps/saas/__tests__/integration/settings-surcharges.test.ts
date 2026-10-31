import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import './setup'

import Tenant from '@/models/Tenant'
import { PUT } from '@/app/api/[tenant]/settings/surcharges/route'
import { requireAuth } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'

/**
 * PUT /api/[tenant]/settings/surcharges — guardado de recargos por método.
 * Bug histórico: el endpoint ignoraba el body y forzaba
 * paymentSurcharges.transfer.feePercent = 0 en cada guardado, así que el
 * recargo propio del comercio para transferencia nunca persistía.
 */

vi.mock('@/lib/mongoose', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/apiAuth', () => ({
  requireAuth: vi.fn().mockResolvedValue(null),
  // Auditoría 30/10/2026: las rutas usan además el rol mínimo (requireTenantRole).
  requireTenantRole: vi.fn().mockResolvedValue(null),
  ADMIN_ROLES: ['admin'],
  MANAGE_ROLES: ['admin', 'manager'],
  CASH_ROLES: ['admin', 'manager', 'cashier'],
  FLOOR_ROLES: ['admin', 'manager', 'cashier', 'staff', 'host', 'waiter'],
}))

vi.mock('@/lib/rbac', () => ({
  enforcePermissionForRequest: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn(),
}))

const SLUG = 'surch-test'

function put(body: unknown) {
  const request = new NextRequest(`http://localhost/api/${SLUG}/settings/surcharges`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return PUT(request, { params: Promise.resolve({ tenant: SLUG }) })
}

beforeEach(async () => {
  vi.mocked(requireAuth).mockResolvedValue(null)
  vi.mocked(enforcePermissionForRequest).mockResolvedValue(null)

  await Tenant.create({
    name: 'Surch Test',
    slug: SLUG,
    plan: 'full',
    status: 'active',
    isActive: true,
    paymentSurcharges: {
      mercadopago: { feePercent: 0 },
      kripton: { feePercent: 0 },
      transfer: { feePercent: 0 },
    },
  })
})

describe('PUT /api/[tenant]/settings/surcharges', () => {
  it('persiste el recargo propio de transferencia (no lo fuerza a 0)', async () => {
    const res = await put({
      mercadopago: { feePercent: 3 },
      kripton: { feePercent: 1 },
      transfer: { feePercent: 2.5 },
    })
    expect(res.status).toBe(200)

    const t = await Tenant.findOne({ slug: SLUG }).lean()
    expect(t!.paymentSurcharges?.transfer?.feePercent).toBe(2.5)
    expect(t!.paymentSurcharges?.mercadopago?.feePercent).toBe(3)
    expect(t!.paymentSurcharges?.kripton?.feePercent).toBe(1)
  })

  it('el recargo persiste VARIAS veces seguidas (simula editar y recargar)', async () => {
    await put({
      mercadopago: { feePercent: 0 },
      kripton: { feePercent: 0 },
      transfer: { feePercent: 4 },
    })
    let t = await Tenant.findOne({ slug: SLUG }).lean()
    expect(t!.paymentSurcharges?.transfer?.feePercent).toBe(4)

    // El admin vuelve a guardar (como al recargar la config y tocar «Guardar»)
    await put({
      mercadopago: { feePercent: 0 },
      kripton: { feePercent: 0 },
      transfer: { feePercent: 4 },
    })
    t = await Tenant.findOne({ slug: SLUG }).lean()
    expect(t!.paymentSurcharges?.transfer?.feePercent).toBe(4)
  })

  it('clampea valores fuera de rango y trata no-numéricos como 0', async () => {
    await put({
      mercadopago: { feePercent: 3 },
      kripton: { feePercent: 0 },
      transfer: { feePercent: 150 },
    })
    let t = await Tenant.findOne({ slug: SLUG }).lean()
    expect(t!.paymentSurcharges?.transfer?.feePercent).toBe(100)

    await put({
      mercadopago: { feePercent: 3 },
      kripton: { feePercent: 0 },
      transfer: { feePercent: 'x' as unknown as number },
    })
    t = await Tenant.findOne({ slug: SLUG }).lean()
    expect(t!.paymentSurcharges?.transfer?.feePercent).toBe(0)
  })

  it('sin transfer en el body (compatibilidad con clientes viejos) queda en 0', async () => {
    const res = await put({
      mercadopago: { feePercent: 2 },
      kripton: { feePercent: 0 },
    })
    expect(res.status).toBe(200)
    const t = await Tenant.findOne({ slug: SLUG }).lean()
    expect(t!.paymentSurcharges?.transfer?.feePercent).toBe(0)
  })
})
