import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import Printer from '@/models/Printer'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { buildPrintPayload } from '@/lib/printing'

const VALID_ROLES = ['kitchen', 'bar', 'cashier'] as const

function isValidRole(role: string): boolean {
  return (VALID_ROLES as readonly string[]).includes(role)
}

function roleLabel(role: string): string {
  if (role === 'kitchen') return 'Cocina'
  if (role === 'bar') return 'Barra'
  if (role === 'cashier') return 'Caja'
  return role
}

type ReprintBody = { printerId?: string; role?: string }
type BuildPrintOrder = Parameters<typeof buildPrintPayload>[0]
type BuildPrintPrinter = Parameters<typeof buildPrintPayload>[1][number]

/**
 * POST /api/[tenant]/orders/[orderId]/reprint
 *
 * Body opcional:
 *   { printerId?: string, role?: 'kitchen' | 'bar' | 'cashier' }
 *
 * - Sin body: regenera printJobs para TODAS las impresoras activas de la sede
 *   (comportamiento histórico del panel lateral del Kanban).
 * - Con printerId + role: genera UN solo job para esa impresora y ese tipo de
 *   ticket, y lo agrega a la lista sin pisar otros jobs pendientes.
 *
 * Todos los jobs generados acá se marcan isReprint: true → el agente los
 * entrega sin importar el estado del pedido ni el gate T-lead.
 */
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

    const body = (await request.json().catch(() => ({}))) as ReprintBody
    const printerId = body.printerId
    const role = body.role

    // ── Reimpresión selectiva: una impresora + un tipo de ticket ──────────
    if (printerId) {
      if (!role || !isValidRole(role)) {
        return NextResponse.json({ error: 'role es obligatorio (kitchen, bar o cashier)' }, { status: 400 })
      }

      const printer = await Printer.findOne({
        _id: printerId,
        tenantId: tenant._id,
        locationId: order.locationId,
        isActive: true,
      }).lean()

      if (!printer) {
        return NextResponse.json(
          { error: 'Impresora no encontrada o inactiva para la sede de este pedido' },
          { status: 400 }
        )
      }

      if (!(printer.roles || []).includes(role)) {
        return NextResponse.json(
          { error: `La impresora "${printer.name}" no tiene habilitado el tipo de ticket ${roleLabel(role)}` },
          { status: 400 }
        )
      }

      const newJobs = await buildPrintPayload(
        order as unknown as BuildPrintOrder,
        [printer] as unknown as BuildPrintPrinter[],
        { onlyRole: role, isReprint: true }
      )

      if (newJobs.length === 0) {
        return NextResponse.json(
          { error: `Este pedido no tiene ítems para ${roleLabel(role)}` },
          { status: 400 }
        )
      }

      // Agregar sin pisar otros jobs pendientes (ej. la impresión automática original)
      if (!order.printJobs) order.printJobs = []
      for (const job of newJobs) {
        order.printJobs.push(job)
      }
      order.printed = false

      await order.save()

      return NextResponse.json({ ok: true, jobs: newJobs.length, printerName: printer.name, role })
    }

    // ── Reimpresión general (panel lateral del Kanban): todas las impresoras
    //    activas de la sede, regeneradas con la config actual ─────────────
    const activePrinters = await Printer.find({
      tenantId: tenant._id,
      locationId: order.locationId,
      isActive: true,
    }).lean()

    if (activePrinters.length > 0) {
      const printJobs = await buildPrintPayload(
        order as unknown as BuildPrintOrder,
        activePrinters as unknown as BuildPrintPrinter[],
        { isReprint: true }
      )
      order.printJobs = printJobs
      order.printed = false // Hay jobs pendientes
    } else {
      // Sin impresoras: fallback al método viejo
      order.printed = false
      order.printJobs = []
    }

    // Reimpresión general = ya se mandó todo a todas: la impresión en cocina
    // diferida queda saldada (no dejar el flag huérfano en pedidos cash).
    order.kitchenPrintDeferred = false

    await order.save()

    return NextResponse.json({ ok: true, jobs: order.printJobs.length })
  } catch {
    return NextResponse.json({ error: 'Error al reimprimir' }, { status: 500 })
  }
}
