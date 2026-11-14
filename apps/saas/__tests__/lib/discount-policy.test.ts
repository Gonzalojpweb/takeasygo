import { describe, it, expect } from 'vitest'
import {
  DEFAULT_DISCOUNT_POLICY,
  DISCOUNT_REASON_IDS,
  canApproveDiscount,
  checkDiscountReason,
  discountForFinalAmount,
  effectivePercent,
  evaluateDiscount,
  normalizeDiscountPolicy,
  policyInForceAt,
  summarizeDiscountsByReason,
  validateDiscountPolicyInput,
  isCheckoutComplete,
  allocatePayments,
  type DiscountPolicy,
} from '@takeasygo/business'

// Política de descuentos (14/11/2026) — reglas puras compartidas por server, POS y panel.

const amounts = (gross: number, discount: number, previous = 0) => ({ grossCents: gross, discountCents: discount, previousDiscountCents: previous })

function withRoles(patch: Partial<Record<'cashier' | 'manager' | 'admin', Partial<DiscountPolicy['roles']['cashier']>>>): DiscountPolicy {
  const d = DEFAULT_DISCOUNT_POLICY
  return normalizeDiscountPolicy({
    ...d,
    roles: {
      cashier: { ...d.roles.cashier, ...patch.cashier },
      manager: { ...d.roles.manager, ...patch.manager },
      admin: { ...d.roles.admin, ...patch.admin },
    },
  })
}

describe('motivos', () => {
  it('incluye Acuerdo comercial e Incidencia operativa', () => {
    expect(DISCOUNT_REASON_IDS).toEqual(expect.arrayContaining(['agreement', 'incident']))
  })
  it('«Otro» exige observación siempre; motivo deshabilitado se rechaza', () => {
    const p = normalizeDiscountPolicy({ ...DEFAULT_DISCOUNT_POLICY, allowedReasons: ['courtesy', 'other'], requireNoteFor: [] })
    expect(p.requireNoteFor).toContain('other')
    expect(checkDiscountReason(p, 'other', '')).toMatch(/obligatoria/)
    expect(checkDiscountReason(p, 'staff', null)).toMatch(/no está habilitado/)
    expect(checkDiscountReason(p, 'courtesy', null)).toBeNull()
    expect(checkDiscountReason(p, 'inventado', null)).toMatch(/inválido/)
  })
})

