import { IVA_RATES, RECEIVER_IVA_CONDITION_LABELS, formatCuit, toPesos } from '@takeasygo/business'
import type { IFiscalDocument } from '@/models/FiscalDocument'

// ============================================================================
// Libro IVA Ventas (Fase 5 de caja, 2026-10)
// ============================================================================
// Una fila por comprobante AUTORIZADO del período, con neto e IVA por
// alícuota, exento y total. Las notas de crédito restan (montos negativos).
// Formato CSV con «;» y coma decimal (lo abre Excel en español) y BOM UTF-8.
//
// Nota para el contador: los comprobantes electrónicos ya están en ARCA →
// «Mis Comprobantes», desde donde el Libro IVA Digital los importa. Este
// archivo sirve para controlar y conciliar contra la caja.
// ============================================================================

type Doc = Pick<
  IFiscalDocument,
  'kind' | 'letter' | 'cbteTipo' | 'pointOfSale' | 'number' | 'issuedAt' | 'receiver' | 'amounts' | 'ivaGroups' | 'cae' | 'caeExpiresAt'
>

const TAXED_RATES = IVA_RATES.filter((r) => r.pct > 0)

function num(cents: number): string {
  return toPesos(cents).toFixed(2).replace('.', ',')
}

function cell(value: string): string {
  // Evita inyección de fórmulas al abrir en Excel y escapa separadores.
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value
  return /[;"\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export interface LibroIvaTotals {
  documents: number
  netCents: number
  ivaCents: number
  exemptCents: number
  totalCents: number
  byRate: Record<string, { netCents: number; ivaCents: number }>
}

export function libroIvaTotals(docs: readonly Doc[]): LibroIvaTotals {
  const totals: LibroIvaTotals = { documents: 0, netCents: 0, ivaCents: 0, exemptCents: 0, totalCents: 0, byRate: {} }
  for (const d of docs) {
    const sign = d.kind === 'credit_note' ? -1 : 1
    totals.documents++
    totals.netCents += sign * d.amounts.netCents
    totals.ivaCents += sign * d.amounts.ivaCents
    totals.exemptCents += sign * d.amounts.exemptCents
    totals.totalCents += sign * d.amounts.totalCents
    for (const g of d.ivaGroups.filter((x) => x.ivaRate > 0)) {
      const key = String(g.ivaRate)
      const acc = (totals.byRate[key] ??= { netCents: 0, ivaCents: 0 })
      acc.netCents += sign * g.baseCents
      acc.ivaCents += sign * g.amountCents
    }
  }
  return totals
}

export function libroIvaCsv(docs: readonly Doc[]): string {
  const header = [
    'Fecha',
    'Comprobante',
    'Código',
    'Punto de venta',
    'Número',
    'Tipo doc. receptor',
    'Nro. doc. receptor',
    'Receptor',
    'Condición IVA receptor',
    ...TAXED_RATES.flatMap((r) => [`Neto ${r.label}`, `IVA ${r.label}`]),
    'Exento',
    'Total',
    'CAE',
    'Vto. CAE',
  ]
  const rows = [...docs]
    .sort((a, b) => new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime() || (a.number ?? 0) - (b.number ?? 0))
    .map((d) => {
      const sign = d.kind === 'credit_note' ? -1 : 1
      const byRate = new Map(d.ivaGroups.map((g) => [g.ivaRate, g]))
      return [
        new Date(d.issuedAt).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }),
        `${d.kind === 'invoice' ? 'Factura' : 'Nota de crédito'} ${d.letter}`,
        String(d.cbteTipo).padStart(3, '0'),
        String(d.pointOfSale).padStart(5, '0'),
        String(d.number ?? '').padStart(8, '0'),
        d.receiver.docType === 80 ? 'CUIT' : d.receiver.docType === 96 ? 'DNI' : 'Sin identificar',
        d.receiver.docType === 80 ? formatCuit(d.receiver.docNumber) : d.receiver.docType === 96 ? d.receiver.docNumber : '',
        d.receiver.name,
        RECEIVER_IVA_CONDITION_LABELS[d.receiver.condition],
        ...TAXED_RATES.flatMap((r) => {
          const g = byRate.get(r.pct)
          return [g ? num(sign * g.baseCents) : '', g ? num(sign * g.amountCents) : '']
        }),
        num(sign * d.amounts.exemptCents),
        num(sign * d.amounts.totalCents),
        d.cae ?? '',
        d.caeExpiresAt ? new Date(d.caeExpiresAt).toLocaleDateString('es-AR', { timeZone: 'UTC' }) : '',
      ]
    })
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n'
}

/** "2026-10" → [inicio, fin) en hora argentina. */
export function monthRange(month: string): { from: Date; to: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  if (!m) return null
  const year = Number(m[1])
  const mon = Number(m[2])
  if (mon < 1 || mon > 12) return null
  const from = new Date(Date.UTC(year, mon - 1, 1, 3, 0, 0)) // 00:00 AR = 03:00 UTC
  const to = new Date(Date.UTC(mon === 12 ? year + 1 : year, mon === 12 ? 0 : mon, 1, 3, 0, 0))
  return { from, to }
}
