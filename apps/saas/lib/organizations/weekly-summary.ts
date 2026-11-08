/**
 * Resumen semanal del grupo por email (vista 360, etapa 4 — 08/11/2026).
 *
 * Cada lunes, a quien ve los números del grupo (dueño, administrador general,
 * contador, gerente de marca) le llega cómo le fue la semana que cerró
 * (lunes a domingo, hora Argentina) contra la anterior. Cada persona recibe
 * SU alcance: se calcula con loadOrgDashboard por usuario, como la pantalla.
 *
 *  · Se apaga por persona y organización (OrgMembership.weeklySummary.enabled).
 *  · Una vez por semana: se «reserva» la semana en la base antes de enviar
 *    (atómico); si el envío falla se libera para el próximo intento.
 *  · Semana sin ventas (ni antes ni ahora): no se manda nada.
 * WhatsApp: pendiente, quedaría para el plan Élite.
 */
import { Types } from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import OrgMembership from '@/models/OrgMembership'
import Organization from '@/models/Organization'
import User from '@/models/User'
import { escapeHtml, safeHeader, sendEmail } from '@/lib/email'
import { DEFAULT_TIMEZONE, getTodayStrInTimezone } from '@/lib/restaurant-time'
import { DASHBOARD_ROLES, loadOrgDashboard, type OrgDashboard } from './dashboard'
import { change, rangeLabel } from './dashboard-file'