describe('evaluateDiscount', () => {
  it('por defecto reproduce la Fase D: cajero con PIN, encargado y admin solos, mozo nunca', () => {
    const d = DEFAULT_DISCOUNT_POLICY
    expect(evaluateDiscount(d, 'cashier', amounts(35000, 7000)).kind).toBe('approval')
    expect(evaluateDiscount(d, 'manager', amounts(35000, 35000)).kind).toBe('allow')
    expect(evaluateDiscount(d, 'admin', amounts(35000, 7000)).kind).toBe('allow')
    expect(evaluateDiscount(d, 'waiter', amounts(35000, 100)).kind).toBe('deny')
    expect(evaluateDiscount(d, null, amounts(35000, 100)).kind).toBe('deny')
  })

  it('autonomía, aprobación y tope: el límite exacto está permitido (enteros, sin coma flotante)', () => {
    const p = withRoles({ cashier: { autonomyPercent: 10, maxPercent: 30 } })
    expect(evaluateDiscount(p, 'cashier', amounts(35000, 3500)).kind).toBe('allow')
    expect(evaluateDiscount(p, 'cashier', amounts(35000, 3501)).kind).toBe('approval')
    expect(evaluateDiscount(p, 'cashier', amounts(35000, 10500)).kind).toBe('approval')
    expect(evaluateDiscount(p, 'cashier', amounts(35000, 10501)).kind).toBe('deny')
    // 1/3: 33,33… % no debe pasar por un 33 % de autonomía.
    const third = withRoles({ cashier: { autonomyPercent: 33 } })
    expect(evaluateDiscount(third, 'cashier', amounts(300, 100)).kind).toBe('approval')
  })

  it('bajar o mantener un descuento nunca pide autorización', () => {
    const p = withRoles({ cashier: { autonomyPercent: 0 } })
    expect(evaluateDiscount(p, 'cashier', amounts(35000, 3500, 10500)).kind).toBe('allow')
    expect(evaluateDiscount(p, 'cashier', amounts(35000, 3500, 3500)).kind).toBe('allow')
  })

  it('quién puede aprobar: encargado hasta su autonomía; más arriba admin; nadie → deny', () => {
    const p = withRoles({ cashier: { autonomyPercent: 5 }, manager: { autonomyPercent: 20 }, admin: { autonomyPercent: 50 } })
    const small = evaluateDiscount(p, 'cashier', amounts(10000, 1500))
    expect(small).toMatchObject({ kind: 'approval', approverRoles: ['manager', 'admin'] })
    const big = evaluateDiscount(p, 'cashier', amounts(10000, 3000))
    expect(big).toMatchObject({ kind: 'approval', approverRoles: ['admin'] })
    expect(big.kind === 'approval' && big.message).toMatch(/administrador/)
    expect(evaluateDiscount(p, 'cashier', amounts(10000, 6000)).kind).toBe('deny')
    expect(canApproveDiscount(p, 'manager', amounts(10000, 2000))).toBe(true)
    expect(canApproveDiscount(p, 'manager', amounts(10000, 2100))).toBe(false)
    expect(canApproveDiscount(p, 'cashier', amounts(10000, 1))).toBe(false)
  })

  it('un encargado por encima de su autonomía necesita a un admin', () => {
    const p = withRoles({ manager: { autonomyPercent: 15 } })
    expect(evaluateDiscount(p, 'manager', amounts(10000, 2000))).toMatchObject({ kind: 'approval', approverRoles: ['admin'] })
  })

  it('rol deshabilitado no descuenta ni con aprobación', () => {
    const p = withRoles({ cashier: { enabled: false } })
    expect(evaluateDiscount(p, 'cashier', amounts(10000, 100)).kind).toBe('deny')
  })

  it('topes por monto', () => {
    const p = withRoles({ cashier: { autonomyPercent: 100, autonomyCents: 1000, maxPercent: 100, maxCents: 5000 } })
    expect(evaluateDiscount(p, 'cashier', amounts(100000, 1000)).kind).toBe('allow')
    expect(evaluateDiscount(p, 'cashier', amounts(100000, 1001)).kind).toBe('approval')
    expect(evaluateDiscount(p, 'cashier', amounts(100000, 5001)).kind).toBe('deny')
  })
})

describe('normalizar y validar la política', () => {
  it('normalize completa, recorta la autonomía al tope y nunca deja al admin sin descontar', () => {
    const p = normalizeDiscountPolicy({ roles: { cashier: { autonomyPercent: 80, maxPercent: 20 }, admin: { enabled: false } }, allowedReasons: [] })
    expect(p.roles.cashier.autonomyPercent).toBe(20)
    expect(p.roles.admin.enabled).toBe(true)
    expect(p.allowedReasons.length).toBe(DISCOUNT_REASON_IDS.length)
    expect(normalizeDiscountPolicy(null)).toEqual(normalizeDiscountPolicy(DEFAULT_DISCOUNT_POLICY))
    expect(normalizeDiscountPolicy({ roles: { cashier: { autonomyPercent: 'x', maxPercent: -3 } } }).roles.cashier).toMatchObject({ autonomyPercent: 0, maxPercent: 100 })
  })

  it('validate es estricto con lo que manda el panel', () => {
    expect(validateDiscountPolicyInput(DEFAULT_DISCOUNT_POLICY).ok).toBe(true)
    const bad = (patch: Record<string, unknown>) =>
      validateDiscountPolicyInput({ ...DEFAULT_DISCOUNT_POLICY, roles: { ...DEFAULT_DISCOUNT_POLICY.roles, cashier: { ...DEFAULT_DISCOUNT_POLICY.roles.cashier, ...patch } } })
    expect(bad({ autonomyPercent: 50, maxPercent: 20 })).toMatchObject({ ok: false })
    expect(bad({ autonomyPercent: 10.5 })).toMatchObject({ ok: false })
    expect(bad({ maxPercent: 101 })).toMatchObject({ ok: false })
    expect(bad({ autonomyCents: -1 })).toMatchObject({ ok: false })
    expect(bad({ maxCents: 1000, autonomyCents: null })).toMatchObject({ ok: false })
    expect(validateDiscountPolicyInput({ ...DEFAULT_DISCOUNT_POLICY, allowedReasons: [] })).toMatchObject({ ok: false })
    expect(validateDiscountPolicyInput({ ...DEFAULT_DISCOUNT_POLICY, roles: { ...DEFAULT_DISCOUNT_POLICY.roles, admin: { ...DEFAULT_DISCOUNT_POLICY.roles.admin, enabled: false } } })).toMatchObject({ ok: false })
    expect(validateDiscountPolicyInput('hola')).toMatchObject({ ok: false })
  })
})

