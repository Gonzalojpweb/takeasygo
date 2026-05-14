import { sendEmail } from './email'
import PushSubscription from '@/models/PushSubscription'
import webpush from 'web-push'

webpush.setVapidDetails(
  'mailto:clickandthink1@gmail.com',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

type ReservationInfo = {
  reservationNumber: string
  name: string
  phone: string
  email?: string
  clientToken?: string
  date: string
  time: string
  partySize: number
  notes: string
  status: string
}

type TenantInfo = {
  name: string
  slug: string
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${parseInt(d)} de ${months[parseInt(m) - 1]} de ${y}`
}

function buildStyles(): string {
  return `
    body { margin: 0; padding: 0; background: #f5f3f0; }
    .container { font-family: 'DM Sans', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 32px; background: #ffffff; border-radius: 16px; border: 1px solid #ede9e5; }
    .header { margin-bottom: 32px; }
    .logo { display:inline-flex; align-items:center; gap:10px; }
    .logo-icon { width:32px;height:32px;background:#0d0b0a;border-radius:8px;display:flex;align-items:center;justify-content:center; }
    .logo-icon span { color:#fff;font-size:18px;font-style:italic; }
    .logo-text { font-size:16px;font-weight:600;color:#0d0b0a; }
    h1 { font-size:24px;font-weight:400;color:#0d0b0a;margin:0 0 8px; }
    p { font-size:14px;color:#6b6460;line-height:1.6;margin:0 0 24px; }
    .card { background:#f8f6f4;border-radius:12px;padding:20px;margin-bottom:24px; }
    table { width:100%;border-collapse:collapse; }
    td { padding:6px 0;font-size:13px; }
    td:last-child { text-align:right;font-weight:600; }
    .muted { font-size:12px;color:#b0aaa6;margin:0;line-height:1.6; }
    .notes { font-size:13px;color:#6b6460;font-style:italic;margin:0 0 24px; }
  `
}

function reservationCardHtml(r: ReservationInfo, locationName?: string, showCancelText?: boolean): string {
  const dateFormatted = formatDate(r.date)
  let rows = ''
  rows += `<tr><td style="color:#6b6460;">Código</td><td>${r.reservationNumber}</td></tr>`
  if (locationName) rows += `<tr><td style="color:#6b6460;">Sede</td><td>${locationName}</td></tr>`
  rows += `<tr><td style="color:#6b6460;">Fecha</td><td>${dateFormatted}</td></tr>`
  rows += `<tr><td style="color:#6b6460;">Horario</td><td>${r.time} hs</td></tr>`
  rows += `<tr><td style="color:#6b6460;">Personas</td><td>${r.partySize}</td></tr>`
  const notesHtml = r.notes ? `<p class="notes">Notas: ${r.notes}</p>` : ''
  const cancelText = showCancelText
    ? `<p class="muted">Si necesitas cancelar o modificar, contactá al restaurante.</p>`
    : ''
  return `
    <div class="card">
      <table>${rows}</table>
    </div>
    ${notesHtml}
    ${cancelText}
  `
}

function wrapHtml(bodyHtml: string): string {
  return `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:480px;margin:0 auto;padding:40px 32px;background:#ffffff;border-radius:16px;border:1px solid #ede9e5;">
      <div style="margin-bottom:32px;">
        <div style="display:inline-flex;align-items:center;gap:10px;">
          <div style="width:32px;height:32px;background:#0d0b0a;border-radius:8px;display:flex;align-items:center;justify-content:center;">
            <span style="color:#fff;font-size:18px;font-style:italic;">T</span>
          </div>
          <span style="font-size:16px;font-weight:600;color:#0d0b0a;">Takeasygo</span>
        </div>
      </div>
      ${bodyHtml}
    </div>
  `
}

export async function sendReservationConfirmation(
  reservation: ReservationInfo,
  tenant: TenantInfo,
  locationName?: string
): Promise<void> {
  const dateFormatted = formatDate(reservation.date)
  const subject = `Reserva confirmada en ${tenant.name} — #${reservation.reservationNumber}`

  const bodyHtml = `
    <h1 style="font-size:24px;font-weight:400;color:#0d0b0a;margin:0 0 8px;">Reserva confirmada ✅</h1>
    <p style="font-size:14px;color:#6b6460;line-height:1.6;margin:0 0 24px;">
      Hola <strong>${reservation.name}</strong>, tu reserva en <strong>${tenant.name}</strong> fue confirmada.
    </p>
    ${reservationCardHtml(reservation, locationName)}
    <p style="font-size:12px;color:#b0aaa6;margin:0;line-height:1.6;">
      Cancelación llamando al restaurante. Te esperamos 🎉
    </p>
  `

  if (reservation.email) {
    await sendEmail(reservation.email, subject, wrapHtml(bodyHtml)).catch(() => {})
  }
  await sendPushToClientToken(reservation.clientToken, {
    title: `Reserva confirmada en ${tenant.name}`,
    body: `El ${dateFormatted} a las ${reservation.time} hs. Código: ${reservation.reservationNumber}`,
  })
}

export async function sendReservationReminder(
  reservation: ReservationInfo,
  tenant: TenantInfo,
  locationName?: string
): Promise<void> {
  const dateFormatted = formatDate(reservation.date)
  const subject = `Recordatorio: tu reserva en ${tenant.name} es hoy`

  const bodyHtml = `
    <h1 style="font-size:24px;font-weight:400;color:#0d0b0a;margin:0 0 8px;">Recordatorio de reserva ⏰</h1>
    <p style="font-size:14px;color:#6b6460;line-height:1.6;margin:0 0 24px;">
      Hola <strong>${reservation.name}</strong>, te recordamos que tenés una reserva hoy en <strong>${tenant.name}</strong>.
    </p>
    ${reservationCardHtml(reservation, locationName, true)}
  `

  if (reservation.email) {
    await sendEmail(reservation.email, subject, wrapHtml(bodyHtml)).catch(() => {})
  }
  await sendPushToClientToken(reservation.clientToken, {
    title: `Recordatorio: ${tenant.name}`,
    body: `Tu reserva es hoy a las ${reservation.time} hs. Código: ${reservation.reservationNumber}`,
  })
}

export async function sendReservationCancellation(
  reservation: ReservationInfo,
  tenant: TenantInfo
): Promise<void> {
  const dateFormatted = formatDate(reservation.date)
  const subject = `Reserva cancelada en ${tenant.name} — #${reservation.reservationNumber}`

  const bodyHtml = `
    <h1 style="font-size:24px;font-weight:400;color:#0d0b0a;margin:0 0 8px;">Reserva cancelada</h1>
    <p style="font-size:14px;color:#6b6460;line-height:1.6;margin:0 0 24px;">
      Hola <strong>${reservation.name}</strong>, tu reserva para el <strong>${dateFormatted}</strong> a las <strong>${reservation.time}</strong> en <strong>${tenant.name}</strong> fue cancelada.
    </p>
    <p class="muted">Código: ${reservation.reservationNumber}</p>
  `

  if (reservation.email) {
    await sendEmail(reservation.email, subject, wrapHtml(bodyHtml)).catch(() => {})
  }
  await sendPushToClientToken(reservation.clientToken, {
    title: `Reserva cancelada en ${tenant.name}`,
    body: `Tu reserva del ${dateFormatted} a las ${reservation.time} fue cancelada`,
  })
}

async function sendPushToClientToken(
  clientToken?: string,
  notification?: { title: string; body: string }
): Promise<void> {
  if (!clientToken || !notification) return
  try {
    const sub = await PushSubscription.findOne({ clientToken }).lean()
    if (!sub) return

    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      url: '/explore',
      icon: '/tgo192.png',
      badge: '/tgo192.png',
    })

    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload
    )
  } catch (error: any) {
    if (error?.statusCode === 410) {
      await PushSubscription.deleteOne({ clientToken })
    }
    console.error('[reservationNotifications] push error:', error)
  }
}
