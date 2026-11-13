import { ARCA_QR_URL } from './arca/endpoints'
import { arcaQrPayload as sharedPayload, arcaQrUrl as sharedUrl, type ArcaQrInput } from '@takeasygo/business/escpos'

// ============================================================================
// QR fiscal de ARCA (RG 4892/2020)
// ============================================================================
// URL: https://www.arca.gob.ar/fe/qr/?p=<base64(JSON)>
// Campos (especificación de ARCA, versión 1): ver, fecha (yyyy-mm-dd), cuit,
// ptoVta, tipoCmp, nroCmp, importe, moneda, ctz, tipoDocRec, nroDocRec,
// tipoCodAut ("E" = CAE, "A" = CAEA), codAut.
// Desde la etapa 5 del POS offline el armado vive en @takeasygo/business/escpos
// (el equipo sin internet arma el QR de la factura con CAEA).
// ============================================================================

export type QrInput = ArcaQrInput

export function arcaQrPayload(input: QrInput): Record<string, string | number> {
  return sharedPayload(input)
}

export function arcaQrUrl(input: QrInput): string {
  return sharedUrl(input, ARCA_QR_URL)
}
