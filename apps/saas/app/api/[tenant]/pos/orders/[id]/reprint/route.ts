import { NextResponse } from 'next/server'
import Order from '@/models/Order'
import Printer from '@/models/Printer'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { assertPosId } from '@/lib/pos-online/orderRepo'
import { operatorName } from '@/lib/pos-online/operator'
import { buildPrintPayload } from '@/lib/printing'
import type { IPrintJob } from '@/models/Order'

// ============================================================================
// POST /api/[tenant]/pos/orders/[id]/reprint — reimprimir la COMANDA
// ============================================================================
// Pedido 19/11/2026: la reimpresión de comandas existía solo en el panel del
// SaaS. En el POS va separada de la de comprobantes:
//   · COMANDA (esta ruta): el ticket de cocina/barra de una ronda ya enviada.
//     Se puede reimprimir cuantas veces haga falta; sale con «REIMPRESIÓN ·
//     NO PREPARAR DE NUEVO» para que la estación no la cocine dos veces.
//   · COMPROBANTE fiscal: no se reimprime como venta nueva — se reimprime el
//     autorizado desde Facturación (POST /pos/fiscal/documents/[id]/reprint).
//   · PRECUENTA: desde la mesa (POST /pos/tables/[id]/precuenta).
//
// Body (opcional): { station?: 'kitchen' | 'bar' }  — sin station: todas las
// estaciones que recibieron platos de la ronda. Nunca genera ticket de caja.
// Quién: caja/encargado/admin directo; el mozo con el PIN de un admin o
// encargado (capacidad `orders.reprint`, delegable).
// ============================================================================

const STATIONS = new Set(['kitchen', 'bar'])
const STATION_LABEL: Record<string, string> = { kitchen: 'Cocina', bar: 'Barra' }

type BuildPrintOrder = Parameters<typeof buildPrintPayload>[0]
type BuildPrintPrinter = Parameters<typeof buildPrintPayload>[1][number]

export const POST = posRoute<{ tenant: string; id: string }>('orders.reprint', async (ctx, params) => {
  const posId = assertPosId(params.id)
  // Body opcional: sin body (o vacío) = todas las estaciones.
  const raw: { station?: unknown } = await readPosBody<{ station?: unknown }>(ctx.request).catch(() => ({}))
  const station = raw.station
  if (station !== undefined && station !== null && (typeof station !== 'string' || !STATIONS.has(station))) {
    throw PosError.validation('station inválida: kitchen o bar')
  }

  const order = await Order.findOne({ tenantId: ctx.tenantId, locationId: ctx.locationId, posId })
  if (!order) throw PosError.notFound('Orden no encontrada')
  if (order.status === 'pending') {
    throw PosError.conflict('Esta ronda todavía no se mandó a cocina: no hay comanda para reimprimir')
  }
  if (order.status === 'cancelled') {
    throw PosError.conflict('La ronda está anulada: no se reimprime su comanda')
  }

  const printers = await Printer.find({ tenantId: ctx.tenantId, locationId: ctx.locationId, isActive: true }).lean()
  const stations = printers.filter((p) => (p.roles ?? []).some((r: string) => STATIONS.has(r) && (!station || r === station)))
  if (stations.length === 0) {
    throw PosError.conflict(station ? `No hay impresora de ${STATION_LABEL[station as string]} activa en esta sede` : 'No hay impresoras de cocina o barra activas en esta sede')
  }

  const by = await operatorName(ctx)
  const jobs: IPrintJob[] = []
  for (const role of station ? [station as string] : ['kitchen', 'bar']) {
    jobs.push(
      ...(await buildPrintPayload(order as unknown as BuildPrintOrder, stations as unknown as BuildPrintPrinter[], {
        onlyRole: role,
        isReprint: true,
        skipCashierTicket: true,
        reprintBy: by,
      }))
    )
  }
  if (jobs.length === 0) {
    throw PosError.conflict(station ? `Esta ronda no tiene platos para ${STATION_LABEL[station as string]}` : 'Esta ronda no tiene platos para cocina ni barra')
  }

  // Se agregan sin pisar otros jobs pendientes (la comanda original, marchas).
  await Order.updateOne({ _id: order._id }, { $push: { printJobs: { $each: jobs } }, $set: { printed: false } })

  const printerNames = [...new Set(jobs.map((j) => j.printerName))]
  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.order.reprint',
    entity: 'Order',
    entityId: posId,
    details: {
      posId,
      orderNumber: order.orderNumber,
      table: (order as unknown as { posTableNumber?: number | null }).posTableNumber ?? null,
      station: station ?? 'all',
      jobs: jobs.length,
      printers: printerNames,
      approvedBy: ctx.approval?.approvedBy ?? null,
    },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })

  return NextResponse.json({ ok: true, jobs: jobs.length, printers: printerNames })
})
