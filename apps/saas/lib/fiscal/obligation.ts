import mongoose from 'mongoose'
import FiscalProfile from '@/models/FiscalProfile'
import { logAudit } from '@/lib/audit'
import type { ReceiverCondition } from '@/models/FiscalDocument'
import { FiscalIssueError, prepareInvoiceForOrder, type ReceiverInput } from './issue'

// ============================================================================
// Obligación fiscal al cobrar — orden de ejecución 31/10 (P1.2)
// ============================================================================
// Antes la factura dependía de un SEGUNDO pedido del POS después del cobro:
// si el POS se cerraba o perdía la red en ese instante, quedaba una venta
// cobrada sin nada en el servidor que la recuperara.
//
// Ahora el pedido de cobro trae la decisión del cajero (`invoice`) y el
// servidor, apenas confirma el cobro, deja el comprobante PENDIENTE (sin
// llamar a ARCA, rápido y sin red externa). La emisión la hace el pedido de
// factura del POS o, si nunca llega, la recuperación automática. Todo es
// idempotente por orden: nunca hay dos facturas para una venta.
//
// No se acopla a ARCA: el cobro NUNCA falla por la factura.
// ============================================================================

const CONDITIONS = new Set<ReceiverCondition>(['consumidor_final', 'responsable_inscripto', 'monotributo', 'exento', 'no_categorizado'])

/** Lo que el POS manda en el cobro. `undefined` = POS viejo (no informó). */
export type InvoiceIntent = { none: true } | { receiver: ReceiverInput } | undefined

/** Lee y valida `body.invoice` del pedido de cobro. */
export function readInvoiceIntent(body: unknown): InvoiceIntent {
  const raw = (body as { invoice?: unknown } | null)?.invoice
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== 'object') return undefined
  const value = raw as { none?: unknown; receiver?: { condition?: unknown; docNumber?: unknown; name?: unknown } }
  if (value.none === true) return { none: true }
  const r = value.receiver
  if (!r || typeof r !== 'object') return undefined
  const condition = typeof r.condition === 'string' && CONDITIONS.has(r.condition as ReceiverCondition) ? (r.condition as ReceiverCondition) : 'consumidor_final'
  return {
    receiver: {
      condition,
      docNumber: typeof r.docNumber === 'string' ? r.docNumber.slice(0, 20) : null,
      name: typeof r.name === 'string' ? r.name.slice(0, 120) : null,
    },
  }
}

/**
 * Deja persistida la obligación de facturar una orden recién cobrada.
 * Nunca lanza: un problema queda en el log de auditoría y lo detecta la
 * salud fiscal (venta cobrada sin comprobante).
 */
export async function registerFiscalObligation(input: {
  tenantId: string
  orderId: mongoose.Types.ObjectId | string
  userId: string
  userRole: string
  intent: InvoiceIntent
}): Promise<'created' | 'skipped' | 'failed'> {
  try {
    const profile = await FiscalProfile.findOne({ tenantId: input.tenantId })
      .select('enabled invoicingMode')
      .lean<{ enabled?: boolean; invoicingMode?: 'ask' | 'always' | 'off' }>()
    if (!profile?.enabled || profile.invoicingMode === 'off') return 'skipped'

    let receiver: ReceiverInput | null = null
    if (input.intent && 'receiver' in input.intent) receiver = input.intent.receiver
    // POS que no informó la decisión: con «facturar siempre», consumidor final.
    else if (!input.intent && profile.invoicingMode === 'always') receiver = { condition: 'consumidor_final' }
    if (!receiver) return 'skipped'

    await prepareInvoiceForOrder({ tenantId: input.tenantId, orderId: input.orderId, receiver, userId: input.userId })
    return 'created'
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al registrar la factura'
    await logAudit({
      tenantId: input.tenantId,
      action: 'fiscal.obligation.failed',
      entity: 'Order',
      entityId: String(input.orderId),
      details: { message, validation: err instanceof FiscalIssueError },
      userId: input.userId,
      userRole: input.userRole,
    }).catch(() => undefined)
    console.error(`[fiscal/obligation] orden ${String(input.orderId)}: ${message}`)
    return 'failed'
  }
}
