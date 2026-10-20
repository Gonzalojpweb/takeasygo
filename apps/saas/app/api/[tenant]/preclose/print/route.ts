import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Printer from '@/models/Printer'
import PreClosePrintJob from '@/models/PreClosePrintJob'
import { aggregateOrdersForRange, buildPreCloseBuffer } from '@/lib/preclose-report'
import { NextRequest, NextResponse } from 'next/server'
import { enforcePermissionOrAdmin } from '@/lib/rbac'
import { getSessionUser } from '@/lib/apiAuth'
import mongoose from 'mongoose'

/**
 * POST /api/[tenant]/preclose/print
 * Body: { from: string (ISO date), to: string (ISO date), printerId: string }
 *       (printerName: string — compatibilidad; ambiguo entre sedes)
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

    // Flag off: admin-only (como siempre). Flag on: matriz v3 → admin+manager.
    const guardError = await enforcePermissionOrAdmin(request, {
      tenant,
      tenantId: tenant._id.toString(),
      permission: 'printjobs.manage',
    })
    if (guardError) return guardError

    // printerId (preferido): el nombre se repite entre sedes. printerName
    // queda por compatibilidad con clientes viejos.
    const { from, to, printerId, printerName } = await request.json()

    const validPrinterId = typeof printerId === 'string' && mongoose.Types.ObjectId.isValid(printerId)
    const validPrinterName = typeof printerName === 'string' && printerName.length > 0 && printerName.length <= 100
    if (typeof from !== 'string' || typeof to !== 'string' || (!validPrinterId && !validPrinterName)) {
      return NextResponse.json({ error: 'from, to y la impresora son obligatorios' }, { status: 400 })
    }

    const fromDate = new Date(from)
    const toDate = new Date(to)
    toDate.setHours(23, 59, 59, 999)

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return NextResponse.json({ error: 'Fechas inválidas' }, { status: 400 })
    }

    // Need locationId to filter printers and aggregate orders
    // The user can have multiple locations — we use printerName to resolve
    // Un usuario con sedes asignadas solo busca entre las impresoras de sus sedes.
    const user = await getSessionUser(request)
    const scoped = user?.role === 'superadmin' ? [] : (user?.assignedLocations ?? [])
    const printer = await Printer.findOne({
      tenantId: tenant._id,
      ...(validPrinterId ? { _id: printerId } : { name: printerName }),
      ...(scoped.length > 0 ? { locationId: { $in: scoped } } : {}),
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
    data.timezone = location.timezone

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
  } catch {
    return NextResponse.json({ error: 'Error al generar cierre de turno' }, { status: 500 })
  }
}
