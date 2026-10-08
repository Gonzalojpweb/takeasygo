import { describe, it, expect, beforeEach } from 'vitest'
import './setup'

import mongoose from 'mongoose'
import Tenant from '@/models/Tenant'
import CustomerEvent from '@/models/CustomerEvent'
import { fetchNavigationFunnel, fetchDashboardMetrics } from '@/lib/tia/metrics'

/**
 * Fase 3 — TIA consume el embudo de navegación desde `customerevents`:
 * fetchNavigationFunnel alimenta conversionFunnel + topProducts.mostViewed
 * de fetchDashboardMetrics (fuente primaria; PostHog queda como fallback).
 */

const SLUG = 'tia-nav-test'
const SESSION_A = 'sess-a'
const SESSION_B = 'sess-b'

let tenantId: mongoose.Types.ObjectId
let emptyTenantId: mongoose.Types.ObjectId
let otherTenantId: mongoose.Types.ObjectId

function daysAgo(n: number): Date {
  const d = new Date()
  d.setUTCHours(12, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - n)
  return d
}

function event(tenant: unknown, overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    tenantId: tenant,
    phoneHash: '',
    metadata: { source: 'client_side' },
    ...overrides,
  }
}

beforeEach(async () => {
  const tenant = await Tenant.create({
    name: 'TIA Nav',
    slug: SLUG,
    plan: 'full',
    status: 'active',
    isActive: true,
    pointsConfig: { welcomePoints: 100 },
    paymentSurcharges: { cash: { feePercent: 0 }, transfer: { feePercent: 0 }, mercadopago: { feePercent: 0 } },
  })
  tenantId = tenant._id

  const emptyTenant = await Tenant.create({
    name: 'Empty',
    slug: 'tia-nav-empty',
    plan: 'full',
    status: 'active',
    isActive: true,
    pointsConfig: { welcomePoints: 100 },
    paymentSurcharges: { cash: { feePercent: 0 }, transfer: { feePercent: 0 }, mercadopago: { feePercent: 0 } },
  })
  emptyTenantId = emptyTenant._id

  const otherTenant = await Tenant.create({
    name: 'Other',
    slug: 'tia-nav-other',
    plan: 'full',
    status: 'active',
    isActive: true,
    pointsConfig: { welcomePoints: 100 },
    paymentSurcharges: { cash: { feePercent: 0 }, transfer: { feePercent: 0 }, mercadopago: { feePercent: 0 } },
  })
  otherTenantId = otherTenant._id

  await CustomerEvent.insertMany([
    // Embudo (5 pasos)
    event(tenantId, { type: 'menu_opened', createdAt: daysAgo(1), metadata: { source: 'client_side', sessionId: SESSION_A } }),
    event(tenantId, { type: 'menu_opened', createdAt: daysAgo(2), metadata: { source: 'client_side', sessionId: SESSION_B } }),
    event(tenantId, { type: 'product_view', createdAt: daysAgo(1), data: { itemName: 'Tarta de Carne' }, metadata: { source: 'client_side', sessionId: SESSION_A } }),
    event(tenantId, { type: 'product_view', createdAt: daysAgo(1), data: { itemName: 'Tarta de Carne' }, metadata: { source: 'client_side', sessionId: SESSION_A } }),
    event(tenantId, { type: 'product_view', createdAt: daysAgo(3), data: { itemName: 'Empanada' }, metadata: { source: 'client_side', sessionId: SESSION_B } }),
    event(tenantId, { type: 'cart_add', createdAt: daysAgo(1), data: { itemName: 'Tarta de Carne' }, metadata: { source: 'client_side', sessionId: SESSION_A } }),
    event(tenantId, { type: 'checkout_started', createdAt: daysAgo(1), metadata: { source: 'client_side', sessionId: SESSION_A } }),
    event(tenantId, { type: 'checkout_completed', createdAt: daysAgo(1), metadata: { source: 'order', sessionId: SESSION_A } }),
    // No pertenecen al embudo de 5 pasos
    event(tenantId, { type: 'checkout_submitted', createdAt: daysAgo(1), metadata: { source: 'client_side', sessionId: SESSION_A } }),
    event(tenantId, { type: 'reward_viewed', createdAt: daysAgo(1), metadata: { source: 'client_side', sessionId: SESSION_A } }),
    // Fuera de la ventana de 30 días
    event(tenantId, { type: 'menu_opened', createdAt: daysAgo(40), metadata: { source: 'client_side', sessionId: SESSION_A } }),
    // Otro tenant: no debe colarse en el embudo del tenant principal
    event(otherTenantId, { type: 'menu_opened', createdAt: daysAgo(1), metadata: { source: 'client_side', sessionId: SESSION_A } }),
  ])
})

describe('fetchNavigationFunnel (customerevents → TIA)', () => {
  it('arma el embudo de 5 pasos y el top de vistas desde Mongo', async () => {
    const result = await fetchNavigationFunnel(tenantId, daysAgo(30))
    expect(result).not.toBeNull()
    expect(result!.funnel).toEqual({
      menuOpened: 2,
      dishViewed: 3,
      dishAdded: 1,
      checkoutStarted: 1,
      orderCompleted: 1,
    })
    expect(result!.mostViewed).toEqual([
      { name: 'Tarta de Carne', count: 2 },
      { name: 'Empanada', count: 1 },
    ])
  })

  it('devuelve null cuando el tenant no tiene eventos de navegación', async () => {
    const result = await fetchNavigationFunnel(emptyTenantId, daysAgo(30))
    expect(result).toBeNull()
  })
})

describe('fetchDashboardMetrics', () => {
  it('alimenta conversionFunnel y topProducts.mostViewed desde customerevents', async () => {
    const metrics = await fetchDashboardMetrics(tenantId.toString())

    expect(metrics.conversionFunnel).toEqual({
      menuOpened: 2,
      dishViewed: 3,
      dishAdded: 1,
      checkoutStarted: 1,
      orderCompleted: 1,
    })
    expect(metrics.topProducts.mostViewed).toEqual([
      { name: 'Tarta de Carne', count: 2 },
      { name: 'Empanada', count: 1 },
    ])
  })
})
