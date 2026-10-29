import { PAPER_COLUMNS, effectiveDocuments, isPrinterDocument, type PrinterDocument } from '@takeasygo/business'
import type { ZReport } from '@takeasygo/types'
import { PosError } from './errors'
import { precuentaLines } from './precuenta'
import { zTicketLines, type TicketLine } from '@/lib/cash/z-ticket'
import { fiscalTicketLines, type IssuerForTicket } from '@/lib/fiscal/ticket'
import type { IFiscalDocument } from '@/models/FiscalDocument'

// ============================================================================
// Configuración › Impresoras del POS (Fase 1, 29/10/2026)
// ============================================================================
// Vista del POS sobre el MISMO modelo Printer del SaaS. Estilos: los
// printSettings por rol que ya existían (comanda = kitchen/bar, el resto =
// cashier). La vista previa usa los renderers reales con datos de ejemplo
// («Café Demo»), así sale igual que el ticket impreso.
// ============================================================================

export interface PrinterDoc {
  _id: unknown
  name: string
  connectionType: 'tcp' | 'usb'
  ip: string
  port: number
  roles?: string[]
  documents?: string[]
  paperWidth: 58 | 80
  isActive: boolean
  lastStatus?: string
  lastError?: string
  lastPrintAt?: Date | null
  printSettings?: Record<string, Record<string, unknown>>
}

export function toPosPrinter(p: PrinterDoc) {
  return {
    id: String(p._id),
    name: p.name,
    connectionType: p.connectionType,
    ip: p.ip,
    port: p.port,
    paperWidth: p.paperWidth,
    columns: PAPER_COLUMNS[p.paperWidth] ?? 48,
    documents: effectiveDocuments(p),
    /** false = usa los documentos de su rol (impresora anterior a la Fase 1). */
    customDocuments: (p.documents ?? []).length > 0,
    isActive: p.isActive,
    lastStatus: p.lastStatus ?? 'unknown',
    lastError: p.lastError ?? '',
    lastPrintAt: p.lastPrintAt ?? null,
    printSettings: p.printSettings ?? {},
  }
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/

export function parsePrinterFields(body: Record<string, unknown>, partial: boolean) {
  const out: Record<string, unknown> = {}
  if (body.name !== undefined || !partial) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 60) throw PosError.validation('Nombre de la impresora (hasta 60 caracteres)')
    out.name = body.name.trim()
  }
  if (body.ip !== undefined || !partial) {
    if (typeof body.ip !== 'string' || !IPV4.test(body.ip.trim())) throw PosError.validation('IP inválida (ej. 192.168.0.50)')
    out.ip = body.ip.trim()
  }
  if (body.port !== undefined) {
    const port = Number(body.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw PosError.validation('Puerto inválido')
    out.port = port
  }
  if (body.connectionType !== undefined) {
    if (body.connectionType !== 'tcp' && body.connectionType !== 'usb') throw PosError.validation('Conexión inválida')
    out.connectionType = body.connectionType
  }
  if (body.paperWidth !== undefined) {
    if (body.paperWidth !== 58 && body.paperWidth !== 80) throw PosError.validation('Ancho de papel: 58 u 80 mm')
    out.paperWidth = body.paperWidth
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') throw PosError.validation('isActive debe ser booleano')
    out.isActive = body.isActive
  }
  return out
}

const FONT_SIZES = ['normal', 'large', 'double', 'triple']
const BOOL_KEYS = ['showDescriptions', 'showPrices', 'showCategory', 'showCustomerInfo', 'showOrderNotes', 'showTotal'] as const

/** Estilos por rol: solo las claves conocidas, con tipos validados. */
export function parsePrintSettings(input: unknown): Record<string, Record<string, unknown>> {
  if (!input || typeof input !== 'object') throw PosError.validation('printSettings inválido')
  const out: Record<string, Record<string, unknown>> = {}
  for (const role of ['kitchen', 'bar', 'cashier'] as const) {
    const raw = (input as Record<string, unknown>)[role]
    if (raw === undefined) continue
    if (!raw || typeof raw !== 'object') throw PosError.validation(`Estilos de ${role} inválidos`)
    const r = raw as Record<string, unknown>
    const clean: Record<string, unknown> = {}
    if (r.fontSize !== undefined) {
      if (!FONT_SIZES.includes(String(r.fontSize))) throw PosError.validation('Tamaño de letra inválido')
      clean.fontSize = r.fontSize
    }
    for (const k of BOOL_KEYS) {
      if (r[k] !== undefined) {
        if (typeof r[k] !== 'boolean') throw PosError.validation(`${k} debe ser booleano`)
        clean[k] = r[k]
      }
    }
    for (const k of ['headerTemplate', 'footerTemplate'] as const) {
      if (r[k] !== undefined) {
        if (typeof r[k] !== 'string' || (r[k] as string).length > 200) throw PosError.validation(`${k}: hasta 200 caracteres`)
        clean[k] = (r[k] as string).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
      }
    }
    out[role] = clean
  }
  return out
}

// ── Vista previa ────────────────────────────────────────────────────────────

const SAMPLE_AT = new Date('2026-10-29T21:40:00-03:00')

