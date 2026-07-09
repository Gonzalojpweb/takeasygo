import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Printer from '@/models/Printer'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import PreClosePrintJob from '@/models/PreClosePrintJob'
import { NextRequest, NextResponse } from 'next/server'
import { safeDecrypt } from '@/lib/crypto'

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

    const locationId = request.nextUrl.searchParams.get('locationId')
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    console.log(`[PRINT-JOBS] GET tenant=${tenantSlug} locationId=${locationId} ip=${ip}`)

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    if (!locationId) return NextResponse.json({ error: 'locationId es obligatorio' }, { status: 400 })

    const location = await Location.findOne({ _id: locationId, tenantId: tenant._id, isActive: true })
    if (!location) return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })

    // Órdenes confirmadas o en preparación que aún no fueron impresas
    const orders = await Order.find({
      tenantId: tenant._id,
      locationId,
      deletedAt: null,
      printed: false,
      status: { $in: ['confirmed', 'preparing', 'ready'] },
    })
      .select('orderNumber items total customer notes status payment createdAt locationId orderTiming scheduledPickupAt scheduledStatus orderMode promoSlug promoCode promoCreatedBy discountAmount')
      .lean()

    const printers = await Printer.find({
      tenantId: tenant._id,
      locationId,
      isActive: true,
    }).lean()

    // Trabajos de pre-cierre pendientes para esta sede
    const preCloseJobs = await PreClosePrintJob.find({
      tenantId: tenant._id,
      locationId,
      status: 'pending',
    }).lean()

    // Enriquecer órdenes con datos de la sede y desencriptar PII del cliente
    const ordersWithLocation = (orders as any[]).map(o => ({
      ...o,
      customer: o.customer ? {
        ...o.customer,
        name:  safeDecrypt(o.customer.name  ?? ''),
        phone: safeDecrypt(o.customer.phone ?? ''),
        email: safeDecrypt(o.customer.email ?? ''),
      } : o.customer,
      location: { locationName: location.name },
    }))

    return NextResponse.json({ orders: ordersWithLocation, printers, preCloseJobs, pollInterval: 15000 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener trabajos de impresión' }, { status: 500 })
  }
}

/**
 * POST /api/[tenant]/print-jobs
 * El agente confirma el resultado de cada intento de impresión.
 * Body (order): { orderId, printerName, role, success, errorMsg }
 * Body (preClose): { preCloseJobId, printerName, success, errorMsg }
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

    const body = await request.json()
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    console.log(`[PRINT-JOBS] POST tenant=${tenantSlug} printer=${body.printerName} success=${body.success} ip=${ip}`)
    const { printerName, success, errorMsg } = body
    const preCloseJobId = body.preCloseJobId

    // ── Pre-close job ──────────────────────────────────────────────────
    if (preCloseJobId) {
      const job = await PreClosePrintJob.findOne({ _id: preCloseJobId, tenantId: tenant._id })
      if (!job) return NextResponse.json({ error: 'Trabajo de pre-cierre no encontrado' }, { status: 404 })

      job.status = success ? 'success' : 'error'
      await job.save()

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
    }

    // ── Order job ──────────────────────────────────────────────────────
    const { orderId, role } = body

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
