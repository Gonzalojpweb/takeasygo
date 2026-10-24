import type { FiscalEnvironment } from '@/models/FiscalProfile'
import { ARCA_ENDPOINTS, ARCA_TIMEOUT_MS, WSFE_NS } from './endpoints'
import { escapeXml, getAllTags, getText } from './xml'

// ============================================================================
// WSFEv1 — Web Service de Factura Electrónica de ARCA
// ============================================================================
// Fase 4 de caja (2026-10). Docs: ADMIN/FASE4_ARCA_FACTURA_ELECTRONICA.md.
// Métodos usados (manual del desarrollador WSFEv1):
//   · FEDummy                — estado de los servidores (sin autenticación)
//   · FECompUltimoAutorizado — último número por punto de venta y tipo
//   · FECAESolicitar         — pide el CAE de UN comprobante
//   · FECompConsultar        — consulta un comprobante ya emitido (para
//                              resolver un timeout sin duplicar números)
// Montos: el sistema trabaja en centavos; ARCA recibe pesos con 2 decimales.
// ============================================================================

export class ArcaError extends Error {
  constructor(
    readonly kind: 'network' | 'timeout' | 'fault' | 'rejected' | 'auth',
    message: string,
    readonly code?: string
  ) {
    super(message)
    this.name = 'ArcaError'
  }
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

export interface WsfeAuth {
  token: string
  sign: string
  cuit: string
}

export interface ArcaMessage {
  code: string
  message: string
}

/** Centavos → "1234.56" (formato que espera ARCA). */
export function toArcaAmount(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error('Monto inválido')
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/** Fecha → "yyyymmdd" en hora argentina. */
export function toArcaDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
  return parts.replace(/-/g, '')
}

/** "yyyymmdd" → Date (mediodía AR, para no correr de día). */
export function fromArcaDate(value: string): Date | null {
  if (!/^\d{8}$/.test(value)) return null
  return new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T15:00:00Z`)
}

function authXml(auth: WsfeAuth): string {
  return `<ar:Auth><ar:Token>${escapeXml(auth.token)}</ar:Token><ar:Sign>${escapeXml(auth.sign)}</ar:Sign><ar:Cuit>${escapeXml(auth.cuit)}</ar:Cuit></ar:Auth>`
}

function envelope(method: string, inner: string): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="${WSFE_NS}">` +
    `<soapenv:Header/><soapenv:Body><ar:${method}>${inner}</ar:${method}></soapenv:Body></soapenv:Envelope>`
  )
}

const AUTH_ERROR_CODES = new Set(['600', '601'])

function parseMessages(xml: string, container: string, item: string): ArcaMessage[] {
  return getAllTags(xml, container).flatMap((block) =>
    getAllTags(block, item).map((entry) => ({
      code: getText(entry, 'Code') ?? '',
      message: getText(entry, 'Msg') ?? '',
    }))
  )
}

export async function soapCall(
  env: FiscalEnvironment,
  method: string,
  inner: string,
  fetchImpl: FetchLike = fetch
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ARCA_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetchImpl(ARCA_ENDPOINTS[env].wsfe, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `"${WSFE_NS}${method}"` },
      body: envelope(method, inner),
      signal: controller.signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw new ArcaError('timeout', 'ARCA no respondió a tiempo')
    throw new ArcaError('network', 'No se pudo conectar con ARCA')
  } finally {
    clearTimeout(timer)
  }
  const text = await res.text()
  const fault = getText(text, 'faultstring')
  if (fault) throw new ArcaError('fault', `ARCA: ${fault}`)
  if (!res.ok) throw new ArcaError('network', `ARCA respondió ${res.status}`)
  return text
}

/** Errores generales de la respuesta (token vencido, CUIT no autorizado, etc.). */
function assertNoErrors(xml: string): void {
  const errors = parseMessages(xml, 'Errors', 'Err')
  if (errors.length === 0) return
  const first = errors[0]
  // 600: firma/ticket inválido · 601: el CUIT no está en el ticket (falta
  // asociar el certificado al servicio wsfe en ARCA).
  const auth = AUTH_ERROR_CODES.has(first.code)
  throw new ArcaError(auth ? 'auth' : 'rejected', `${first.code}: ${first.message}`, first.code)
}

export async function feDummy(env: FiscalEnvironment, fetchImpl?: FetchLike): Promise<{ app: string; db: string; auth: string }> {
  const xml = await soapCall(env, 'FEDummy', '', fetchImpl)
  return {
    app: getText(xml, 'AppServer') ?? '',
    db: getText(xml, 'DbServer') ?? '',
    auth: getText(xml, 'AuthServer') ?? '',
  }
}

export async function feCompUltimoAutorizado(
  env: FiscalEnvironment,
  auth: WsfeAuth,
  pointOfSale: number,
  cbteTipo: number,
  fetchImpl?: FetchLike
): Promise<number> {
  const xml = await soapCall(
    env,
    'FECompUltimoAutorizado',
    `${authXml(auth)}<ar:PtoVta>${pointOfSale}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo>`,
    fetchImpl
  )
  assertNoErrors(xml)
  const nro = Number(getText(xml, 'CbteNro'))
  if (!Number.isInteger(nro) || nro < 0) throw new ArcaError('fault', 'Respuesta de ARCA sin número de comprobante')
  return nro
}

export interface CaeRequest {
  pointOfSale: number
  cbteTipo: number
  /** 1 = productos (gastronomía). */
  concepto: 1
  docTipo: number
  docNro: string
  number: number
  date: Date
  totalCents: number
  netCents: number
  exemptCents: number
  ivaCents: number
  receiverIvaConditionId: number
  iva: { afipId: number; baseCents: number; amountCents: number }[]
  associated?: { cbteTipo: number; pointOfSale: number; number: number; cuit: string; date: Date }[]
}