describe('historial de versiones', () => {
  it('devuelve la versión que regía en ese momento', () => {
    const v = (version: number, iso: string) => ({ version, policy: DEFAULT_DISCOUNT_POLICY, validFrom: iso })
    const history = [v(1, '2026-11-01T10:00:00Z'), v(2, '2026-11-10T10:00:00Z'), v(3, '2026-11-14T10:00:00Z')]
    expect(policyInForceAt(history, new Date('2026-11-12T00:00:00Z'))?.version).toBe(2)
    expect(policyInForceAt(history, new Date('2026-11-14T10:00:00Z'))?.version).toBe(3)
    expect(policyInForceAt(history, new Date('2026-10-01T00:00:00Z'))).toBeNull()
  })
})

describe('importe final y porcentaje efectivo', () => {
  it('35.000 → 28.000 = 7.000; final inválido → null', () => {
    expect(discountForFinalAmount(3500000, 2800000)).toBe(700000)
    expect(discountForFinalAmount(3500000, 0)).toBe(3500000)
    expect(discountForFinalAmount(3500000, 3500000)).toBeNull()
    expect(discountForFinalAmount(3500000, -1)).toBeNull()
    expect(discountForFinalAmount(3500000, 10.5)).toBeNull()
  })
  it('% efectivo redondeado hacia arriba', () => {
    expect(effectivePercent({ grossCents: 3500000, discountCents: 700000 })).toBe(20)
    expect(effectivePercent({ grossCents: 300, discountCents: 100 })).toBe(34)
    expect(effectivePercent({ grossCents: 0, discountCents: 0 })).toBe(0)
  })
})

describe('resumen por motivo (Z)', () => {
  it('agrupa por motivo, cuenta ventas una vez por motivo y ordena por importe', () => {
    const z = summarizeDiscountsByReason([
      { grossCents: 10000, lines: [{ reason: 'courtesy', cents: 500 }, { reason: 'courtesy', cents: 500 }] },
      { grossCents: 20000, lines: [{ reason: 'agreement', cents: 4000 }] },
      { grossCents: 5000, lines: [] },
    ])
    expect(z).toEqual({
      totalCents: 5000,
      orderCount: 2,
      grossCents: 30000,
      byReason: [
        { reason: 'agreement', label: 'Acuerdo comercial', cents: 4000, count: 1 },
        { reason: 'courtesy', label: 'Cortesía de la casa', cents: 1000, count: 1 },
      ],
    })
    expect(summarizeDiscountsByReason([{ grossCents: 100, lines: [] }])).toBeNull()
  })
})

describe('cobro de una cuenta en $0 (descuento del 100 %)', () => {
  it('se completa sin partes y cada orden en $0 recibe una parte de $0 en efectivo con id fijo', () => {
    expect(isCheckoutComplete(0, [])).toBe(true)
    expect(isCheckoutComplete(0, [{ amount: 0 }])).toBe(false)
    expect(isCheckoutComplete(100, [])).toBe(false)
    const out = allocatePayments([{ id: 'a', total: 0 }], [])
    expect(out.get('a')).toEqual([{ id: 'zero:a', method: 'cash', amount: 0 }])
  })
  it('mesa con una ronda en $0 y otra con importe: cada una con lo suyo', () => {
    const out = allocatePayments([{ id: 'a', total: 0 }, { id: 'b', total: 500 }], [{ id: 'p1', method: 'cash', amount: 500 }])
    expect(out.get('a')).toEqual([{ id: 'zero:a', method: 'cash', amount: 0 }])
    expect(out.get('b')).toEqual([{ id: 'p1', method: 'cash', amount: 500 }])
  })
})
