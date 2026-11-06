import { describe, it, expect } from 'vitest'
import { NEW_TENANT_WHATSAPP_ORDER_LINK, whatsappOrderLinkEnabled } from '@/lib/whatsapp-order-link'

// 06/11: WhatsApp en el seguimiento, por comercio y por medio de pago.
describe('WhatsApp en el seguimiento del pedido', () => {
  it('lo decide el superadmin por medio: solo transferencia', () => {
    const f = { whatsappOrderTransfer: true, whatsappOrderMercadoPago: false }
    expect(whatsappOrderLinkEnabled(f, 'transfer')).toBe(true)
    expect(whatsappOrderLinkEnabled(f, 'mercadopago')).toBe(false)
  })

  it('ninguno: apagado en los dos', () => {
    expect(whatsappOrderLinkEnabled(NEW_TENANT_WHATSAPP_ORDER_LINK, 'transfer')).toBe(false)
    expect(whatsappOrderLinkEnabled(NEW_TENANT_WHATSAPP_ORDER_LINK, 'mercadopago')).toBe(false)
  })

  it('comercio anterior sin dato: sigue habilitado (no se corta el circuito de comprobantes)', () => {
    expect(whatsappOrderLinkEnabled({}, 'transfer')).toBe(true)
    expect(whatsappOrderLinkEnabled(undefined, 'mercadopago')).toBe(true)
  })

  it('efectivo u otros medios nunca muestran el botón', () => {
    expect(whatsappOrderLinkEnabled({ whatsappOrderTransfer: true }, 'cash')).toBe(false)
  })
})
