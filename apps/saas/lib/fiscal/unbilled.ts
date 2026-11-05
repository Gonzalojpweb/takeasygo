import mongoose from 'mongoose'
import AuditLog from '@/models/AuditLog'
import FiscalControllerJob from '@/models/FiscalControllerJob'
import FiscalDocument from '@/models/FiscalDocument'
import Order from '@/models/Order'

// ============================================================================
// Ventas cobradas sin comprobante
// ============================================================================
// Una venta puede quedar cobrada sin comprobante porque el cajero eligió «Sin
// factura» o porque el pedido falló (CUIT inválido, sin conexión). El cobro
// nunca se frena por eso, así que hay que poder verlas y emitirlas después.
// `failureMessage` distingue las que fallaron: esas son una alerta.
// ============================================================================

export interface UnbilledOrder {
  posId: string
  orderNumber: string | null
  totalCents: number
  createdAt: Date
  failureMessage: string | null
}

const DAY_MS = 86_400_000

export async function listUnbilledOrders(
  tenantIdRaw: string,
  locationIdRaw: string,
  options: { days?: number; now?: Date } = {}
): Promise<UnbilledOrder[]> {
  const tenantId = new mongoose.Types.ObjectId(tenantIdRaw)
  const locationId = new mongoose.Types.ObjectId(locationIdRaw)
  const now = options.now ?? new Date()
  const orders = await Order.find({
    tenantId,
    locationId,
    'posPayments.0': { $exists: true },
    posId: { $exists: true, $ne: null },
    status: { $ne: 'cancelled' },
    total: { $gt: 0 },
    createdAt: { $gte: new Date(now.getTime() - (options.days ?? 7) * DAY_MS) },
  })
    .sort({ createdAt: -1 })
    .limit(300)
    .select('posId orderNumber total createdAt')
    .lean<{ _id: mongoose.Types.ObjectId; posId: string; orderNumber?: string; total: number; createdAt: Date }[]>()
  if (orders.length === 0) return []

  const ids = orders.map((o) => o._id)
  const [documents, jobs, failures] = await Promise.all([
    FiscalDocument.distinct('orderId', { tenantId, kind: 'invoice', status: { $ne: 'rejected' }, orderId: { $in: ids } }),
    // Un comprobante que no salió ya figura en la lista de la impresora, con Reintentar.
    FiscalControllerJob.distinct('orderId', { tenantId, operation: 'invoice', orderId: { $in: ids } }),
    AuditLog.find({ tenantId, action: 'fiscal.obligation.failed', entity: 'Order', entityId: { $in: ids.map(String) } })
      .sort({ createdAt: 1 })
      .select('entityId details')
      .lean<{ entityId: string; details?: { message?: string } }[]>(),
  ])
  const billed = new Set([...documents, ...jobs].map(String))
  const failed = new Map(failures.map((f) => [f.entityId, f.details?.message ?? 'No se pudo emitir']))

  return orders
    .filter((o) => !billed.has(String(o._id)))
    .map((o) => ({
      posId: o.posId,
      orderNumber: o.orderNumber ?? null,
      totalCents: o.total,
      createdAt: o.createdAt,
      failureMessage: failed.get(String(o._id)) ?? null,
    }))
}
