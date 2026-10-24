import mongoose from 'mongoose'
import FiscalDocument from '@/models/FiscalDocument'
import type { ZFiscalSummary } from '@takeasygo/types'

// ============================================================================
// Comprobantes de un turno de caja para el Z (Fase 5 de caja, 2026-10)
// ============================================================================
// Por sede y ventana del turno (apertura → cierre). null si en el turno no
// hubo ningún comprobante (comercio que no factura: el Z no cambia).
// ============================================================================

export async function fiscalSummaryForShift(input: {
  tenantId: string
  locationId: string
  from: Date
  to: Date
}): Promise<ZFiscalSummary | null> {
  const docs = await FiscalDocument.find({
    tenantId: new mongoose.Types.ObjectId(input.tenantId),
    locationId: new mongoose.Types.ObjectId(input.locationId),
    createdAt: { $gte: input.from, $lte: input.to },
  })
    .select('kind status amounts.totalCents')
    .lean<{ kind: string; status: string; amounts: { totalCents: number } }[]>()
  if (docs.length === 0) return null
  const summary: ZFiscalSummary = { invoices: 0, invoicedCents: 0, creditNotes: 0, creditedCents: 0, pending: 0 }
  for (const d of docs) {
    if (d.status === 'pending' || d.status === 'retrying') summary.pending++
    if (d.status !== 'authorized') continue
    if (d.kind === 'invoice') {
      summary.invoices++
      summary.invoicedCents += d.amounts.totalCents
    } else {
      summary.creditNotes++
      summary.creditedCents += d.amounts.totalCents
    }
  }
  return summary
}
