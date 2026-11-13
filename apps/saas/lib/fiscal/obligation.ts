import mongoose from 'mongoose'
import FiscalProfile from '@/models/FiscalProfile'
import { logAudit } from '@/lib/audit'
import type { ReceiverCondition } from '@/models/FiscalDocument'
import { FiscalIssueError, prepareInvoiceForOrder, type ReceiverInput } from './issue'
import { enqueueControllerInvoice, loadModality } from './controller'
import Order from '@/models/Order'
import { readOfflineCaea, recordOfflineCaeaInvoice, type OfflineCaeaInvoice } from '@/lib/pos-online/offlineFiscal'

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

/**
 * Lo que el POS manda en el cobro. `undefined` = POS viejo (no informó).
 * `offlineCaea` (etapa 5 del POS offline): el comprobante que el equipo ya
 * emitió con CAEA sin internet y le entregó al cliente.
 */
export type InvoiceIntent = { none: true } | { receiver: ReceiverInput; offlineCaea?: OfflineCaeaInvoice | null } | undefined

/** Lee y valida `body.invoice` del pedido de cobro. */
export function readInvoiceIntent(body: unknown): InvoiceIntent {
  const raw = (body as { invoice?: unknown } | null)?.invoice
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== 'object') return undefined
  const value = raw as { none?: unknown; offlineCaea?: unknown; receiver?: { condition?: unknown; docNumber?: unknown; name?: unknown; address?: unknown } }
  if (value.none === true) return { none: true }
  const r = value.receiver
  if (!r || typeof r !== 'object') return undefined
  const condition = typeof r.condition === 'string' && CONDITIONS.has(r.condition as ReceiverCondition) ? (r.condition as ReceiverCondition) : 'consumidor_final'
  return {
    receiver: {
      condition,
      docNumber: typeof r.docNumber === 'string' ? r.docNumber.slice(0, 20) : null,
      name: typeof r.name === 'string' ? r.name.slice(0, 120) : null,
      address: typeof r.address === 'string' ? r.address.slice(0, 120) : null,
    },
    ...(value.offlineCaea !== undefined ? { offlineCaea: readOfflineCaea(value.offlineCaea) } : {}),
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
  /** Reenvío de un equipo que estuvo sin internet (etapa 5). */
  offline?: { deviceId: string | null; trusted: boolean; printedPrinterIds: string[]; locationId: string } | null
}): Promise<'created' | 'skipped' | 'failed'> {
  try {
    const profile = await FiscalProfile.findOne({ tenantId: input.tenantId })
      .select('enabled invoicingMode')
      .lean<{ enabled?: boolean; invoicingMode?: 'ask' | 'always' | 'off' }>()
    if (!profile || profile.invoicingMode === 'off') return 'skipped'
    // La sede decide la modalidad: con impresora fiscal activa no hace falta
    // la facturación electrónica (ni su certificado) habilitada.
    const order = await Order.findById(input.orderId).select('locationId').lean<{ locationId: unknown }>()
    const { modality } = await loadModality(input.tenantId, String(order?.locationId ?? ''))
    if (modality === 'none' || (modality === 'electronic' && !profile.enabled)) return 'skipped'

    let receiver: ReceiverInput | null = null
    if (input.intent && 'receiver' in input.intent) receiver = input.intent.receiver
    // POS que no informó la decisión: con «facturar siempre», consumidor final.
    else if (!input.intent && profile.invoicingMode === 'always') receiver = { condition: 'consumidor_final' }
    if (!receiver) return 'skipped'

    // Factura emitida sin internet con CAEA: se guarda la que se entregó.
    const offlineCaea = input.intent && 'receiver' in input.intent ? input.intent.offlineCaea : undefined
    if (offlineCaea && modality === 'electronic') {
      await recordOfflineCaeaInvoice({
        tenantId: input.tenantId,
        locationId: input.offline?.locationId ?? String(order?.locationId ?? ''),
        orderId: input.orderId,
        deviceId: input.offline?.deviceId ?? null,
        trusted: input.offline?.trusted === true,
        invoice: offlineCaea,
        printedPrinterIds: input.offline?.printedPrinterIds ?? [],
        userId: input.userId,
      })
      return 'created'
    }

    if (modality === 'controller') {
      await enqueueControllerInvoice({ tenantId: input.tenantId, orderId: String(input.orderId), receiver, userId: input.userId })
      return 'created'
    }
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
