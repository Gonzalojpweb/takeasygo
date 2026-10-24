import type { FiscalEnvironment } from '@/models/FiscalProfile'

// ============================================================================
// URLs oficiales de ARCA (ex AFIP) — WSAA y WSFEv1
// ============================================================================
// Homologación = ambiente de pruebas (comprobantes sin validez fiscal).
// Producción = facturas reales. Nunca se mezclan: el ticket de acceso y el
// certificado son de un ambiente.
// ============================================================================

export const ARCA_ENDPOINTS: Readonly<Record<FiscalEnvironment, { wsaa: string; wsfe: string }>> = {
  homologation: {
    wsaa: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  },
  production: {
    wsaa: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
  },
}

/** Namespace SOAP del WSFEv1 (también es el prefijo de SOAPAction). */
export const WSFE_NS = 'http://ar.gov.afip.dif.FEV1/'

/** URL del QR fiscal (RG 4892). */
export const ARCA_QR_URL = 'https://www.afip.gob.ar/fe/qr/'

/** Tiempo máximo de espera de una llamada a ARCA. */
export const ARCA_TIMEOUT_MS = 20_000
