/**
 * Link de WhatsApp (api.whatsapp.com) para que el cliente le escriba al local
 * apenas termina su reserva — mismo patrón que el botón del tracking de
 * pedidos por transferencia/MP. Sin imports de servidor: se usa tanto en el
 * ReservaForm (client) como en la página de éxito (server).
 */

type ReservationLinkData = {
  reservationNumber?: string | null
  name: string
  date: string
  time: string
  partySize: number
  spaceName?: string | null
  notes?: string | null
  locationName?: string | null
  /** Seña pagada (o en proceso). Texto ya formateado, ej. "$5.000". */
  depositLabel?: string | null
  pendingPayment?: boolean
}

/** Teléfono destino: override por sede, si no el global del tenant (igual que pedidos). */
export function pickReservationWhatsAppPhone(
  tenant: { notifications?: { whatsappPhone?: string | null } | null } | null | undefined,
  location: { settings?: { whatsappPhone?: string | null } | null } | null | undefined
): string | null {
  return location?.settings?.whatsappPhone || tenant?.notifications?.whatsappPhone || null
}

function formatDateEs(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const monthIdx = parseInt(m) - 1
  if (!y || !d || !(monthIdx >= 0 && monthIdx < 12)) return dateStr
  return `${parseInt(d)} de ${months[monthIdx]} de ${y}`
}

export function buildReservationWhatsAppLink(phone: string, data: ReservationLinkData): string | null {
  const cleanPhone = phone.replace(/[^\d]/g, '')
  if (!cleanPhone) return null

  const number = data.reservationNumber ? ` #${data.reservationNumber}` : ''
  let msg = `Hola, soy ${data.name.trim() || 'un cliente'} y realicé la reserva${number}.

📅 *${formatDateEs(data.date)} a las ${data.time}*
👥 ${data.partySize} ${data.partySize === 1 ? 'persona' : 'personas'}`

  if (data.spaceName) msg += `\n📍 Espacio: ${data.spaceName}`
  if (data.locationName) msg += `\n🏠 Sede: ${data.locationName}`
  if (data.depositLabel) {
    msg += data.pendingPayment
      ? `\n💳 Seña ${data.depositLabel} (pago en proceso)`
      : `\n💳 Seña ${data.depositLabel} pagada`
  }
  if (data.notes?.trim()) msg += `\n📝 ${data.notes.trim()}`

  return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`
}
