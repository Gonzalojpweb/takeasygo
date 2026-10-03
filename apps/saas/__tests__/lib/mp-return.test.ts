import { describe, it, expect } from 'vitest'
import {
  parseMpReturnOutcome,
  parseMpStatusDetail,
  mpStatusDetailMessage,
} from '@/lib/mp-return'

const sp = (o: Record<string, string>) => o

describe('parseMpReturnOutcome', () => {
  it('detecta rechazo por status=rejected', () => {
    expect(parseMpReturnOutcome(sp({ status: 'rejected' }))).toBe('rejected')
  })

  it('detecta rechazo por collection_status (fallback)', () => {
    expect(parseMpReturnOutcome(sp({ collection_status: 'rejected' }))).toBe('rejected')
  })

  it('detecta rechazo por payment_status (fallback)', () => {
    expect(parseMpReturnOutcome(sp({ payment_status: 'cancelled' }))).toBe('rejected')
  })

  it('detecta aprobado', () => {
    expect(parseMpReturnOutcome(sp({ status: 'approved' }))).toBe('approved')
    expect(parseMpReturnOutcome(sp({ status: 'accredited' }))).toBe('approved')
  })

  it('detecta pendiente', () => {
    expect(parseMpReturnOutcome(sp({ status: 'pending' }))).toBe('pending')
    expect(parseMpReturnOutcome(sp({ status: 'in_process' }))).toBe('pending')
  })

  it('es case-insensitive', () => {
    expect(parseMpReturnOutcome(sp({ status: 'REJECTED' }))).toBe('rejected')
  })

  it('devuelve null cuando no hay parámetros de MP (link a mano)', () => {
    expect(parseMpReturnOutcome({})).toBeNull()
    expect(parseMpReturnOutcome(sp({ foo: 'bar' }))).toBeNull()
  })

  it('devuelve null para valores que no reconoce', () => {
    expect(parseMpReturnOutcome(sp({ status: 'whoknows' }))).toBeNull()
  })

  it('usa el primer valor si mandan arrays repetidos', () => {
    expect(parseMpReturnOutcome({ status: ['rejected', 'approved'] })).toBe('rejected')
  })

  it('prefiere `status` sobre los fallbacks cuando hay varios', () => {
    expect(parseMpReturnOutcome(sp({ status: 'approved', collection_status: 'rejected' }))).toBe('approved')
  })
})

describe('parseMpStatusDetail', () => {
  it('lee status_detail', () => {
    expect(parseMpStatusDetail(sp({ status_detail: 'cc_rejected_insufficient_amount' })))
      .toBe('cc_rejected_insufficient_amount')
  })

  it('cae a `cause` si no hay status_detail', () => {
    expect(parseMpStatusDetail(sp({ cause: 'expired_token' }))).toBe('expired_token')
  })

  it('devuelve undefined si no hay nada', () => {
    expect(parseMpStatusDetail({})).toBeUndefined()
  })
})

describe('mpStatusDetailMessage', () => {
  it('traduce motivos comunes de rechazo de tarjeta', () => {
    expect(mpStatusDetailMessage('cc_rejected_insufficient_amount')).toBe('Saldo insuficiente en la tarjeta.')
    expect(mpStatusDetailMessage('cc_rejected_expired_card')).toBe('La tarjeta está vencida.')
    expect(mpStatusDetailMessage('cc_rejected_call_for_authorize')).toContain('autorización')
  })

  it('devuelve null para detalle desconocido (usa mensaje genérico)', () => {
    expect(mpStatusDetailMessage('some_new_mp_reason')).toBeNull()
  })

  it('devuelve null sin detalle', () => {
    expect(mpStatusDetailMessage(undefined)).toBeNull()
    expect(mpStatusDetailMessage(null)).toBeNull()
    expect(mpStatusDetailMessage('')).toBeNull()
  })
})