function shiftDay(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Semana que cerró (lunes a domingo, hora Argentina) respecto de `now`. */
export function lastWeekRange(now: Date = new Date()): { from: string; to: string } {
  const today = getTodayStrInTimezone(DEFAULT_TIMEZONE, now)
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay() // 0 = domingo
  const thisMonday = shiftDay(today, -((weekday + 6) % 7))
  return { from: shiftDay(thisMonday, -7), to: shiftDay(thisMonday, -1) }
}

export function weeklySummaryEnabled(m: { weeklySummary?: { enabled?: boolean | null } | null }): boolean {
  return m.weeklySummary?.enabled !== false
}

const pesos = (cents: number) => `$${Math.round(cents / 100).toLocaleString('es-AR')}`

function deltaHtml(cur: number, prev: number, inverse = false): string {
  const c = change(cur, prev)
  if (c === null) return cur ? '<span style="color:#0284c7;font-weight:600">nuevo</span>' : '<span style="color:#94a3b8">—</span>'
  if (c === 0) return '<span style="color:#64748b">0%</span>'
  const good = inverse ? c < 0 : c > 0
  return `<span style="color:${good ? '#059669' : '#e11d48'};font-weight:600">${c > 0 ? '▲ +' : '▼ '}${c.toLocaleString('es-AR')}%</span>`
}

/** Email listo para enviar. Puro (testeable): todo el texto variable va escapado. */
export function buildWeeklySummaryEmail(d: OrgDashboard, opts: { recipientName?: string | null; dashboardUrl: string; downloadUrl: string }): { subject: string; html: string } {
  const t = d.totals, p = d.compare.totals
  const c = change(t.revenue, p.revenue)
  const org = escapeHtml(d.organization.name)
  const subject = safeHeader(`${d.organization.name}: ${pesos(t.revenue)} la semana pasada${c === null ? '' : ` (${c > 0 ? '+' : ''}${c.toLocaleString('es-AR')}%)`}`)
  const many = d.brands.length > 1
  const label = (l: { brandName: string; name: string }) => escapeHtml(many ? `${l.brandName} · ${l.name}` : l.name)

  const moves = d.locations.map(l => ({ ...l, diff: l.revenue - l.prevRevenue }))
  const up = [...moves].sort((a, b) => b.diff - a.diff)[0]
  const down = [...moves].sort((a, b) => a.diff - b.diff)[0]
  const prodMoves = d.products.map(x => ({ ...x, diff: x.revenue - x.prevRevenue }))
  const rising = prodMoves.filter(x => x.diff > 0 && x.prevRevenue > 0).sort((a, b) => b.diff - a.diff).slice(0, 3)
  const falling = prodMoves.filter(x => x.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 3)

  const kpi = (name: string, value: string, cur: number, prev: number) =>
    `<td style="padding:12px;border:1px solid #e2e8f0;border-radius:8px;width:25%;vertical-align:top"><div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em">${name}</div><div style="font-size:20px;font-weight:700;color:#0f172a;margin-top:4px">${value}</div><div style="font-size:12px;margin-top:2px">${deltaHtml(cur, prev)}</div></td>`

  const rows = d.locations.slice(0, 10).map((l, i) =>
    `<tr><td style="padding:6px 8px;color:#94a3b8">${i + 1}</td><td style="padding:6px 8px">${label(l)}</td><td style="padding:6px 8px;text-align:right;font-weight:600">${pesos(l.revenue)}</td><td style="padding:6px 8px;text-align:right">${deltaHtml(l.revenue, l.prevRevenue)}</td></tr>`).join('')
  const more = d.locations.length > 10 ? `<p style="font-size:12px;color:#64748b;margin:6px 0 0">Y ${d.locations.length - 10} sedes más en la vista del grupo.</p>` : ''

  const products = d.products.filter(x => x.revenue > 0).slice(0, 5).map((x, i) =>
    `<tr><td style="padding:5px 8px;color:#94a3b8">${i + 1}</td><td style="padding:5px 8px">${escapeHtml(x.name)}</td><td style="padding:5px 8px;text-align:right">${pesos(x.revenue)}</td><td style="padding:5px 8px;text-align:right">${deltaHtml(x.revenue, x.prevRevenue)}</td></tr>`).join('')

  const highlight = (title: string, color: string, body: string) =>
    `<td style="padding:10px 12px;border-left:3px solid ${color};background:#f8fafc;vertical-align:top"><div style="font-size:11px;font-weight:700;color:${color};text-transform:uppercase">${title}</div><div style="font-size:13px;color:#0f172a;margin-top:4px">${body}</div></td>`
  const highlights = [
    many && up && up.diff > 0 ? highlight('Quién empuja', '#059669', `${label(up)}<br><span style="color:#64748b">+${pesos(up.diff)}</span>`) : '',
    many && down && down.diff < 0 ? highlight('Dónde cae más', '#e11d48', `${label(down)}<br><span style="color:#64748b">-${pesos(-down.diff)}</span>`) : '',
  ].filter(Boolean)

  const list = (items: typeof rising, sign: '+' | '-') => items.length
    ? items.map(x => `<div style="font-size:13px;padding:2px 0">${escapeHtml(x.name)} <span style="color:${sign === '+' ? '#059669' : '#e11d48'}">${sign}${pesos(Math.abs(x.diff))}</span></div>`).join('')
    : '<div style="font-size:12px;color:#94a3b8">—</div>'

  const hello = opts.recipientName ? `Hola ${escapeHtml(opts.recipientName.split(' ')[0])},` : 'Hola,'
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<div style="max-width:640px;margin:0 auto;padding:24px 12px">
<div style="background:#ffffff;border-radius:12px;padding:24px">
<p style="margin:0 0 4px;font-size:13px;color:#64748b">${hello} así le fue a</p>
<h1 style="margin:0;font-size:22px">${org}</h1>
<p style="margin:4px 0 18px;font-size:13px;color:#64748b">Semana del ${rangeLabel(d.range)} · comparado con la semana anterior</p>
<table role="presentation" width="100%" cellspacing="6" style="border-collapse:separate"><tr>
${kpi('Facturación', pesos(t.revenue), t.revenue, p.revenue)}${kpi('Ventas', t.sales.toLocaleString('es-AR'), t.sales, p.sales)}
</tr><tr>
${kpi('Ticket promedio', pesos(t.avgTicket), t.avgTicket, p.avgTicket)}${kpi('Descuentos', pesos(d.extras.discounts), d.extras.discounts, d.compare.extras.discounts)}
</tr></table>
${highlights.length ? `<table role="presentation" width="100%" cellspacing="6" style="border-collapse:separate;margin-top:8px"><tr>${highlights.join('')}</tr></table>` : ''}
${d.locations.length > 1 ? `<h2 style="font-size:15px;margin:22px 0 6px">Ranking de sedes</h2><table role="presentation" width="100%" style="border-collapse:collapse;font-size:13px">${rows}</table>${more}` : ''}
${products ? `<h2 style="font-size:15px;margin:22px 0 6px">Productos que más facturaron</h2><table role="presentation" width="100%" style="border-collapse:collapse;font-size:13px">${products}</table>` : ''}
<table role="presentation" width="100%" style="margin-top:16px"><tr>
<td style="width:50%;vertical-align:top"><div style="font-size:11px;font-weight:700;color:#059669;text-transform:uppercase;margin-bottom:4px">Suben</div>${list(rising, '+')}</td>
<td style="width:50%;vertical-align:top"><div style="font-size:11px;font-weight:700;color:#e11d48;text-transform:uppercase;margin-bottom:4px">Bajan</div>${list(falling, '-')}</td>
</tr></table>
<div style="margin-top:24px">
<a href="${escapeHtml(opts.dashboardUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:10px">Ver todo el grupo</a>
<a href="${escapeHtml(opts.downloadUrl)}" style="display:inline-block;margin-left:8px;color:#0f172a;font-size:13px;padding:12px 8px">Descargar Excel</a>
</div>
</div>
<p style="font-size:11px;color:#94a3b8;text-align:center;margin:16px 8px">Mismos números que el panel de cada marca. Para dejar de recibir este resumen, entrá a la vista del grupo y apagá «Resumen semanal por email».<br>TakeasyGO</p>
</div></body></html>`
  return { subject, html }
}

export interface WeeklySummaryRun { week: string; candidates: number; sent: number; skippedEmpty: number; failed: number }

/** Manda los resúmenes de la semana que cerró. Idempotente por persona y semana. */
export async function runWeeklySummaries(opts: { now?: Date; baseUrl: string; send?: (to: string, subject: string, html: string) => Promise<void> }): Promise<WeeklySummaryRun> {
  await connectDB()
  const now = opts.now ?? new Date()
  const range = lastWeekRange(now)
  const week = range.from
  const send = opts.send ?? sendEmail
  const memberships = await OrgMembership.find({
    status: 'active',
    orgRole: { $in: [...DASHBOARD_ROLES] },
    'weeklySummary.enabled': { $ne: false },
    'weeklySummary.lastSentWeek': { $ne: week },
  }).select('_id organizationId userId weeklySummary').lean<{ _id: Types.ObjectId; organizationId: Types.ObjectId; userId: Types.ObjectId; weeklySummary?: { lastSentWeek?: string | null } }[]>()

  const run: WeeklySummaryRun = { week, candidates: memberships.length, sent: 0, skippedEmpty: 0, failed: 0 }
  const orgs = new Map((await Organization.find({ _id: { $in: memberships.map(m => m.organizationId) } }).select('_id slug').lean<{ _id: Types.ObjectId; slug: string }[]>()).map(o => [String(o._id), o.slug]))
  const users = new Map((await User.find({ _id: { $in: memberships.map(m => m.userId) } }).select('_id email name').lean<{ _id: Types.ObjectId; email?: string; name?: string }[]>()).map(u => [String(u._id), u]))

  for (const m of memberships) {
    const slug = orgs.get(String(m.organizationId))
    const user = users.get(String(m.userId))
    if (!slug || !user?.email) continue
    try {
      const result = await loadOrgDashboard(String(m.userId), slug, 'custom', { range, now })
      if (!result.ok) continue
      if (!result.data.totals.revenue && !result.data.compare.totals.revenue) { run.skippedEmpty++; continue }

      // Reserva atómica de la semana: un segundo cron no lo manda de nuevo.
      const prevWeek = m.weeklySummary?.lastSentWeek ?? null
      const claim = await OrgMembership.updateOne({ _id: m._id, 'weeklySummary.lastSentWeek': { $ne: week } }, { $set: { 'weeklySummary.lastSentWeek': week } })
      if (!claim.modifiedCount) continue

      const q = `periodo=custom&desde=${range.from}&hasta=${range.to}`
      const email = buildWeeklySummaryEmail(result.data, {
        recipientName: user.name ?? null,
        dashboardUrl: `${opts.baseUrl}/grupo/${slug}?${q}`,
        downloadUrl: `${opts.baseUrl}/api/grupo/${slug}/export?formato=xlsx&${q}`,
      })
      try {
        await send(user.email, email.subject, email.html)
        run.sent++
      } catch (err) {
        await OrgMembership.updateOne({ _id: m._id }, { $set: { 'weeklySummary.lastSentWeek': prevWeek } })
        throw err
      }
    } catch (err) {
      run.failed++
      console.error('[weekly-group-summary] falló', String(m._id), err)
    }
  }
  return run
}
