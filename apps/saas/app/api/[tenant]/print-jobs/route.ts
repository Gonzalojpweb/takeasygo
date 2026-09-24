import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Printer from '@/models/Printer'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import PreClosePrintJob from '@/models/PreClosePrintJob'
import { NextRequest, NextResponse } from 'next/server'
import { safeDecrypt } from '@/lib/crypto'

const MAX_ATTEMPTS = 3

// Versión mínima del agente que soporta el formato nuevo (jobs pre-renderizados)
// Agentes >= 2.0.0 envían X-Agent-Version header
const NEW_AGENT_VERSION = '2.0.0'

// ============================================================================
// computePollInterval — Adaptativo según serviceHours de la sede
// ============================================================================
function parseHHmm(value: string | number): [number, number] {
  if (typeof value === 'number') return [value, 0]
  const [h, m] = String(value).split(':').map(Number)
  return [h || 0, m || 0]
}

function isWithinWindow(now: Date, window: { days?: number[]; open: string; close: string }): boolean {
  if (window.days?.length && !window.days.includes(now.getDay())) return false

  const [openH, openM] = parseHHmm(window.open)
  const [closeH, closeM] = parseHHmm(window.close)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const openMin = openH * 60 + openM
  const closeMin = closeH * 60 + closeM

  if (closeMin > openMin) {
    return nowMin >= openMin && nowMin < closeMin
  }
  // Cruza medianoche (ej. delivery 18:00 a 02:00)
  return nowMin >= openMin || nowMin < closeMin
}

function computePollInterval(location: any): number {
  const now = new Date()
  const channels = location?.serviceHours || {}
  const isInService = Object.values(channels).some((channel: any) => {
    if (!Array.isArray(channel)) return false
    return channel.some((w: any) => isWithinWindow(now, w))
  })
  return isInService ? 5000 : 60000
}

// ============================================================================
// GET — Agente busca trabajos de impresión pendientes
// ============================================================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const locationId = request.nextUrl.searchParams.get('locationId')
    const agentVersion = request.headers.get('x-agent-version') || request.nextUrl.searchParams.get('agentVersion')

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    if (!locationId) return NextResponse.json({ error: 'locationId es obligatorio' }, { status: 400 })

    const location = await Location.findOne({ _id: locationId, tenantId: tenant._id, isActive: true })
    if (!location) return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })

    const printers = await Printer.find({
      tenantId: tenant._id,
      locationId,
      isActive: true,
    }).lean()

    const preCloseJobs = await PreClosePrintJob.find({
      tenantId: tenant._id,
      locationId,
      status: 'pending',
    }).lean()

    const pollInterval = computePollInterval(location)

    // ── Detectar si el agente soporta el formato nuevo ────────────────
    const isNewAgent = agentVersion && compareVersions(agentVersion, NEW_AGENT_VERSION) >= 0

    if (isNewAgent) {
      // ── Formato NUEVO: jobs pre-renderizados ────────────────────────
      const printerIds = printers.map((p: any) => p._id.toString())

      const orders = await Order.find({
        tenantId: tenant._id,
        locationId,
        deletedAt: null,
        status: { $in: ['confirmed', 'preparing', 'ready'] },
        $or: [
          // Formato nuevo: printJobs con pending/error
          { printJobs: { $elemMatch: { printerId: { $in: printerIds }, status: { $in: ['pending', 'error'] } } } },
          // Fallback: órdenes viejas sin printJobs (printed=false)
          { printed: false, printJobs: { $size: 0 } },
        ],
      }).lean()

      const jobs: any[] = []
      for (const order of orders as any[]) {
        if (order.printJobs?.length) {
          for (const job of order.printJobs) {
            const retryable = job.status === 'error' && job.attempts < MAX_ATTEMPTS
            const isPending = job.status === 'pending' || retryable
            if (isPending && printerIds.includes(job.printerId?.toString())) {
              jobs.push({
                orderId: order._id,
                printJobId: job._id,
                printerName: job.printerName,
                role: job.role,
                payload: job.payload,
              })
            }
          }
        } else if (order.printed === false) {
          // Fallback: orden vieja sin printJobs — el agente nuevo no puede manejarla
          // Devolvemos vacío para que no intente renderizar
        }
      }

      // Enviar también printers para que el agente resuelva printerName → config
      return NextResponse.json({ jobs, printers, preCloseJobs, pollInterval })
    } else {
      // ── Formato VIEJO: orders + printers (decrypt en cada poll) ─────
      const orders = await Order.find({
        tenantId: tenant._id,
        locationId,
        deletedAt: null,
        printed: false,
        status: { $in: ['confirmed', 'preparing', 'ready'] },
      })
        .select('orderNumber items total customer notes status payment createdAt locationId orderTiming scheduledPickupAt scheduledStatus orderMode deliveryAddress promoSlug promoCode promoCreatedBy discountAmount')
        .lean()

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

      return NextResponse.json({ orders: ordersWithLocation, printers, preCloseJobs, pollInterval })
    }
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener trabajos de impresión' }, { status: 500 })
  }
}

// ============================================================================
// POST — Agente reporta resultado de impresión
// ============================================================================
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
    const { success, errorMsg } = body
    const preCloseJobId = body.preCloseJobId

    // ── Pre-close job ──────────────────────────────────────────────────
    if (preCloseJobId) {
      const printerName = body.printerName
      const job = await PreClosePrintJob.findOne({ _id: preCloseJobId, tenantId: tenant._id })
      if (!job) return NextResponse.json({ error: 'Trabajo de pre-cierre no encontrado' }, { status: 404 })

      job.status = success ? 'success' : 'error'
      await job.save()

      if (printerName) {
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
      }

      return NextResponse.json({ ok: true })
    }

    // ── Order job — Formato NUEVO (printJobId) ────────────────────────
    if (body.printJobId) {
      const { orderId, printJobId } = body
      if (!orderId || !printJobId) {
        return NextResponse.json({ error: 'orderId y printJobId son obligatorios' }, { status: 400 })
      }

      const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
      if (!order) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })

      const job = order.printJobs?.id(printJobId)
      if (!job) return NextResponse.json({ error: 'Print job no encontrado' }, { status: 404 })

      job.attempts += 1
      if (success) {
        job.status = 'success'
        job.printedAt = new Date()
        job.lastError = null
      } else {
        job.status = job.attempts >= MAX_ATTEMPTS ? 'failed' : 'error'
        job.lastError = errorMsg || 'unknown error'
      }

      // Recalcular printed desde printJobs
      order.printed = order.printJobs.every((j: any) => j.status === 'success')

      // Mantener printLog para auditoría
      order.printLog.push({
        printerName: job.printerName,
        role: job.role,
        success: !!success,
        error: errorMsg ?? '',
        printedAt: new Date(),
      })

      await order.save()

      // Actualizar estado de la impresora
      await Printer.findOneAndUpdate(
        { tenantId: tenant._id, name: job.printerName },
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

    // ── Order job — Formato VIEJO (printerName + role) ────────────────
    const { orderId, printerName, role } = body
    if (!orderId || !printerName || !role) {
      return NextResponse.json({ error: 'orderId, printerName y role son obligatorios' }, { status: 400 })
    }

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
    if (!order) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })

    order.printLog.push({
      printerName,
      role,
      success: !!success,
      error: errorMsg ?? '',
      printedAt: new Date(),
    })

    if (success) {
      order.printed = true
    }

    await order.save()

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

// ============================================================================
// Helpers
// ============================================================================
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}
