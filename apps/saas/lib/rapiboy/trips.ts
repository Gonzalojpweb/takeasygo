// ============================================================================
// Viajes Rapiboy de un pedido — lógica compartida
// ============================================================================
// La usan: cambio de estado a «listo» (orders/[id]/status), aceptación del
// precio nuevo (rapiboy-price-accept), el webhook y la consulta en el tracking.
//   · rapiboyConfigFromLocation: credenciales de la sede.
//   · buildTripParams: datos del viaje con nombre/teléfono DESCIFRADOS (el
//     pedido los guarda cifrados; antes se mandaba el texto cifrado).
//   · createTripForOrder: crea el viaje sin duplicar (si el resultado es
//     incierto, consulta por ReferenciaExterna antes de dar por fallado).
//   · applyTripState: aplica un estado de Rapiboy al pedido sin retroceder.
//   · notifyTripChange: push al cliente y aviso al local si el envío falló.
// ============================================================================

import { safeDecrypt } from '@/lib/crypto'
import {
  consultarViaje,
  crearViajeOnDemand,
  RapiboyError,
  type CrearViajeParams,
  type CrearViajeResult,
  type RapiboyConfig,
  type RapiboyCoord,
} from '@/lib/rapiboy/client'
import {
  isPhaseAdvance,
  nextOrderStatus,
  rapiboyPhase,
  RAPIBOY_ACTIVE_PHASES,
  RAPIBOY_ESTADO_NOMBRE,
  type RapiboyTripPhase,
} from '@/lib/rapiboy/estados'

export interface LocationForRapiboy {
  name?: string
  phone?: string
  address?: string
  geo?: { coordinates?: number[] } | null
  rapiboyConfig?: {
    enabled?: boolean
    apiToken?: string
    environment?: string
    codigoPlataforma?: string
  } | null
}

export function rapiboyConfigFromLocation(location: LocationForRapiboy): RapiboyConfig | null {
  const c = location?.rapiboyConfig
  if (!c?.enabled || !c.apiToken) return null
  return {
    apiToken: c.apiToken,
    environment: c.environment === 'production' ? 'production' : 'uat',
    codigoPlataforma: c.codigoPlataforma || '',
  }
}

export function originFromLocation(location: LocationForRapiboy): RapiboyCoord | null {
  const coords = location?.geo?.coordinates
  if (!Array.isArray(coords) || coords.length !== 2) return null
  const [lng, lat] = coords
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  return { lat, lng, address: location.address || '' }
}

export function destinationFromOrder(order: any): RapiboyCoord | null {
  const a = order?.deliveryAddress
  if (!a?.coordinates) return null
  return {
    lat: a.coordinates.lat,
    lng: a.coordinates.lng,
    address: `${a.street} ${a.number}`.trim(),
  }
}

export function buildTripParams(order: any, location: LocationForRapiboy): CrearViajeParams | null {
  const origen = originFromLocation(location)
  const destino = destinationFromOrder(order)
  if (!origen || !destino) return null
  const name = order.customer?.name ? safeDecrypt(order.customer.name) : ''
  const phone = order.customer?.phone ? safeDecrypt(order.customer.phone) : ''
  const email = order.customer?.email ? safeDecrypt(order.customer.email) : ''
  return {
    orderNumber: String(order.orderNumber || order._id),
    origen,
    destino,
    originName: location.name || 'Local',
    originPhone: location.phone || '',
    customerName: name || 'Cliente',
    customerPhone: phone,
    customerEmail: email.includes('@') ? email : '',
    destinationCity: order.deliveryAddress?.city || '',
    apt: order.deliveryAddress?.apt || '',
    observaciones: order.notes || '',
    tiempoCocina: 0,
  }
}

/**
 * Crea el viaje del pedido. Si ya tiene tripId no hace nada (devuelve null).
 * Si Rapiboy no responde (timeout/red) consulta por ReferenciaExterna: el
 * viaje pudo haberse creado igual y no hay que duplicarlo.
 */
export async function createTripForOrder(
  order: any,
  params: CrearViajeParams,
  cfg: RapiboyConfig,
): Promise<CrearViajeResult | null> {
  if (order.deliveryProvider?.rapiboy?.tripId) return null
  try {
    return await crearViajeOnDemand(params, cfg)
  } catch (err) {
    if (err instanceof RapiboyError && err.isUncertain) {
      const existing = await consultarViaje({ referenciaExterna: params.orderNumber }, cfg).catch(() => null)
      if (existing) {
        return {
          tripId: existing.idPedido,
          trackingId: existing.idPedido,
          trackingUrl: existing.trackingUrl,
          trackingEncriptado: '',
          estado: existing.estado,
          precio: existing.precio,
        }
      }
    }
    throw err
  }
}

