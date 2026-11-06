import { NextResponse } from 'next/server'
import { isItemCourse } from '@takeasygo/business'
import Order from '@/models/Order'
import Printer from '@/models/Printer'
import Location from '@/models/Location'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { toPosOrder } from '@/lib/pos-online/orderMapper'
import { findPosOrder, type PosOrderDoc } from '@/lib/pos-online/orderRepo'
import { operatorName } from '@/lib/pos-online/operator'
import { buildCourseFireJobs } from '@/lib/printing/courseFire'

// ============================================================================
// POST /api/[tenant]/pos/orders/[id]/courses — «Marcha» de un tiempo
// ============================================================================
// Body: { course: 'principal' | 'postre' | 'entrada' }
// Piloto 06/11/2026. El mozo (o la caja) marcha el tiempo que estaba en
// espera: sale de `heldCourses`, queda registrado en `courseFires` y cada
// estación con platos de ese tiempo imprime «MARCHA PRINCIPAL» + mesa, SIN
// repetir los platos (ya los tiene de la comanda).
//
// Idempotente: si el tiempo ya marchó, responde 200 con la orden y no vuelve
// a imprimir (un doble toque no saca dos marchas). Si nunca estuvo en
// espera, 409. Orden cancelada o cerrada, 409.
// ============================================================================

type CourseOrderDoc = PosOrderDoc & {
  _id: unknown
  orderNumber: string
  status: string
  locationId: unknown
  posTableNumber?: number | null
  heldCourses?: string[] | null
  courseFires?: { course: string }[] | null
  items: { itemType?: string; course?: string | null; printRole?: string | null; quantity: number }[]
}

export const POST = posRoute<{ tenant: string; id: string }>('orders.write', async (ctx, { id }) => {
  const body = await readPosBody(ctx.request)
  const course = (body as { course?: unknown }).course
  if (!isItemCourse(course)) throw PosError.validation('course inválido: entrada, principal o postre')

  const order = (await findPosOrder(ctx, id)) as CourseOrderDoc
  if (order.status === 'cancelled' || order.status === 'delivered') {
    throw PosError.conflict('La orden ya está cerrada: no hay nada que marchar')
  }
  const held = order.heldCourses ?? []
  if (!held.includes(course)) {
    if ((order.courseFires ?? []).some((f) => f.course === course)) {
      return NextResponse.json({ order: toPosOrder(order), alreadyFired: true })
    }
    throw PosError.conflict('Ese tiempo no estaba en espera')
  }

  const firedBy = await operatorName(ctx)
  const at = new Date()

  // Guard atómico: solo marcha si el tiempo SIGUE en espera (dos terminales
  // marchando a la vez ⇒ una sola marcha impresa).
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, tenantId: ctx.tenantId, locationId: ctx.locationId, heldCourses: course },
    { $pull: { heldCourses: course }, $push: { courseFires: { course, firedAt: at, userId: ctx.user.id } } },
    { returnDocument: 'after' }
  )
  if (!updated) {
    const fresh = (await findPosOrder(ctx, id)) as CourseOrderDoc
    return NextResponse.json({ order: toPosOrder(fresh), alreadyFired: true })
  }

  // Impresión: un job por estación con platos de ese tiempo. Nunca corta la
  // marcha (el estado ya quedó guardado; el mozo puede avisar a viva voz).
  let printed = 0
  try {
    const [printers, location] = await Promise.all([
      Printer.find({ tenantId: ctx.tenantId, locationId: ctx.locationId, isActive: true }).lean(),
      Location.findOne({ _id: ctx.locationId }).select('timezone').lean<{ timezone?: string }>(),
    ])
    const jobs = buildCourseFireJobs({
      course,
      order: { orderNumber: order.orderNumber, posTableNumber: order.posTableNumber, items: order.items },
      printers: printers as never,
      firedBy,
      at,
      timezone: location?.timezone,
    })
    if (jobs.length > 0) {
      await Order.updateOne({ _id: order._id }, { $push: { printJobs: { $each: jobs } }, $set: { printed: false } })
      printed = jobs.length
    }
  } catch (err) {
    console.error('[pos/courses] no se pudo generar la marcha impresa:', err)
  }

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.order.course_fire',
    entity: 'Order',
    entityId: order.posId ?? id,
    details: { course, printed, table: order.posTableNumber ?? null },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })

  return NextResponse.json({ order: toPosOrder(updated.toObject() as unknown as PosOrderDoc), printed })
})
