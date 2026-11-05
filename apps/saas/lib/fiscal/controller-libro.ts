import mongoose from 'mongoose'
import { computeIvaBreakdown, invoiceLetterFor, type IssuerIvaCondition, type IvaRatePct, type ReceiverIvaCondition } from '@takeasygo/business'
import FiscalControllerJob, { type IFiscalControllerJob } from '@/models/FiscalControllerJob'
import type { LibroIvaDoc } from './libro-iva'

// ============================================================================
// Comprobantes de la impresora fiscal en el Libro IVA
// ============================================================================
// El número y la letra los da el equipo. El desglose de IVA se calcula con los
// ítems de la venta, con la misma función que la factura electrónica. Lo emitido
// en modo entrenamiento no tiene validez fiscal y no entra.
// ============================================================================

const TYPES: Record<string, { cbteTipo: number; letter: 'A' | 'B' | 'C'; kind: 'invoice' | 'credit_note'; label: string }> = {
  TIQUE: { cbteTipo: 83, letter: 'B', kind: 'invoice', label: 'Tique' },
  'TIQUE FACTURA A': { cbteTipo: 81, letter: 'A', kind: 'invoice', label: 'Tique Factura A' },
  'TIQUE FACTURA B': { cbteTipo: 82, letter: 'B', kind: 'invoice', label: 'Tique Factura B' },
  'TIQUE FACTURA C': { cbteTipo: 111, letter: 'C', kind: 'invoice', label: 'Tique Factura C' },
  'TIQUE NOTA DE CREDITO': { cbteTipo: 110, letter: 'B', kind: 'credit_note', label: 'Tique Nota de crédito' },
  'TIQUE NOTA DE CREDITO A': { cbteTipo: 112, letter: 'A', kind: 'credit_note', label: 'Tique Nota de crédito A' },
  'TIQUE NOTA DE CREDITO B': { cbteTipo: 113, letter: 'B', kind: 'credit_note', label: 'Tique Nota de crédito B' },
  'TIQUE NOTA DE CREDITO C': { cbteTipo: 114, letter: 'C', kind: 'credit_note', label: 'Tique Nota de crédito C' },
}

/** Un resultado resuelto a mano puede no traer el tipo: se deduce del receptor. */
function typeOf(job: IFiscalControllerJob): string {
  if (job.result.documentType && TYPES[job.result.documentType]) return job.result.documentType
  const receiver = job.payload?.receiver
  const credit = job.operation === 'credit_note'
  if (!receiver || receiver.docType === 99) return credit ? 'TIQUE NOTA DE CREDITO' : 'TIQUE'
  const issuer = (job.payload?.issuerIvaCondition ?? 'responsable_inscripto') as IssuerIvaCondition
  const letter = invoiceLetterFor(issuer, receiver.condition as ReceiverIvaCondition)
  return `${credit ? 'TIQUE NOTA DE CREDITO' : 'TIQUE FACTURA'} ${letter}`
}

export function controllerJobToLibroDoc(job: IFiscalControllerJob, fallbackPointOfSale: number): LibroIvaDoc | null {
  if (job.status !== 'confirmed' || !job.result?.number || !job.payload || job.result.training) return null
  const type = TYPES[typeOf(job)]
  const issuer: IssuerIvaCondition =
    type.letter === 'C' ? 'monotributo' : ((job.payload.issuerIvaCondition ?? 'responsable_inscripto') as IssuerIvaCondition)
  const breakdown = computeIvaBreakdown(
    job.payload.lines.map((l) => ({ grossCents: l.totalCents, ivaRate: l.ivaRate as IvaRatePct })),
    job.payload.discountCents ?? 0,
    issuer
  )
  const receiver = job.payload.receiver
  return {
    kind: type.kind,
    letter: type.letter,
    cbteTipo: type.cbteTipo,
    label: type.label,
    pointOfSale: job.result.pointOfSale ?? fallbackPointOfSale,
    number: job.result.number,
    issuedAt: job.result.issuedAt ?? job.createdAt,
    receiver: { condition: receiver.condition, docType: receiver.docType, docNumber: receiver.docNumber, name: receiver.name },
    amounts: { totalCents: breakdown.totalCents, netCents: breakdown.netCents, ivaCents: breakdown.ivaCents, exemptCents: breakdown.exemptCents },
    ivaGroups: breakdown.groups.map((g) => ({ ivaRate: g.ivaRate, afipId: g.afipId, baseCents: g.netCents, amountCents: g.ivaCents })),
    cae: null,
    caeExpiresAt: null,
  } as LibroIvaDoc
}

/** Comprobantes emitidos en un rango. El Libro IVA es del CUIT: todas las sedes. */
export async function controllerDocsForLibro(tenantId: string | mongoose.Types.ObjectId, range: { from: Date; to: Date }): Promise<LibroIvaDoc[]> {
  const jobs = await FiscalControllerJob.find({
    tenantId,
    operation: { $in: ['invoice', 'credit_note'] },
    status: 'confirmed',
    createdAt: { $gte: range.from, $lt: range.to },
  })
    .sort({ createdAt: 1 })
    .limit(20000)
  const posByLocation = new Map<string, number>()
  for (const j of jobs) if (j.result?.pointOfSale) posByLocation.set(String(j.locationId), j.result.pointOfSale)
  return jobs.flatMap((j) => controllerJobToLibroDoc(j, posByLocation.get(String(j.locationId)) ?? 0) ?? [])
}
