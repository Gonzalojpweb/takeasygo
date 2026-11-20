import { NextResponse, type NextRequest } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { decrypt } from '@/lib/crypto'
import { safeEqual } from '@/lib/safe-equal'
import { consultarViaje } from '@/lib/rapiboy/client'
import { applyTripState, notifyTripChange, rapiboyConfigFromLocation } from '@/lib/rapiboy/trips'
import { claimCheckoutRedemptionsForOrder } from '@/lib/store-redemptions'

// ─── Rapiboy Webhook ────────────────────────────────────────────────────────
//
// POST /api/webhooks/rapiboy/[tenant]
//
// Rapiboy NO documenta el formato del webhook (URL, eventos y autenticación
// se acuerdan con ellos). Por eso (20/11/2026):
//   · Secreto por sede: header X-Rapiboy-Secret, o Authorization: Bearer, o
//     ?token= si Rapiboy solo permite configurar una URL.
//   · La sede sale del PEDIDO (IdPedido / ReferenciaExterna) o de
//     CodigoPlataforma; ya no se toma «cualquier sede con secreto».
//   · El aviso es solo una señal: se confirma el estado con GetQuery (la guía
//     pide no asumir entrega única ni ordenada) y, si la consulta falla, se usa
//     el Estado del cuerpo.
//   · Idempotente y sin retrocesos (lib/rapiboy/trips.ts → applyTripState).
//   · No se loguean cuerpos ni headers (llevan datos del cliente y el secreto).

function pick(body: any, ...keys: string[]): any {
  for (const k of keys) if (body?.[k] !== undefined && body[k] !== null && body[k] !== '') return body[k]
  return null
}

function suppliedSecret(request: NextRequest): string | null {
  const header = request.headers.get('x-rapiboy-secret')
  if (header) return header
  const auth = request.headers.get('authorization')
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim()
  return request.nextUrl.searchParams.get('token')
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> },
) {
  try {
    const { tenant: tenantSlug } = await params

    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const secret = suppliedSecret(request)
    if (!secret) return NextResponse.json({ error: 'Missing signature' }, { status: 401 })

    const idPedido = pick(body, 'IdPedido', 'idPedido', 'Id')
    const referencia = pick(body, 'ReferenciaExterna', 'referenciaExterna')
    const codigoPlataforma = pick(body, 'CodigoPlataforma', 'codigoPlataforma')
    const estadoRaw = pick(body, 'Estado', 'estado', 'IdEstado')
    const bodyEstado = estadoRaw != null && Number.isFinite(Number(estadoRaw)) ? Number(estadoRaw) : null
    const bodyDriver = pick(body, 'RepartidorOnDemand', 'NombreRepartidor', 'NombreChofer', 'nombreChofer')

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, status: { $in: ['active', 'paused'] } }).select('_id').lean() as any
    if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // ── Pedido (acotado al comercio y a viajes Rapiboy) ──
    let order = null as any
    if (idPedido != null) {
      order = await Order.findOne({
        tenantId: tenant._id,
        'deliveryProvider.type': 'rapiboy',
        'deliveryProvider.rapiboy.tripId': String(idPedido),
      })
    }
    if (!order && referencia != null) {
      order = await Order.findOne({
        tenantId: tenant._id,
        orderNumber: String(referencia),
        'deliveryProvider.type': 'rapiboy',
      })
    }

    // ── Sede: la del pedido; sin pedido, por CodigoPlataforma ──
    let location = null as any
    if (order) {
      location = await Location.findOne({ _id: order.locationId, tenantId: tenant._id }).select('name rapiboyConfig').lean()
    } else if (codigoPlataforma != null) {
      location = await Location.findOne({
        tenantId: tenant._id,
        'rapiboyConfig.codigoPlataforma': String(codigoPlataforma),
      }).select('name rapiboyConfig').lean()
    }

    const stored = location?.rapiboyConfig?.webhookSecret
    let expected = ''
    try { expected = stored ? decrypt(stored) : '' } catch { expected = '' }
    if (!expected || !safeEqual(secret, expected)) {
      console.warn(`[rapiboy-webhook] firma inválida o sede sin secreto (tenant ${tenantSlug})`)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    if (!order) {
      console.warn(`[rapiboy-webhook] pedido no encontrado (IdPedido=${idPedido ?? '-'}, ref=${referencia ?? '-'})`)
      return NextResponse.json({ received: true, note: 'order not found' })
    }

    // ── Confirmar el estado con Rapiboy ──
    let estado = bodyEstado
    let driverName: string | null = typeof bodyDriver === 'string' ? bodyDriver : null
    let trackingUrl: string | null = null
    const cfg = rapiboyConfigFromLocation(location)
    if (cfg && order.deliveryProvider?.rapiboy?.tripId) {
      try {
        const pedido = await consultarViaje({ idPedido: order.deliveryProvider.rapiboy.tripId }, cfg)
        if (pedido?.estado != null) {
          estado = pedido.estado
          driverName = pedido.driverName || driverName
          trackingUrl = pedido.trackingUrl || null
        }
        order.deliveryProvider.rapiboy.lastSyncAt = new Date()
      } catch (e: any) {
        console.warn(`[rapiboy-webhook] GetQuery falló, se usa el Estado del aviso: ${e?.message}`)
      }
    }

    if (estado == null) {
      return NextResponse.json({ received: true, note: 'no estado' })
    }

    const result = applyTripState(order, { estado, driverName, trackingUrl })
    if (result.changed || order.isModified()) await order.save()

    if (result.newStatus === 'delivered') {
      await claimCheckoutRedemptionsForOrder(order._id, order.locationId)
    }
    await notifyTripChange(order, result)

    if (result.changed) {
      console.log(`[rapiboy-webhook] pedido ${order.orderNumber}: estado Rapiboy ${estado}${result.newStatus ? ` → ${result.previousStatus} → ${result.newStatus}` : ''}`)
    }
    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[rapiboy-webhook] Error:', (error as Error)?.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
