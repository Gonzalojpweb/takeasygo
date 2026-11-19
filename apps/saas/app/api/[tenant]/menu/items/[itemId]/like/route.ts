import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import ItemLike from '@/models/ItemLike'
import { verifyRatingToken } from '@/lib/rating-token'
import { rateLimit } from '@/lib/rateLimit'
import { clientIp } from '@/lib/onboarding-guard'
import { adjustItemLikes, locateMenuItem } from '@/lib/menu/item-likes'
import { NextRequest, NextResponse } from 'next/server'

// ============================================================================
// Like de un plato — solo quien lo compró
// ============================================================================
// Un like por PEDIDO y plato (índice único en ItemLike). Lo puede dar quien
// tiene el token del pedido (seguimiento, calificación) y solo si el pedido
// fue ENTREGADO y el plato está en ese pedido.
//
// Correcciones 19/11:
//   - el plato se ubica por su _id en el menú de SU sede (antes: el primer menú
//     activo del tenant → en multi-sede los likes se perdían con 404);
//   - se exige pedido entregado (antes: cualquier estado, incluso cancelado);
//   - contador atómico, sin guardar el menú entero (lib/menu/item-likes);
//   - «ya tenía like» devolvía el _id del registro como cantidad;
//   - límite de intentos por IP.
// ============================================================================

const LIKE_STATUSES = new Set(['delivered'])

function isObjectId(id: unknown): id is string {
  return typeof id === 'string' && mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id
}

async function limited(request: NextRequest): Promise<NextResponse | null> {
  const { success } = await rateLimit(`item-like:${clientIp(request.headers)}`, 60, 60_000)
  return success ? null : NextResponse.json({ error: 'Demasiados intentos, probá en un rato' }, { status: 429 })
}

async function readBody(request: NextRequest): Promise<{ orderId?: unknown; token?: unknown }> {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

/** Valida token, pedido entregado y que el plato esté en el pedido. */
async function authorizeOrder(tenantSlug: string, itemId: string, orderId: unknown, token: unknown) {
  if (!isObjectId(orderId) || typeof token !== 'string' || !isObjectId(itemId)) {
    return { error: NextResponse.json({ error: 'orderId y token requeridos' }, { status: 400 }) }
  }
  if (!verifyRatingToken(orderId, token)) {
    return { error: NextResponse.json({ error: 'Token inválido' }, { status: 401 }) }
  }

  await connectDB()
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id').lean<{ _id: mongoose.Types.ObjectId }>()
  if (!tenant) return { error: NextResponse.json({ error: 'Item no encontrado' }, { status: 404 }) }

  const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
    .select('status locationId items.menuItemId')
    .lean<{ status: string; locationId?: mongoose.Types.ObjectId; items?: Array<{ menuItemId?: unknown }> }>()
  if (!order) return { error: NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 }) }

  const itemInOrder = (order.items ?? []).some(i => i.menuItemId && String(i.menuItemId) === itemId)
  if (!itemInOrder) return { error: NextResponse.json({ error: 'Item no está en este pedido' }, { status: 403 }) }

  return { tenant, order }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; itemId: string }> }
) {
  try {
    const blocked = await limited(request)
    if (blocked) return blocked

    const { tenant: tenantSlug, itemId } = await params
    const { orderId, token } = await readBody(request)
    const auth = await authorizeOrder(tenantSlug, itemId, orderId, token)
    if ('error' in auth) return auth.error
    const { tenant, order } = auth

    if (!LIKE_STATUSES.has(order.status)) {
      return NextResponse.json({ error: 'Vas a poder dar like cuando recibas tu pedido' }, { status: 409 })
    }

    const location = await locateMenuItem(tenant._id, itemId)
    if (!location) return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 })
    // El plato tiene que ser de la carta de la sede del pedido.
    if (order.locationId && location.locationId && String(order.locationId) !== String(location.locationId)) {
      return NextResponse.json({ error: 'Item no está en este pedido' }, { status: 403 })
    }

    try {
      await ItemLike.create({ tenantId: tenant._id, menuItemId: itemId, orderId })
    } catch (err: any) {
      // Ya tenía like (o dos toques simultáneos): no se suma de nuevo.
      if (err?.code === 11000) {
        return NextResponse.json({ liked: true, likesCount: location.likesCount })
      }
      throw err
    }

    const likesCount = await adjustItemLikes(tenant._id, itemId, 1)
    return NextResponse.json({ liked: true, likesCount: likesCount ?? location.likesCount + 1 })
  } catch (error) {
    console.error('[item-like] POST', error)
    return NextResponse.json({ error: 'No se pudo registrar el like' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; itemId: string }> }
) {
  try {
    const blocked = await limited(request)
    if (blocked) return blocked

    const { tenant: tenantSlug, itemId } = await params
    const { orderId, token } = await readBody(request)
    const auth = await authorizeOrder(tenantSlug, itemId, orderId, token)
    if ('error' in auth) return auth.error
    const { tenant } = auth

    const removed = await ItemLike.findOneAndDelete({ orderId, menuItemId: itemId })
    if (!removed) {
      const location = await locateMenuItem(tenant._id, itemId)
      return NextResponse.json({ liked: false, likesCount: location?.likesCount ?? 0 })
    }

    const likesCount = await adjustItemLikes(tenant._id, itemId, -1)
    return NextResponse.json({ liked: false, likesCount: likesCount ?? 0 })
  } catch (error) {
    console.error('[item-like] DELETE', error)
    return NextResponse.json({ error: 'No se pudo quitar el like' }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; itemId: string }> }
) {
  try {
    const { tenant: tenantSlug, itemId } = await params
    if (!isObjectId(itemId)) return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 })

    await connectDB()
    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id').lean<{ _id: mongoose.Types.ObjectId }>()
    if (!tenant) return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 })

    const location = await locateMenuItem(tenant._id, itemId)
    if (!location) return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 })

    const orderId = request.nextUrl.searchParams.get('orderId')
    const token = request.nextUrl.searchParams.get('token')
    let liked = false
    if (isObjectId(orderId) && token && verifyRatingToken(orderId, token)) {
      liked = !!(await ItemLike.exists({ orderId, menuItemId: itemId }))
    }

    return NextResponse.json({ liked, likesCount: location.likesCount })
  } catch (error) {
    console.error('[item-like] GET', error)
    return NextResponse.json({ error: 'No se pudo leer el like' }, { status: 500 })
  }
}
