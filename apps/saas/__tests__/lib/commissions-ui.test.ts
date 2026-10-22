// ============================================================================
// commissions-ui.test.ts — cuándo avisar y qué decirle al comercio
// ============================================================================

import { describe, it, expect } from 'vitest'
import { POPUP_REPEAT_MS, alertCopy, isHeadlineView, originMessage, pesos, shouldPopup } from '@/lib/commissions-ui'

describe('cartel grande del total a pagar: dashboard y pedidos', () => {
  it('se muestra en el dashboard y en pedidos (con o sin barra final)', () => {
    expect(isHeadlineView('/keke/admin', 'keke')).toBe(true)
    expect(isHeadlineView('/keke/admin/', 'keke')).toBe(true)
    expect(isHeadlineView('/keke/admin/orders', 'keke')).toBe(true)
    expect(isHeadlineView('/keke/admin/orders/history', 'keke')).toBe(true)
  })
  it('en el resto de las vistas queda la barra', () => {
    expect(isHeadlineView('/keke/admin/menu', 'keke')).toBe(false)
    expect(isHeadlineView('/keke/admin/commissions', 'keke')).toBe(false)
    expect(isHeadlineView('/keke/admin/ordersx', 'keke')).toBe(false)
    expect(isHeadlineView('/otro/admin', 'keke')).toBe(false)
    expect(isHeadlineView(null, 'keke')).toBe(false)
  })
})

const H = 3_600_000

describe('golpe en pantalla: cuándo y con qué insistencia', () => {
  it('vencida: la primera vez, si cambia el monto o el nivel, y cada 2 h', () => {
    const now = 1_000_000_000
    expect(shouldPopup('vencida', 5000, null, now)).toBe(true)
    const last = { level: 'vencida' as const, cents: 5000, at: now }
    expect(shouldPopup('vencida', 5000, last, now + H)).toBe(false)
    expect(shouldPopup('vencida', 5000, last, now + 2 * H)).toBe(true)
    expect(shouldPopup('vencida', 7000, last, now + 1)).toBe(true) // creció la deuda
  })
  it('pendiente: una vez por día; si pasa a vencida, avisa enseguida', () => {
    const now = 2_000_000_000
    const last = { level: 'pendiente' as const, cents: 3000, at: now }
    expect(shouldPopup('pendiente', 3000, last, now + 23 * H)).toBe(false)
    expect(shouldPopup('pendiente', 3000, last, now + 24 * H)).toBe(true)
    expect(shouldPopup('vencida', 3000, last, now + 1)).toBe(true)
  })
  it('acumulada o sin deuda: nunca golpea', () => {
    expect(POPUP_REPEAT_MS.acumulada).toBeNull()
    expect(shouldPopup('acumulada', 9000, null, 1)).toBe(false)
    expect(shouldPopup('none', 0, null, 1)).toBe(false)
    expect(shouldPopup('vencida', 0, null, 1)).toBe(false)
  })
})

describe('textos: respetuosos y sin afirmar de más', () => {
  const amounts = { commissionCents: 50_000, byCustomerCents: 50_000, byRestaurantCents: 0 }
  it('"no sale de tu bolsillo" SOLO cuando el cliente la pagó', () => {
    expect(originMessage('customer', amounts).title).toBe('No sale de tu bolsillo')
    expect(originMessage('customer', amounts).body).toMatch(/no tocan tu precio de carta ni tu margen/i)
    for (const origin of ['restaurant', 'shared', 'unknown'] as const) {
      const m = originMessage(origin, { commissionCents: 50_000, byCustomerCents: 20_000, byRestaurantCents: 30_000 })
      expect(m.title).not.toMatch(/bolsillo/i)
      expect(m.body).not.toMatch(/no tocan tu .*margen/i)
    }
  })
  // Pedidos ANTERIORES al 22/10/2026 (desde entonces el cliente paga siempre la comisión entera).
  it('pedido viejo sin cargo al cliente: lo dice y aclara que ya no pasa', () => {
    const m = originMessage('restaurant', { commissionCents: 40_000, byCustomerCents: 0, byRestaurantCents: 40_000 })
    expect(m.body).toMatch(/no se le recargó al cliente/)
    expect(m.body).toMatch(/la paga siempre el cliente/)
  })
  it('pedido viejo con cargo parcial: muestra lo que pagó el cliente y aclara que ya no pasa', () => {
    const m = originMessage('shared', { commissionCents: 50_000, byCustomerCents: 20_000, byRestaurantCents: 30_000 })
    expect(m.body).toContain(pesos(20_000))
    expect(m.body).toContain(pesos(50_000))
    expect(m.body).toMatch(/no vuelve a pasar/)
  })
  it('aviso según el nivel', () => {
    const base = { overdue: { cents: 0, weeks: 0 }, pending: { cents: 0, weeks: 0, nextDueAt: null }, accrued: { cents: 0 } }
    expect(alertCopy({ ...base, level: 'none' })).toBeNull()
    expect(alertCopy({ ...base, level: 'vencida', overdue: { cents: 30_000, weeks: 2 }, pending: { cents: 10_000, weeks: 1, nextDueAt: null } })?.body).toMatch(/2 semanas cerradas.*total a pagar es \$400,00/)
    expect(alertCopy({ ...base, level: 'pendiente', pending: { cents: 10_000, weeks: 1, nextDueAt: '2026-10-26T03:00:00Z' } })?.title).toMatch(/liquidación semanal está lista/)
  })
})
