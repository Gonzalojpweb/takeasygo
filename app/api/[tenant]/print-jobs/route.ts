import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Printer from '@/models/Printer'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/[tenant]/print-jobs?locationId=xxx
 * El agente local lo llama periódicamente para buscar órdenes pendientes de impresión.
 * Devuelve órdenes no impresas + lista de impresoras activas para esa sede.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const locationId = request.nextUrl.searchParams.get('locationId')
    if (!locationId) return NextResponse.json({ error: 'locationId es obligatorio' }, { status: 400 })

    const location = await Location.findOne({ _id: locationId, tenantId: tenant._id, isActive: true })
    if (!location) return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })

    // Órdenes confirmadas o en preparación que aún no fueron impresas
    const orders = await Order.find({
      tenantId: tenant._id,
      locationId,
      printed: false,
      status: { $in: ['confirmed', 'preparing'] },
    })
      .select('orderNumber items total customer notes status payment createdAt locationId')
      .lean()

    const printers = await Printer.find({
      tenantId: tenant._id,
      locationId,
      isActive: true,
    }).lean()

    // Enriquecer órdenes con datos de la sede
    const ordersWithLocation = orders.map(o => ({
      ...o,
      location: { locationName: location.name },
    }))

    return NextResponse.json({ orders: ordersWithLocation, printers })
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener trabajos de impresión' }, { status: 500 })
  }
}

/**
 * POST /api/[tenant]/print-jobs
 * El agente confirma el resultado de cada intento de impresión.
 * Body: { orderId, printerName, role, success, errorMsg }
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

    const { orderId, printerName, role, success, errorMsg } = await request.json()

    if (!orderId || !printerName || !role) {
      return NextResponse.json({ error: 'orderId, printerName y role son obligatorios' }, { status: 400 })
    }

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
    if (!order) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })

    // Registrar el intento en el log
    order.printLog.push({
      printerName,
      role,
      success: !!success,
      error: errorMsg ?? '',
      printedAt: new Date(),
    })

    // Marcar como impresa si al menos un intento fue exitoso
    if (success) {
      order.printed = true
    }

    await order.save()

    // Actualizar estado de la impresora (lastStatus + lastError)
    await Printer.findOneAndUpdate(
      { tenantId: tenant._id, name: printerName },
      {
        $set: {
          lastStatus: success ? 'ok' : 'error',
          lastError: errorMsg ?? '',
          ...(success ? { lastPrintAt: new Date() } : {}),
        },
      }
    )

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: 'Error al confirmar impresión' }, { status: 500 })
  }
}
