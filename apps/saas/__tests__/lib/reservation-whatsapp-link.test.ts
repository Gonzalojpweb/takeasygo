import { describe, it, expect } from 'vitest'
import { buildReservationWhatsAppLink, pickReservationWhatsAppPhone } from '@/lib/reservation-whatsapp-link'

function decodeText(link: string): string {
  return decodeURIComponent(new URL(link).searchParams.get('text') || '')
}

describe('pickReservationWhatsAppPhone', () => {
  it('prioriza el WhatsApp de la sede sobre el global', () => {
    expect(pickReservationWhatsAppPhone(
      { notifications: { whatsappPhone: '111' } },
      { settings: { whatsappPhone: '222' } }
    )).toBe('222')
  })

  it('hereda el global si la sede no tiene', () => {
    expect(pickReservationWhatsAppPhone(
      { notifications: { whatsappPhone: '111' } },
      { settings: { whatsappPhone: null } }
    )).toBe('111')
  })

  it('null si no hay ninguno configurado', () => {
    expect(pickReservationWhatsAppPhone({ notifications: null }, null)).toBeNull()
  })
})

describe('buildReservationWhatsAppLink', () => {
  const base = { reservationNumber: 'R-42', name: 'Ana', date: '2026-10-25', time: '21:00', partySize: 4 }

  it('arma el link con el teléfono limpio y el detalle de la reserva', () => {
    const link = buildReservationWhatsAppLink('+54 9 11 1234-5678', {
      ...base,
      spaceName: 'Terraza',
      locationName: 'Palermo',
      notes: 'Cumpleaños',
    })!
    expect(link.startsWith('https://api.whatsapp.com/send?phone=5491112345678&text=')).toBe(true)
    const text = decodeText(link)
    expect(text).toContain('soy Ana y realicé la reserva #R-42')
    expect(text).toContain('25 de octubre de 2026 a las 21:00')
    expect(text).toContain('4 personas')
    expect(text).toContain('Terraza')
    expect(text).toContain('Palermo')
    expect(text).toContain('Cumpleaños')
  })

  it('indica la seña pagada o en proceso', () => {
    expect(decodeText(buildReservationWhatsAppLink('111', { ...base, depositLabel: '$5.000' })!))
      .toContain('Seña $5.000 pagada')
    expect(decodeText(buildReservationWhatsAppLink('111', { ...base, depositLabel: '$5.000', pendingPayment: true })!))
      .toContain('Seña $5.000 (pago en proceso)')
  })

  it('null si el teléfono no tiene dígitos', () => {
    expect(buildReservationWhatsAppLink('---', base)).toBeNull()
  })
})