export interface CaeResult {
  result: 'A' | 'R' | 'P'
  cae: string | null
  caeExpiresAt: Date | null
  number: number
  observations: ArcaMessage[]
  errors: ArcaMessage[]
}

export function caeRequestXml(req: CaeRequest): string {
  const iva =
    req.iva.length > 0
      ? `<ar:Iva>${req.iva
          .map(
            (a) =>
              `<ar:AlicIva><ar:Id>${a.afipId}</ar:Id><ar:BaseImp>${toArcaAmount(a.baseCents)}</ar:BaseImp><ar:Importe>${toArcaAmount(a.amountCents)}</ar:Importe></ar:AlicIva>`
          )
          .join('')}</ar:Iva>`
      : ''
  const assoc =
    req.associated && req.associated.length > 0
      ? `<ar:CbtesAsoc>${req.associated
          .map(
            (c) =>
              `<ar:CbteAsoc><ar:Tipo>${c.cbteTipo}</ar:Tipo><ar:PtoVta>${c.pointOfSale}</ar:PtoVta><ar:Nro>${c.number}</ar:Nro><ar:Cuit>${escapeXml(c.cuit)}</ar:Cuit><ar:CbteFch>${toArcaDate(c.date)}</ar:CbteFch></ar:CbteAsoc>`
          )
          .join('')}</ar:CbtesAsoc>`
      : ''
  return (
    `<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${req.pointOfSale}</ar:PtoVta><ar:CbteTipo>${req.cbteTipo}</ar:CbteTipo></ar:FeCabReq>` +
    `<ar:FeDetReq><ar:FECAEDetRequest>` +
    `<ar:Concepto>${req.concepto}</ar:Concepto><ar:DocTipo>${req.docTipo}</ar:DocTipo><ar:DocNro>${escapeXml(req.docNro)}</ar:DocNro>` +
    `<ar:CbteDesde>${req.number}</ar:CbteDesde><ar:CbteHasta>${req.number}</ar:CbteHasta><ar:CbteFch>${toArcaDate(req.date)}</ar:CbteFch>` +
    `<ar:ImpTotal>${toArcaAmount(req.totalCents)}</ar:ImpTotal><ar:ImpTotConc>0.00</ar:ImpTotConc>` +
    `<ar:ImpNeto>${toArcaAmount(req.netCents)}</ar:ImpNeto><ar:ImpOpEx>${toArcaAmount(req.exemptCents)}</ar:ImpOpEx>` +
    `<ar:ImpTrib>0.00</ar:ImpTrib><ar:ImpIVA>${toArcaAmount(req.ivaCents)}</ar:ImpIVA>` +
    `<ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz>` +
    `<ar:CondicionIVAReceptorId>${req.receiverIvaConditionId}</ar:CondicionIVAReceptorId>` +
    assoc +
    iva +
    `</ar:FECAEDetRequest></ar:FeDetReq></ar:FeCAEReq>`
  )
}

export async function feCaeSolicitar(
  env: FiscalEnvironment,
  auth: WsfeAuth,
  req: CaeRequest,
  fetchImpl?: FetchLike
): Promise<CaeResult> {
  const xml = await soapCall(env, 'FECAESolicitar', authXml(auth) + caeRequestXml(req), fetchImpl)
  const errors = parseMessages(xml, 'Errors', 'Err')
  const det = getAllTags(xml, 'FECAEDetResponse')[0] ?? ''
  const result = (getText(det, 'Resultado') ?? getText(xml, 'Resultado') ?? 'R') as CaeResult['result']
  const cae = getText(det, 'CAE')
  if (errors.length > 0 && !det) {
    const first = errors[0]
    if (AUTH_ERROR_CODES.has(first.code)) throw new ArcaError('auth', `${first.code}: ${first.message}`, first.code)
  }
  return {
    result,
    cae: cae && cae.length > 0 ? cae : null,
    caeExpiresAt: fromArcaDate(getText(det, 'CAEFchVto') ?? ''),
    number: Number(getText(det, 'CbteDesde') ?? req.number),
    observations: parseMessages(det, 'Observaciones', 'Obs'),
    errors,
  }
}

export interface ConsultResult {
  found: boolean
  cae: string | null
  caeExpiresAt: Date | null
  totalCents: number | null
  result: string | null
}

export async function feCompConsultar(
  env: FiscalEnvironment,
  auth: WsfeAuth,
  pointOfSale: number,
  cbteTipo: number,
  number: number,
  fetchImpl?: FetchLike
): Promise<ConsultResult> {
  const xml = await soapCall(
    env,
    'FECompConsultar',
    `${authXml(auth)}<ar:FeCompConsReq><ar:CbteTipo>${cbteTipo}</ar:CbteTipo><ar:CbteNro>${number}</ar:CbteNro><ar:PtoVta>${pointOfSale}</ar:PtoVta></ar:FeCompConsReq>`,
    fetchImpl
  )
  const errors = parseMessages(xml, 'Errors', 'Err')
  // 602: "Sin Resultados" — el número no existe.
  if (errors.some((e) => e.code === '602')) return { found: false, cae: null, caeExpiresAt: null, totalCents: null, result: null }
  if (errors.length > 0) assertNoErrors(xml)
  const total = getText(xml, 'ImpTotal')
  return {
    found: Boolean(getText(xml, 'CodAutorizacion')),
    cae: getText(xml, 'CodAutorizacion'),
    caeExpiresAt: fromArcaDate(getText(xml, 'FchVto') ?? ''),
    totalCents: total === null ? null : Math.round(Number(total) * 100),
    result: getText(xml, 'Resultado'),
  }
}
