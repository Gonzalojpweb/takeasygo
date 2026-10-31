import FiscalDocument, { type IFiscalDocument } from '@/models/FiscalDocument'
import { FiscalIssueError, authorizeDocument, prepareInvoiceForOrder } from './issue'
import { issueWithCaea } from './caea'

// ============================================================================
// Resolución controlada de comprobantes en revisión — orden 31/10
// ============================================================================
// `needs_review` existe para que el sistema NO decida solo cuando hay riesgo
// fiscal. Cada acción vale solo para los motivos en que es segura:
//
//   retry_new_number   ARCA tiene el número reservado con OTROS datos: el
//                      pedido anterior no fue nuestro ⇒ pedir número nuevo.
//   reissue            cambió el ambiente o el CUIT (o faltaba identidad): se
//                      descarta este y se emite uno NUEVO con la configuración
//                      vigente (solo facturas).
//   retry_caea_report  ARCA rechazó el informe del CAEA: volver a informarlo.
//   discard            se descarta (nunca un CAEA ya entregado); la venta
//                      queda libre para facturarse de nuevo desde el panel.
//
// `duplicate_number` y `number_taken_locally` NO tienen acción automática:
// hay un CAE de ARCA de por medio y lo tiene que mirar una persona con el
// contador (se puede descartar solo si no hubo CAE para este comprobante).
// ============================================================================

export type ReviewAction = 'retry_new_number' | 'reissue' | 'retry_caea_report' | 'discard' | 'caea_manual'

const ALLOWED: Record<Exclude<ReviewAction, 'caea_manual'>, string[]> = {
  retry_new_number: ['arca_number_mismatch'],
  reissue: ['environment_mismatch', 'cuit_mismatch', 'missing_identity'],
  retry_caea_report: ['caea_report_rejected'],
  discard: ['arca_number_mismatch', 'environment_mismatch', 'cuit_mismatch', 'missing_identity', 'number_taken_locally'],
}

function resolved(doc: IFiscalDocument, userId: string): void {
  doc.review = { ...doc.review, resolvedBy: userId, resolvedAt: new Date() }
}

/** Libera la clave de idempotencia para que la venta pueda facturarse de nuevo. */
function releaseKey(doc: IFiscalDocument): void {
  doc.idempotencyKey = `${doc.idempotencyKey}:descartado:${String(doc._id)}`.slice(0, 120)
}

export async function resolveFiscalReview(
  doc: IFiscalDocument,
  action: ReviewAction,
  userId: string
): Promise<{ document: IFiscalDocument; replacement?: IFiscalDocument }> {
  // Contingencia MANUAL: un pendiente (no en revisión) que una persona decide
  // emitir con CAEA porque ARCA no responde. Mismos controles de elegibilidad.
  if (action === 'caea_manual') {
    if (doc.status !== 'pending' && doc.status !== 'retrying') {
      throw new FiscalIssueError('Solo un comprobante pendiente puede emitirse en contingencia')
    }
    let reason = ''
    const out = await issueWithCaea(doc, { trigger: 'manual', onIneligible: (r) => (reason = r) })
    if (!out) throw new FiscalIssueError(reason || 'No se puede usar la contingencia CAEA')
    return { document: out }
  }

  if (doc.status !== 'needs_review') throw new FiscalIssueError('El comprobante no está en revisión')
  if (!ALLOWED[action].includes(doc.review.code)) {
    throw new FiscalIssueError(`«${action}» no corresponde para este motivo (${doc.review.code}). Revisalo con el contador.`)
  }

  if (action === 'retry_new_number') {
    doc.reservedNumber = null
    doc.status = 'retrying'
    doc.arca.nextAttemptAt = null
    resolved(doc, userId)
    await doc.save()
    return { document: await authorizeDocument(doc) }
  }

  if (action === 'retry_caea_report') {
    doc.status = 'authorized'
    doc.caeaReportStatus = 'pending'
    resolved(doc, userId)
    await doc.save()
    return { document: doc }
  }

  if (doc.authMode === 'caea') throw new FiscalIssueError('Un comprobante CAEA ya entregado no se descarta')

  // discard / reissue: este comprobante queda rechazado (sin CAE) y la clave libre.
  doc.status = 'rejected'
  doc.arca.lastError = `Descartado por revisión (${doc.review.code})`
  resolved(doc, userId)
  releaseKey(doc)
  await doc.save()

  if (action === 'discard') return { document: doc }

  if (doc.kind !== 'invoice') {
    return { document: doc }
  }
  const fresh = await prepareInvoiceForOrder({
    tenantId: String(doc.tenantId),
    orderId: doc.orderId,
    receiver: { condition: doc.receiver.condition, docNumber: doc.receiver.docType === 99 ? null : doc.receiver.docNumber, name: doc.receiver.name },
    userId,
  })
  const replacement = await authorizeDocument(fresh)
  return { document: doc, replacement }
}

/** Busca un comprobante del comercio para resolverlo. */
export async function findDocumentForReview(tenantId: string, id: string): Promise<IFiscalDocument | null> {
  return FiscalDocument.findOne({ _id: id, tenantId })
}
