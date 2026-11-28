import mongoose from 'mongoose'
import Location from '@/models/Location'

// ============================================================================
// Pausa automática sin conexión (28/11/2026)
// ============================================================================
// Si el local se queda sin internet, el POS y el panel no ven los pedidos de
// la app. Con la pausa automática activa por sede, la tienda online deja de
// tomar pedidos inmediatos cuando nadie del local dio señal en los últimos
// N minutos, y vuelve sola cuando la señal regresa. No hay cron: el estado
// se calcula cada vez que se lee la sede (menú, checkout, panel).
//
// Señales: POS (POST /api/[tenant]/pos/heartbeat), panel de pedidos abierto
// (POST /api/[tenant]/connectivity/heartbeat) y el Sync de EC2
// (Location.pos.lastSeenAt). Vale la más reciente.
// ============================================================================

export const CONNECTIVITY_MIN_MINUTES = 2
export const CONNECTIVITY_MAX_MINUTES = 30
export const CONNECTIVITY_DEFAULT_MINUTES = 3
/** No se reescribe la sede más de una vez cada 30 s por señal. */
const WRITE_THROTTLE_MS = 30_000

export type ConnectivitySource = 'pos' | 'panel'

interface LocationLike {
  connectivity?: { autoPause?: boolean; minutes?: number; lastSeenAt?: Date | string | null; lastSeenSource?: string | null } | null
  pos?: { lastSeenAt?: Date | string | null } | null
}

export interface ConnectivityState {
  autoPause: boolean
  minutes: number
  lastSeenAt: Date | null
  /** Hay señal dentro de la ventana. */
  online: boolean
  /** La tienda online está pausada por falta de conexión. */
  paused: boolean
}

export function clampMinutes(value: unknown): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return CONNECTIVITY_DEFAULT_MINUTES
  return Math.min(CONNECTIVITY_MAX_MINUTES, Math.max(CONNECTIVITY_MIN_MINUTES, n))
}

function time(v: Date | string | null | undefined): number {
  if (!v) return 0
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? t : 0
}

export function connectivityState(location: LocationLike | null | undefined, now: Date = new Date()): ConnectivityState {
  const c = location?.connectivity ?? {}
  const autoPause = c.autoPause === true
  const minutes = clampMinutes(c.minutes ?? CONNECTIVITY_DEFAULT_MINUTES)
  const last = Math.max(time(c.lastSeenAt), time(location?.pos?.lastSeenAt))
  const online = last > 0 && now.getTime() - last <= minutes * 60_000
  return { autoPause, minutes, lastSeenAt: last ? new Date(last) : null, online, paused: autoPause && !online }
}

/** Registra la señal del local para esas sedes (del mismo comercio). */
export async function recordHeartbeat(tenantId: string, locationIds: string[], source: ConnectivitySource, now: Date = new Date()): Promise<number> {
  const ids = locationIds.filter((id) => mongoose.isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id))
  if (ids.length === 0) return 0
  const res = await Location.updateMany(
    {
      _id: { $in: ids },
      tenantId: new mongoose.Types.ObjectId(tenantId),
      $or: [{ 'connectivity.lastSeenAt': null }, { 'connectivity.lastSeenAt': { $lt: new Date(now.getTime() - WRITE_THROTTLE_MS) } }],
    },
    { $set: { 'connectivity.lastSeenAt': now, 'connectivity.lastSeenSource': source } },
  )
  return res.modifiedCount
}

export const LOCATION_OFFLINE_MESSAGE = 'El local no está recibiendo pedidos online en este momento. Probá de nuevo en unos minutos.'

// ── Pedidos sin atender ─────────────────────────────────────────────────────
// Un pedido que entró justo antes del corte puede quedar sin que nadie lo vea.
// Lo detecta el seguimiento del cliente (que consulta seguido; sin cron):
// - el cliente ve que el local todavía no lo tomó;
// - si la sede tiene la pausa automática y no tiene señal, se avisa por email
//   a los administradores del comercio, UNA vez por pedido.

export const UNATTENDED_MINUTES = 8

export interface StoreNotice {
  kind: 'waiting' | 'store_offline'
  minutes: number
}

interface OrderLike {
  _id: unknown
  tenantId: unknown
  locationId?: unknown
  orderNumber?: number | string
  status: string
  orderTiming?: string | null
  createdAt?: Date | string | null
  statusTimestamps?: { confirmedAt?: Date | string | null; preparingAt?: Date | string | null } | null
  unattendedAlertAt?: Date | null
}

export async function storeNoticeForOrder(order: OrderLike, now: Date = new Date()): Promise<StoreNotice | null> {
  if (order.orderTiming === 'scheduled') return null
  if (!['pending', 'confirmed'].includes(order.status) || order.statusTimestamps?.preparingAt) return null
  const since = time(order.statusTimestamps?.confirmedAt) || time(order.createdAt)
  if (!since) return null
  const minutes = Math.floor((now.getTime() - since) / 60_000)
  if (minutes < UNATTENDED_MINUTES) return null
  if (!order.locationId) return { kind: 'waiting', minutes }

  const location = await Location.findOne({ _id: order.locationId as string, tenantId: order.tenantId as string }).select('name connectivity pos').lean<LocationLike & { name?: string }>()
  const state = connectivityState(location, now)
  if (!state.autoPause || state.online) return { kind: 'waiting', minutes }

  // Se espera (en serverless un envío suelto puede cortarse); pasa una sola vez.
  if (!order.unattendedAlertAt) await alertOwners(order, location?.name ?? '', minutes, now).catch((e) => console.warn('[connectivity] alerta:', e))
  return { kind: 'store_offline', minutes }
}

async function alertOwners(order: OrderLike, locationName: string, minutes: number, now: Date): Promise<void> {
  const Order = (await import('@/models/Order')).default
  const claimed = await Order.updateOne({ _id: order._id, unattendedAlertAt: null }, { $set: { unattendedAlertAt: now } })
  if (claimed.modifiedCount !== 1) return
  const User = (await import('@/models/User')).default
  const { sendEmail, escapeHtml } = await import('@/lib/email')
  const admins = await User.find({ tenantId: order.tenantId, role: 'admin', isActive: { $ne: false } }).select('email').lean<Array<{ email?: string }>>()
  const subject = `Pedido #${order.orderNumber ?? ''} sin atender: tu local parece sin conexión`
  const html = `<p>El pedido <b>#${escapeHtml(order.orderNumber ?? '')}</b>${locationName ? ` de <b>${escapeHtml(locationName)}</b>` : ''} lleva ${minutes} minutos sin que nadie lo tome.</p>`
    + '<p>Ni el POS ni el panel de pedidos dieron señal: probablemente el local se quedó sin internet. La tienda online quedó pausada para no recibir pedidos nuevos y se reactiva sola al volver la conexión.</p>'
    + '<p>Revisá el pedido desde el celular (panel → Pedidos) y avisale al cliente si hace falta.</p>'
  for (const a of admins) {
    if (a.email && a.email.includes('@')) await sendEmail(a.email, subject, html).catch((e) => console.warn('[connectivity] email:', e))
  }
}
