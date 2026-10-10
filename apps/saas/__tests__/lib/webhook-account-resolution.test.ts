import { describe, it, expect, vi } from 'vitest'

// Mocks mínimos para cargar @/lib/mercadopago sin tocar DB.
vi.mock('@/lib/mongoose', () => ({ connectDB: vi.fn() }))
vi.mock('@/models/Tenant', () => ({ default: { findOne: vi.fn(), findById: vi.fn() } }))

import {
  resolveWebhookProcessAccount,
  type ResolvedMpAccount,
} from '@/lib/mercadopago'

/**
 * Webhook MP — resolución de cuenta con external_reference / ?account= manipulados.
 *
 * Propiedad de seguridad: la cuenta a procesar sale del `payment.mpAccountId`
 * guardado en la Order (fuente de verdad), NO del `?account=` del webhook ni de
 * la config/modo actual del tenant. Un atacante no puede redirigir el pago.
 *
 * La firma HMAC válida (try-all-secrets) es condición previa para llegar acá;
 * ese tramo se cubre en multi-account-chain.test.ts y pos-webhook-signature.test.ts.
 */

function account(id: string, label: string, isActive = false): ResolvedMpAccount {
  return {
    accountId: id,
    accessToken: `enc:${id}`,
    publicKey: `enc:${id}`,
    webhookSecret: `enc:${id}`,
    oauthAccessToken: null,
    oauthIsConnected: false,
    oauthExpiresAt: null,
    commissionPercent: null,
    label,
  }
}

function tenantWith(accounts: ResolvedMpAccount[]) {
  return { mpAccounts: accounts.map((a) => ({ _id: a.accountId, ...a })) }
}

const acc1 = account('acc1', 'Principal', true)
const acc2 = account('acc2', 'Secundaria')
const tenant = tenantWith([acc1, acc2])

describe('resolveWebhookProcessAccount — la Order es fuente de verdad', () => {
  it('usa la cuenta de la Order aunque la firma haya validado en otra cuenta', () => {
    const decision = resolveWebhookProcessAccount({
      tenant,
      orderMpAccountId: 'acc2',
      orderNumber: 'ORD-2',
      signatureMatchedAccount: acc1, // p.ej. firma enmascarada / cuenta activa
      urlAccount: null,
    })
    expect(decision.status).toBe('process')
    if (decision.status !== 'process') return
    expect(decision.account.accountId).toBe('acc2')
    expect(decision.accountSource).toBe('order')
  })

  it('?account= manipulado (ajeno a la Order) NO redirige el pago', () => {
    const decision = resolveWebhookProcessAccount({
      tenant,
      orderMpAccountId: 'acc2',
      orderNumber: 'ORD-2',
      signatureMatchedAccount: acc1,
      urlAccount: 'acc1', // hint falsificado
    })
    expect(decision.status).toBe('process')
    if (decision.status !== 'process') return
    expect(decision.account.accountId).toBe('acc2')
    expect(decision.hintMismatch).toBe(true)
  })

  it('Order sin mpAccountId → fallback a la cuenta cuya firma validó (legado)', () => {
    const decision = resolveWebhookProcessAccount({
      tenant,
      orderMpAccountId: null,
      orderNumber: 'ORD-1',
      signatureMatchedAccount: acc1,
      urlAccount: null,
    })
    expect(decision.status).toBe('process')
    if (decision.status !== 'process') return
    expect(decision.account.accountId).toBe('acc1')
    expect(decision.accountSource).toBe('signature')
  })

  it('Order.mpAccountId apunta a una cuenta de OTRO tenant → orphan (no procesa)', () => {
    const decision = resolveWebhookProcessAccount({
      tenant,
      orderMpAccountId: 'foreign-acc',
      orderNumber: 'ORD-X',
      signatureMatchedAccount: acc1,
      urlAccount: null,
    })
    expect(decision.status).toBe('orphan')
    if (decision.status !== 'orphan') return
    expect(decision.accountId).toBe('foreign-acc')
  })

  it('Order.mpAccountId apunta a cuenta borrada → orphan (revisión manual)', () => {
    const decision = resolveWebhookProcessAccount({
      tenant,
      orderMpAccountId: 'acc-deleted',
      orderNumber: 'ORD-D',
      signatureMatchedAccount: acc1,
      urlAccount: null,
    })
    expect(decision.status).toBe('orphan')
  })

  it('?account= igual a la Order → sin mismatch', () => {
    const decision = resolveWebhookProcessAccount({
      tenant,
      orderMpAccountId: 'acc2',
      orderNumber: 'ORD-2',
      signatureMatchedAccount: acc2,
      urlAccount: 'acc2',
    })
    expect(decision.status).toBe('process')
    if (decision.status !== 'process') return
    expect(decision.hintMismatch).toBe(false)
  })
})
