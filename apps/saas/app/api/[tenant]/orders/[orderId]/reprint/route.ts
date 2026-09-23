import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import Printer from '@/models/Printer'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { buildPrintPayload } from '@/lib/printing'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; orderId: string }> }
) {
  try {
    const { tenant: tenantSlug, orderId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
    if (!order) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })

    if (!['awaiting_confirmation', 'confirmed', 'preparing'].includes(order.status)) {
      return NextResponse.json(
        { error: 'Solo se puede reimprimir pedidos en estado Esperando Confirmación, Confirmado o Preparando' },
        { status: 400 }
      )
    }

    // Buscar impresoras activas para regenerar printJobs con config actual
    const activePrinters = await Printer.find({
      tenantId: tenant._id,
      locationId: order.locationId,
      isActive: true,
    }).lean()

    if (activePrinters.length > 0) {
      // Regenerar printJobs con la config actual de impresoras
      const printJobs = await buildPrintPayload(order as any, activePrinters as any)
      order.printJobs = printJobs as any
      order.printed = false // Hay jobs pendientes
    } else {
      // Sin impresoras: fallback al método viejo
      order.printed = false
      order.printJobs = []
    }

    await order.save()

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: 'Error al reimprimir' }, { status: 500 })
  }
}
