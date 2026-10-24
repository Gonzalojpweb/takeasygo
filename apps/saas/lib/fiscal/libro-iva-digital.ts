import type { IFiscalDocument } from '@/models/FiscalDocument'

// ============================================================================
// Libro IVA Digital — archivos de importación de VENTAS (RG 4597)
// ============================================================================
// Fase 6 de caja (2026-10). Docs: ADMIN/FASE6_ONLINE_POINT_CAEA_LIBRO_DIGITAL.md
//
// Dos archivos de texto de ancho fijo, una línea por registro, CRLF:
//   · VENTAS_CBTE      (266 caracteres): un registro por comprobante.
//   · VENTAS_ALICUOTAS  (62 caracteres): un registro por alícuota gravada.
// Montos: 15 dígitos (13 enteros + 2 decimales, sin separador). Las notas de
// crédito van con importes POSITIVOS (el tipo de comprobante dice que restan).
//
// ⚠ El aplicativo de ARCA valida cada campo al importar: si algo no le gusta,
// lo informa con número de línea y campo. Es la prueba definitiva del formato
// (ver checklist de la fase 6). Alternativa sin archivo: el Libro IVA Digital
// puede tomar los comprobantes electrónicos directo de «Mis Comprobantes».
// ============================================================================

type Doc = Pick<
  IFiscalDocument,
  'kind' | 'letter' | 'cbteTipo' | 'pointOfSale' | 'number' | 'issuedAt' | 'receiver' | 'amounts' | 'ivaGroups'
>

export const CBTE_LINE_LENGTH = 266
export const ALICUOTA_LINE_LENGTH = 62

function digits(value: number | string, width: number): string {
  const text = String(value).replace(/\D/g, '')
  if (text.length > width) throw new Error(`Campo numérico demasiado largo (${width})`)
  return text.padStart(width, '0')
}

function amount(cents: number, width = 15): string {
  return digits(Math.abs(Math.round(cents)), width)
}

function text(value: string, width: number): string {
  const ascii = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .toUpperCase()
  return ascii.slice(0, width).padEnd(width, ' ')
}

function arDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .replace(/-/g, '')
}

/** Alícuotas a informar: las gravadas; un comprobante A/B sin gravado informa 0 % (id 3). */
function alicuotas(d: Doc): { afipId: number; baseCents: number; amountCents: number }[] {
  if (d.letter === 'C') return []
  const taxed = d.ivaGroups.filter((g) => g.ivaRate > 0)
  if (taxed.length > 0) return taxed.map((g) => ({ afipId: g.afipId, baseCents: g.baseCents, amountCents: g.amountCents }))
  return [{ afipId: 3, baseCents: 0, amountCents: 0 }]
}

/** Código de operación: E = todo exento; 0 = operación normal. */
function operationCode(d: Doc): string {
  return d.letter !== 'C' && d.amounts.exemptCents > 0 && d.amounts.netCents === 0 ? 'E' : '0'
}

export function cbteLine(d: Doc): string {
  const nro = d.number ?? 0
  const name = d.receiver.docType === 99 && !d.receiver.name ? 'CONSUMIDOR FINAL' : d.receiver.name
  const line =
    arDate(new Date(d.issuedAt)) + // 1 fecha (8)
    digits(d.cbteTipo, 3) + // 2 tipo de comprobante
    digits(d.pointOfSale, 5) + // 3 punto de venta
    digits(nro, 20) + // 4 número
    digits(nro, 20) + // 5 número hasta
    digits(d.receiver.docType, 2) + // 6 código de documento del comprador
    digits(d.receiver.docNumber || '0', 20) + // 7 número de documento
    text(name, 30) + // 8 apellido y nombre / denominación
    amount(d.amounts.totalCents) + // 9 total
    amount(0) + // 10 no gravado
    amount(0) + // 11 percepción a no categorizados
    amount(d.letter === 'C' ? 0 : d.amounts.exemptCents) + // 12 exento
    amount(0) + // 13 percepciones nacionales
    amount(0) + // 14 percepciones IIBB
    amount(0) + // 15 percepciones municipales
    amount(0) + // 16 impuestos internos
    'PES' + // 17 moneda
    '0001000000' + // 18 tipo de cambio (4 enteros + 6 decimales)
    String(alicuotas(d).length) + // 19 cantidad de alícuotas
    operationCode(d) + // 20 código de operación
    amount(0) + // 21 otros tributos
    '00000000' // 22 fecha de vencimiento de pago (no corresponde)
  if (line.length !== CBTE_LINE_LENGTH) throw new Error(`Línea de comprobante con largo ${line.length}`)
  return line
}

export function alicuotaLines(d: Doc): string[] {
  return alicuotas(d).map((a) => {
    const line =
      digits(d.cbteTipo, 3) +
      digits(d.pointOfSale, 5) +
      digits(d.number ?? 0, 20) +
      amount(a.baseCents) +
      digits(a.afipId, 4) +
      amount(a.amountCents)
    if (line.length !== ALICUOTA_LINE_LENGTH) throw new Error(`Línea de alícuota con largo ${line.length}`)
    return line
  })
}

/** Archivos de ventas del período (solo comprobantes autorizados, en orden). */
export function libroIvaDigitalFiles(docs: readonly Doc[]): { comprobantes: string; alicuotas: string } {
  const sorted = [...docs]
    .filter((d) => d.number !== null)
    .sort(
      (a, b) =>
        new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime() ||
        a.cbteTipo - b.cbteTipo ||
        a.pointOfSale - b.pointOfSale ||
        (a.number ?? 0) - (b.number ?? 0)
    )
  const join = (lines: string[]) => (lines.length ? lines.join('\r\n') + '\r\n' : '')
  return {
    comprobantes: join(sorted.map(cbteLine)),
    alicuotas: join(sorted.flatMap(alicuotaLines)),
  }
}
