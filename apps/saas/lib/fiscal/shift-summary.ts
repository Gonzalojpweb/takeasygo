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
    .select('kind status amounts.totalCents ivaGroups')
    .lean<{ kind: string; status: string; amounts: { totalCents: number }; ivaGroups?: { ivaRate: number; baseCents: number; amountCents: number }[] }[]>()
  if (docs.length === 0) return null
  const summary: ZFiscalSummary = { invoices: 0, invoicedCents: 0, creditNotes: 0, creditedCents: 0, pending: 0 }
  // IVA por alícuota: facturas suman, notas de crédito restan (solo autorizados).
  const byRate = new Map<number, { netCents: number; ivaCents: number }>()
  for (const d of docs) {
    if (d.status === 'pending' || d.status === 'retrying') summary.pending++
    if (d.status !== 'authorized') continue
    const sign = d.kind === 'invoice' ? 1 : -1
    for (const g of d.ivaGroups ?? []) {
      const cur = byRate.get(g.ivaRate) ?? { netCents: 0, ivaCents: 0 }
      cur.netCents += sign * g.baseCents
      cur.ivaCents += sign * g.amountCents
      byRate.set(g.ivaRate, cur)
    }
    if (d.kind === 'invoice') {
      summary.invoices++
      summary.invoicedCents += d.amounts.totalCents
    } else {
      summary.creditNotes++
      summary.creditedCents += d.amounts.totalCents
    }
  }
  summary.iva = [...byRate.entries()]
    .map(([rate, v]) => ({ rate, ...v }))
    .filter((r) => r.netCents !== 0 || r.ivaCents !== 0)
    .sort((a, b) => b.rate - a.rate)
  return summary
}