export function previewLines(
  doc: PrinterDocument,
  paperWidth: 58 | 80,
  opts: { header?: string; footer?: string; locationName?: string } = {}
): TicketLine[] {
  if (!isPrinterDocument(doc)) throw PosError.validation('Documento inválido')
  const columns = PAPER_COLUMNS[paperWidth]
  const location = opts.locationName || 'Café Demo'
  let lines: TicketLine[]
  switch (doc) {
    case 'precuenta':
      lines = precuentaLines({
        locationName: location,
        tableNumber: 12,
        guests: 4,
        at: SAMPLE_AT,
        timezone: 'America/Argentina/Buenos_Aires',
        columns,
        items: [
          { name: 'Milanesa napolitana', quantity: 2, subtotal: 3_600_000, discountCents: 0 },
          { name: 'Papas fritas', quantity: 1, subtotal: 650_000, discountCents: 0 },
          { name: 'Agua sin gas', quantity: 3, subtotal: 540_000, discountCents: 0 },
          { name: 'Flan con dulce de leche', quantity: 2, subtotal: 900_000, discountCents: 90_000 },
        ],
      })
      break
    case 'reporte_caja':
      lines = zTicketLines(SAMPLE_Z, { tenantName: 'Café Demo', locationName: location, openedAt: new Date('2026-10-29T12:00:00-03:00'), columns, timezone: 'America/Argentina/Buenos_Aires' })
      break
    case 'factura':
    case 'nota_credito':
      lines = fiscalTicketLines(sampleFiscalDoc(doc), SAMPLE_ISSUER, columns).map((text) => ({ text }))
      break
    case 'ticket':
      lines = ticketSample(columns, location)
      break
    case 'comanda':
    default:
      lines = comandaSample(columns)
  }
  const out: TicketLine[] = []
  if (opts.header) out.push(...opts.header.split('\n').map((text) => ({ text: text.slice(0, columns), center: true })))
  out.push(...lines.map((l) => ({ ...l, text: l.text.slice(0, l.large ? Math.floor(columns / 2) : columns) })))
  if (opts.footer) out.push(...opts.footer.split('\n').map((text) => ({ text: text.slice(0, columns), center: true })))
  return out
}

function row(label: string, value: string, columns: number): string {
  return `${label} ${'.'.repeat(Math.max(1, columns - label.length - value.length - 1))}${value}`
}

function comandaSample(columns: number): TicketLine[] {
  return [
    { text: 'COMANDA · COCINA', bold: true, center: true },
    { text: 'Mesa 12 · Mozo: Juan', center: true },
    { text: '-'.repeat(columns) },
    { text: '2 x Milanesa napolitana', large: true },
    { text: '    sin jamón' },
    { text: '1 x Papas fritas', large: true },
    { text: '-'.repeat(columns) },
    { text: '21:40 · #A-0142', center: true },
  ]
}

function ticketSample(columns: number, location: string): TicketLine[] {
  return [
    { text: location, bold: true, center: true },
    { text: 'TICKET NO VÁLIDO COMO FACTURA', center: true },
    { text: '-'.repeat(columns) },
    { text: row('2 x Milanesa napolitana', '$36.000', columns) },
    { text: row('1 x Papas fritas', '$6.500', columns) },
    { text: '-'.repeat(columns) },
    { text: row('TOTAL', '$42.500', columns), bold: true },
    { text: 'Pedido #A-0142 · Efectivo', center: true },
  ]
}

const SAMPLE_ISSUER: IssuerForTicket = {
  legalName: 'CAFE DEMO SRL',
  cuit: '30712345679',
  fiscalAddress: 'Av. Siempre Viva 742, CABA',
  grossIncomeNumber: '901-123456-7',
  activityStartDate: new Date('2020-03-01T00:00:00Z'),
  ivaCondition: 'responsable_inscripto',
}

function sampleFiscalDoc(doc: 'factura' | 'nota_credito'): IFiscalDocument {
  const credit = doc === 'nota_credito'
  return {
    kind: credit ? 'credit_note' : 'invoice',
    letter: 'B',
    cbteTipo: credit ? 8 : 6,
    pointOfSale: 3,
    number: credit ? 12 : 1042,
    issuedAt: SAMPLE_AT,
    receiver: { condition: 'consumidor_final', docType: 99, docNumber: '0', name: '' },
    associated: credit ? { pointOfSale: 3, number: 1041, cbteTipo: 6 } : null,
    lines: [
      { description: 'Milanesa napolitana', quantity: 2, totalCents: 3_600_000, ivaRate: 21 },
      { description: 'Papas fritas', quantity: 1, totalCents: 650_000, ivaRate: 21 },
    ],
    amounts: { netCents: 3_512_397, ivaCents: 737_603, exemptCents: 0, totalCents: 4_250_000 },
    ivaGroups: [{ ivaRate: 21, afipId: 5, baseCents: 3_512_397, amountCents: 737_603 }],
    cae: '76123456789012',
    caeExpiresAt: new Date('2026-11-08T00:00:00Z'),
    authMode: 'cae',
    environment: 'production',
  } as unknown as IFiscalDocument
}

const SAMPLE_Z = {
  registerId: 'ejemplo',
  tenantId: 'ejemplo',
  closedAt: SAMPLE_AT,
  closedBy: 'Ana (cajera)',
  initialAmount: 2_000_000,
  finalAmount: 9_850_000,
  expectedAmount: 9_900_000,
  difference: -50_000,
  byChannel: {
    counter: { sales: 7_900_000, income: 0, expenses: 0, refunds: 0, movementCount: 18 },
    takeasygo: { sales: 2_400_000, income: 0, expenses: 0, refunds: 0, movementCount: 6 },
  },
  byPaymentMethod: { cash: 7_900_000, mercadopago: 2_400_000 },
  totalMovements: 25,
  incomeTotal: 10_300_000,
  expenseTotal: 50_000,
  salesTotal: 10_300_000,
  refundTotal: 0,
  byCategory: { suppliers: 50_000 },
  voidCount: 0,
  generatedAt: SAMPLE_AT,
} as unknown as ZReport
