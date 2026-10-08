import { describe, it, expect, beforeEach } from 'vitest'
import './setup'

import mongoose from 'mongoose'
import Tenant from '@/models/Tenant'
import CustomerEvent from '@/models/CustomerEvent'
import { buildNavigationStats } from '@/lib/reports/navigation'

/**
 * lib/reports/navigation.ts — embudo de navegación para /admin/reports:
 * counts por tipo, sesiones únicas, tasas de conversión y top vistas,
 * acotados al rango activo del filtro de fechas.
 */

let tenantId: mongoose.Types.ObjectId

function daysAgo(n: number): Date {
  const d = new Date()
  d.setUTCHours(12, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - n)
  return d
}

function event(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    tenantId,
    phoneHash: '',
    metadata: { source: 'client_side' },
    ...overrides,
  }
}

beforeEach(async () => {
  const tenant = await Tenant.create({
    name: 'Reports Nav',
    slug: 'reports-nav-test',
    plan: 'full',
    status: 'active',
    isActive: true,
    pointsConfig: { welcomePoints: 100 },
    paymentSurcharges: { cash: { feePercent: 0 }, transfer: { feePercent: 0 }, mercadopago: { feePercent: 0 } },
  })
  tenantId = tenant._id

  await CustomerEvent.insertMany([
    event({ type: 'menu_opened', createdAt: daysAgo(1), metadata: { source: 'client_side', sessionId: 's1' } }),
    event({ type: 'menu_opened', createdAt: daysAgo(2), metadata: { source: 'client_side', sessionId: 's2' } }),
    event({ type: 'product_view', createdAt: daysAgo(1), data: { itemName: 'Milanesa' }, metadata: { source: 'client_side', sessionId: 's1' } }),
    event({ type: 'product_view', createdAt: daysAgo(1), data: { itemName: 'Milanesa' }, metadata: { source: 'client_side', sessionId: 's1' } }),
    event({ type: 'product_view', createdAt: daysAgo(2), data: { itemName: 'Pizza' }, metadata: { source: 'client_side', sessionId: 's2' } }),
    event({ type: 'cart_add', createdAt: daysAgo(1), data: { itemName: 'Milanesa' }, metadata: { source: 'client_side', sessionId: 's1' } }),
    event({ type: 'checkout_started', createdAt: daysAgo(1), metadata: { source: 'client_side', sessionId: 's1' } }),
    event({ type: 'checkout_submitted', createdAt: daysAgo(1), metadata: { source: 'client_side', sessionId: 's1' } }),
    event({ type: 'checkout_completed', createdAt: daysAgo(1), metadata: { source: 'order', sessionId: 's1' } }),
    // Sin sesión real: no aporta sesiones únicas
    event({ type: 'checkout_completed', createdAt: daysAgo(1), metadata: { source: 'order', sessionId: '' } }),
    // Fuera del rango pedido en el test
    event({ type: 'menu_opened', createdAt: daysAgo(30), metadata: { source: 'client_side', sessionId: 'old' } }),
  ])
})

describe('buildNavigationStats', () => {
  it('arma el embudo, sesiones únicas, tasas y top vistas acotados al rango', async () => {
    const stats = await buildNavigationStats(tenantId, daysAgo(7), new Date())

    expect(stats).toEqual({
      menuOpened: 2,
      productView: 3,
      cartAdd: 1,
      checkoutStarted: 1,
      checkoutSubmitted: 1,
      checkoutCompleted: 2,
      uniqueSessions: 2,
      conversion: {
        menuToView: 150,
        viewToAdd: 33.3,
        addToCheckout: 100,
        checkoutToSubmitted: 100,
        submittedToCompleted: 200,
      },
      mostViewed: [
        { name: 'Milanesa', count: 2 },
        { name: 'Pizza', count: 1 },
      ],
    })
  })

  it('devuelve ceros y tasas null cuando no hay eventos en el rango', async () => {
    // Rango sin eventos (todos los seeds son de días previos, a mediodía UTC)
    const stats = await buildNavigationStats(tenantId, new Date(Date.now() - 3_600_000), new Date())

    expect(stats.menuOpened).toBe(0)
    expect(stats.uniqueSessions).toBe(0)
    expect(stats.mostViewed).toEqual([])
    expect(stats.conversion.menuToView).toBeNull()
    expect(stats.conversion.submittedToCompleted).toBeNull()
  })
})