/** Guarda en el pedido los datos del viaje recién creado. */
export function recordCreatedTrip(order: any, viaje: CrearViajeResult): void {
  const r = order.deliveryProvider.rapiboy
  r.tripId = viaje.tripId
  r.trackingId = viaje.trackingId
  r.trackingUrl = viaje.trackingUrl
  r.trackingEncriptado = viaje.trackingEncriptado
  r.estado = viaje.estado ?? 10
  r.estadoNombre = RAPIBOY_ESTADO_NOMBRE[r.estado] ?? ''
  r.phase = rapiboyPhase(r.estado) ?? 'searching'
  r.lastEventAt = new Date()
}

export interface TripUpdate {
  estado: number
  driverName?: string | null
  trackingUrl?: string | null
}

export interface TripApplyResult {
  changed: boolean
  phase: RapiboyTripPhase | null
  previousStatus: string
  newStatus: string | null
}

const STATUS_TIMESTAMP: Record<string, string> = {
  en_ruta: 'enRutaAt',
  arrived: 'arrivedAt',
  delivered: 'deliveredAt',
}

/**
 * Aplica un estado de Rapiboy a un documento Order (sin guardar). Idempotente:
 * el mismo estado dos veces no cambia nada, y un aviso viejo no hace
 * retroceder ni la fase del viaje ni el estado del pedido.
 */
export function applyTripState(order: any, update: TripUpdate): TripApplyResult {
  const previousStatus = order.status
  const r = order.deliveryProvider?.rapiboy
  const phase = rapiboyPhase(update.estado)
  const result: TripApplyResult = { changed: false, phase, previousStatus, newStatus: null }
  if (!r) return result

  if (update.driverName && update.driverName !== r.driverName) {
    r.driverName = update.driverName
    result.changed = true
  }
  if (update.trackingUrl && !r.trackingUrl) {
    r.trackingUrl = update.trackingUrl
    result.changed = true
  }

  if (r.estado === update.estado) return result
  if (phase && !isPhaseAdvance(r.phase ?? null, phase)) return result

  r.estado = update.estado
  r.estadoNombre = RAPIBOY_ESTADO_NOMBRE[update.estado] ?? ''
  if (phase) r.phase = phase
  r.lastEventAt = new Date()
  result.changed = true

  const next = nextOrderStatus(order.status, phase)
  if (next) {
    order.status = next
    result.newStatus = next
    const ts = STATUS_TIMESTAMP[next]
    if (ts && order.statusTimestamps) order.statusTimestamps[ts] = new Date()
  }

  if (order.deliveryConfirmation) {
    const dc = order.deliveryConfirmation
    if (phase === 'to_pickup' || phase === 'at_store') dc.status = 'assigned'
    else if (phase === 'picked_up') dc.status = 'en_ruta'
    else if (phase === 'at_customer') { dc.status = 'arrived'; dc.arrivalAt = dc.arrivalAt ?? new Date() }
    else if (phase === 'delivered') { dc.status = 'completed'; dc.completedAt = new Date() }
    if (update.driverName) dc.deliveryPersonName = update.driverName
  }

  return result
}

/** ¿Conviene consultar a Rapiboy el estado de este viaje? (tracking abierto) */
export function shouldSyncTrip(order: any, now = Date.now(), minIntervalMs = 60_000): boolean {
  const r = order?.deliveryProvider?.rapiboy
  if (order?.deliveryProvider?.type !== 'rapiboy' || !r?.tripId) return false
  if (order.status === 'delivered' || order.status === 'cancelled') return false
  if (r.phase && !RAPIBOY_ACTIVE_PHASES.has(r.phase)) return false
  const last = r.lastSyncAt ? new Date(r.lastSyncAt).getTime() : 0
  return now - last >= minIntervalMs
}

// ─── Avisos ─────────────────────────────────────────────────────────────────

const CUSTOMER_PUSH: Partial<Record<RapiboyTripPhase, (n: string, driver: string) => { title: string; body: string }>> = {
  picked_up: (n, d) => ({ title: '🛵 ¡Tu pedido va en camino!', body: `Pedido #${n} — ${d || 'El repartidor'} ya lo retiró y va a tu domicilio.` }),
  at_customer: (n, d) => ({ title: '📍 ¡Tu delivery llegó!', body: `Pedido #${n} — ${d || 'El repartidor'} está en tu domicilio.` }),
  delivered: (n) => ({ title: '✅ ¡Pedido entregado!', body: `Pedido #${n} fue entregado.` }),
}

/**
 * Push al cliente en los hitos del viaje y, si el envío falló o Rapiboy lo
 * canceló sin que el pedido esté cancelado, aviso al local (una sola vez).
 * Nunca tira: los avisos no deben romper el webhook.
 */
