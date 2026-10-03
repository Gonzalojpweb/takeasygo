import { describe, it, expect } from 'vitest'
import { VALID_TRANSITIONS, allowedTransitionsFrom } from '@/lib/order-transitions'

describe('VALID_TRANSITIONS', () => {
  // Regresión del 500: la key `awaiting_payment` no existía, el guard hacía
  // `undefined.includes(...)` y cualquier PATCH manual devolvía HTTP 500.
  // Consecuencia práctica: el admin no podía cancelar un pedido varado.
  it('incluye awaiting_payment como origen', () => {
    expect(VALID_TRANSITIONS).toHaveProperty('awaiting_payment')
    expect(VALID_TRANSITIONS.awaiting_payment).toEqual(['cancelled'])
  })

  it('permite cancelar desde awaiting_payment', () => {
    expect(allowedTransitionsFrom('awaiting_payment')).toContain('cancelled')
  })

  it('NO permite avanzar a preparación sin haber pagado', () => {
    expect(allowedTransitionsFrom('awaiting_payment')).not.toContain('confirmed')
    expect(allowedTransitionsFrom('awaiting_payment')).not.toContain('preparing')
  })

  it('todas las claves son arrays (nunca undefined)', () => {
    for (const [from, tos] of Object.entries(VALID_TRANSITIONS)) {
      expect(Array.isArray(tos), `${from} debe ser array`).toBe(true)
    }
  })

  it('estados terminales no tienen salidas', () => {
    expect(allowedTransitionsFrom('delivered')).toEqual([])
    expect(allowedTransitionsFrom('cancelled')).toEqual([])
  })

  it('allowedTransitionsFrom nunca devuelve undefined para estado desconocido', () => {
    expect(allowedTransitionsFrom('no_existe')).toEqual([])
    expect(allowedTransitionsFrom('')).toEqual([])
  })
})
