import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Printer from '@/models/Printer'
import PreClosePrintJob from '@/models/PreClosePrintJob'
import { aggregateOrdersForRange, buildPreCloseBuffer } from '@/lib/preclose-report'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/[tenant]/preclose/print
 * Body: { from: string (ISO date), to: string (ISO date), printerName: string }
 * Generates the pre-close ESC/POS buffer and creates a PreClosePrintJob.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const { from, to, printerName } = await request.json()

    if (!from || !to || !printerName) {
      return NextResponse.json({ error: 'from, to y printerName son obligatorios' }, { status: 400 })
    }

    const fromDate = new Date(from)
    const toDate = new Date(to)
    toDate.setHours(23, 59, 59, 999)

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return NextResponse.json({ error: 'Fechas inválidas' }, { status: 400 })
    }

    // Need locationId to filter printers and aggregate orders
    // The user can have multiple locations — we use printerName to resolve
    const printer = await Printer.findOne({
      tenantId: tenant._id,
      name: printerName,
      isActive: true,
    })

    if (!printer) {
      return NextResponse.json({ error: 'Impresora no encontrada o inactiva' }, { status: 404 })
    }

    const location = await Location.findOne({ _id: printer.locationId, tenantId: tenant._id })
    if (!location) {
      return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })
    }

    // Aggregate
    const data = await aggregateOrdersForRange(
      tenant._id.toString(),
      location._id.toString(),
      fromDate,
      toDate,
      location.name
    )

    // Generate ESC/POS buffer (base64)
    const columns = printer.paperWidth === 80 ? 48 : 32
    const dataBase64 = buildPreCloseBuffer(data, columns)

    // Create print job
    const job = await PreClosePrintJob.create({
      tenantId: tenant._id,
      locationId: location._id,
      printerName: printer.name,
      connectionType: printer.connectionType,
      ip: printer.ip,
      port: printer.port,
      paperWidth: printer.paperWidth,
      data: dataBase64,
      status: 'pending',
    })

    return NextResponse.json({
      ok: true,
      jobId: job._id,
      summary: {
        totalOrders: data.totalOrders,
        totalRevenue: data.totalRevenue,
        avgTicket: data.avgTicket,
        deliveryCosts: data.deliveryCosts,
        takeawayCount: data.takeawayCount,
        deliveryCount: data.deliveryCount,
        cancelledCount: data.cancelledCount,
        topItemsCount: data.topItems.length,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: 'Error al generar cierre de turno' }, { status: 500 })
  }
}
