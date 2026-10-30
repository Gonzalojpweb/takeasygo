import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DELIVERY_PLATFORM_LIST, validateDeliveryPlatforms, deliveryCommissionCents } from '@takeasygo/business'
import { DELIVERY_PLATFORM_IDS } from '@/lib/metrics/sales'

/** Fase 5 (29/10/2026) — deliverys externos: validación, comisión y una sola lista. */

describe('deliverys externos', () => {
  it('valida % (0 a 60, 2 decimales), quién cobra y plataformas conocidas', () => {
    expect(validateDeliveryPlatforms([{ id: 'rappi', enabled: true, commissionPercent: 27.5, settlement: 'platform' }]).ok).toBe(true)
    expect(validateDeliveryPlatforms([{ id: 'rappi', commissionPercent: 61, settlement: 'platform' }]).ok).toBe(false)
    expect(validateDeliveryPlatforms([{ id: 'rappi', commissionPercent: 10.123, settlement: 'platform' }]).ok).toBe(false)
    expect(validateDeliveryPlatforms([{ id: 'glovo', commissionPercent: 10, settlement: 'platform' }]).ok).toBe(false)
    expect(validateDeliveryPlatforms([{ id: 'rappi', commissionPercent: 10, settlement: 'otro' }]).ok).toBe(false)
    expect(validateDeliveryPlatforms([{ id: 'rappi', commissionPercent: 10, settlement: 'local' }, { id: 'rappi', commissionPercent: 5, settlement: 'local' }]).ok).toBe(false)
  })

  it('la comisión se redondea al centavo', () => {
    expect(deliveryCommissionCents(1_000_000, 27.5)).toBe(275_000)
    expect(deliveryCommissionCents(333, 25)).toBe(83)
  })

  it('la lista de plataformas es la misma en business, en las métricas del SaaS y en el POS', () => {
    const ids = DELIVERY_PLATFORM_LIST.map((p) => p.id)
    expect([...DELIVERY_PLATFORM_IDS].sort()).toEqual([...ids].sort())
    const pos = readFileSync(join(__dirname, '..', '..', '..', 'pos', 'src', 'services', 'channels.ts'), 'utf8')
    const posIds = [...pos.matchAll(/\{ id: "([a-z_]+)", label: "/g)].map((m) => m[1])
    expect(posIds.sort()).toEqual([...ids].sort())
  })
})
