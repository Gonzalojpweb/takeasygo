import { ARCA_QR_URL } from './arca/endpoints'

// ============================================================================
// QR fiscal de ARCA (RG 4892/2020)
// ============================================================================
// URL: https://www.afip.gob.ar/fe/qr/?p=<base64(JSON)>
// Campos (especificación de ARCA, versión 1): ver, fecha (yyyy-mm-dd), cuit,
// ptoVta, tipoCmp, nroCmp, importe, moneda, ctz, tipoDocRec, nroDocRec,
// tipoCodAut ("E" = CAE), codAut.
// ============================================================================

export interface QrInput {
  issuedAt: Date
  cuit: string
  pointOfSale: number
  cbteTipo: number
  number: number
  totalCents: number
  docType: number
  docNumber: string
  cae: string
  /** 'E' = CAE (default) · 'A' = CAEA (contingencia). */
  authType?: 'E' | 'A'
}

function arDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function arcaQrPayload(input: QrInput): Record<string, string | number> {
  return {
    ver: 1,
    fecha: arDate(input.issuedAt),
    cuit: Number(input.cuit),
    ptoVta: input.pointOfSale,
    tipoCmp: input.cbteTipo,
    nroCmp: input.number,
    importe: Number((input.totalCents / 100).toFixed(2)),
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: input.docType,
    nroDocRec: Number(input.docNumber) || 0,
    tipoCodAut: input.authType ?? 'E',
    codAut: Number(input.cae),
  }
}

export function arcaQrUrl(input: QrInput): string {
  const json = JSON.stringify(arcaQrPayload(input))
  return `${ARCA_QR_URL}?p=${Buffer.from(json, 'utf8').toString('base64')}`
}