export async function notifyTripChange(order: any, result: TripApplyResult): Promise<void> {
  if (!result.changed || !result.phase) return
  const r = order.deliveryProvider?.rapiboy
  const orderNumber = String(order.orderNumber || order._id)

  const pushFor = CUSTOMER_PUSH[result.phase]
  if (pushFor && order.clientToken) {
    try {
      const [{ default: PushSubscription }, { sendPushToSubscription }] = await Promise.all([
        import('@/models/PushSubscription'),
        import('@/lib/push'),
      ])
      const sub = await PushSubscription.findOne({ clientToken: order.clientToken }).lean() as any
      if (sub) {
        const msg = pushFor(orderNumber, r?.driverName || '')
        await sendPushToSubscription(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, clientToken: order.clientToken },
          msg.title, msg.body, '/app',
        )
      }
    } catch (e: any) {
      console.warn('[rapiboy] push al cliente falló:', e?.message)
    }
  }

  const failed = result.phase === 'failed' || result.phase === 'cancelled'
  if (failed && order.status !== 'cancelled' && r && !r.failureNotifiedAt) {
    try {
      const { default: Order } = await import('@/models/Order')
      // Marca atómica: un solo aviso aunque lleguen webhook y consulta a la vez.
      const claimed = await Order.updateOne(
        { _id: order._id, 'deliveryProvider.rapiboy.failureNotifiedAt': null },
        { $set: { 'deliveryProvider.rapiboy.failureNotifiedAt': new Date() } },
      )
      if (claimed.modifiedCount === 1) {
        r.failureNotifiedAt = new Date()
        const { default: SystemAnnouncement } = await import('@/models/SystemAnnouncement')
        const motivo = r.estadoNombre || (result.phase === 'cancelled' ? 'Cancelado' : 'No entregado')
        await SystemAnnouncement.create({
          title: `Rapiboy no pudo hacer el envío del pedido #${orderNumber}`,
          content: `El viaje de Rapiboy quedó en «${motivo}». El pedido sigue abierto: reasigná el envío (repartidor propio) o comunicate con el cliente.`,
          type: 'alert',
          status: 'published',
          publishedAt: new Date(),
          targetPlans: [],
          targetTenantIds: [order.tenantId],
          readBy: [],
          acceptances: [],
          requiresConsent: false,
          expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        })
      }
    } catch (e: any) {
      console.warn('[rapiboy] aviso al local falló:', e?.message)
    }
  }
}

// ─── Consulta bajo demanda ──────────────────────────────────────────────────

const SYNC_INTERVAL_MS = 60_000

/**
 * Consulta el viaje en Rapiboy (GetQuery) y aplica el estado. Respaldo del
 * webhook: lo dispara el tracking del cliente, como mucho una vez por minuto
 * por pedido (reserva atómica de lastSyncAt, así dos pestañas no consultan a
 * la vez). Devuelve el pedido actualizado, o null si no consultó o falló.
 */
export async function syncRapiboyTrip(orderId: unknown, tenantId: unknown): Promise<any | null> {
  const [{ default: Order }, { default: Location }] = await Promise.all([
    import('@/models/Order'),
    import('@/models/Location'),
  ])
  const now = new Date()
  const claimed = await Order.findOneAndUpdate(
    {
      _id: orderId,
      tenantId,
      'deliveryProvider.type': 'rapiboy',
      'deliveryProvider.rapiboy.tripId': { $nin: ['', null] },
      $or: [
        { 'deliveryProvider.rapiboy.lastSyncAt': null },
        { 'deliveryProvider.rapiboy.lastSyncAt': { $lt: new Date(now.getTime() - SYNC_INTERVAL_MS) } },
      ],
    },
    { $set: { 'deliveryProvider.rapiboy.lastSyncAt': now } },
    { new: true },
  )
  if (!claimed) return null

  try {
    const location = await Location.findOne({ _id: claimed.locationId, tenantId }).select('rapiboyConfig').lean() as any
    const cfg = location ? rapiboyConfigFromLocation(location) : null
    if (!cfg) return null
    const pedido = await consultarViaje({ idPedido: claimed.deliveryProvider!.rapiboy!.tripId }, cfg)
    if (pedido?.estado == null) return null

    const result = applyTripState(claimed, { estado: pedido.estado, driverName: pedido.driverName, trackingUrl: pedido.trackingUrl })
    if (!result.changed) return claimed
    await claimed.save()
    if (result.newStatus === 'delivered') {
      const { claimCheckoutRedemptionsForOrder } = await import('@/lib/store-redemptions')
      await claimCheckoutRedemptionsForOrder(claimed._id, claimed.locationId)
    }
    await notifyTripChange(claimed, result)
    return claimed
  } catch (e: any) {
    console.warn(`[rapiboy] consulta de viaje falló: ${e?.message}`)
    return null
  }
}
