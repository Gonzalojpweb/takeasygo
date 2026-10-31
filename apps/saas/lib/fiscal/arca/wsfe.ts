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
    // 'identity': el comprobante y la configuración actual no coinciden
    // (CUIT o ambiente): nunca se llama a ARCA en ese caso.
    readonly kind: 'network' | 'timeout' | 'fault' | 'rejected' | 'auth' | 'identity',
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
  /**
   * Identidad del comprobante TAL COMO LA INFORMA ARCA (FECompConsultar ·
   * ResultGet). La recuperación de un número reservado compara todos estos
   * campos: el importe solo no alcanza para saber que es el nuestro.
   */
  identity: {
    pointOfSale: number | null
    cbteTipo: number | null
    number: number | null
    /** yyyymmdd */
    date: string | null
    docType: number | null
    docNumber: string | null
    netCents: number | null
    ivaCents: number | null
    exemptCents: number | null
  }
}

const EMPTY_IDENTITY: ConsultResult['identity'] = {
  pointOfSale: null,
  cbteTipo: null,
  number: null,
  date: null,
  docType: null,
  docNumber: null,
  netCents: null,
  ivaCents: null,
  exemptCents: null,
}

function cents(value: string | null): number | null {
  if (value === null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

function int(value: string | null): number | null {
  if (value === null || value === '') return null
  const n = Number(value)
  return Number.isInteger(n) ? n : null
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
  if (errors.some((e) => e.code === '602')) {
    return { found: false, cae: null, caeExpiresAt: null, totalCents: null, result: null, identity: EMPTY_IDENTITY }
  }
  if (errors.length > 0) assertNoErrors(xml)
  const get = getAllTags(xml, 'ResultGet')[0] ?? xml
  return {
    found: Boolean(getText(get, 'CodAutorizacion')),
    cae: getText(get, 'CodAutorizacion'),
    caeExpiresAt: fromArcaDate(getText(get, 'FchVto') ?? ''),
    totalCents: cents(getText(get, 'ImpTotal')),
    result: getText(get, 'Resultado'),
    identity: {
      pointOfSale: int(getText(get, 'PtoVta')),
      cbteTipo: int(getText(get, 'CbteTipo')),
      number: int(getText(get, 'CbteDesde')),
      date: getText(get, 'CbteFch'),
      docType: int(getText(get, 'DocTipo')),
      docNumber: getText(get, 'DocNro'),
      netCents: cents(getText(get, 'ImpNeto')),
      ivaCents: cents(getText(get, 'ImpIVA')),
      exemptCents: cents(getText(get, 'ImpOpEx')),
    },
  }
}

// ── CAEA: Código de Autorización Electrónico Anticipado (contingencia) ─────
// Fase 6. Un CAEA por quincena (Orden 1 = días 1–15, 2 = 16–fin de mes). Se
// puede pedir desde 5 días antes. Los comprobantes emitidos con CAEA se
// INFORMAN después (FECAEARegInformativo) y los puntos de venta de
// contingencia sin movimiento se informan con FECAEASinMovimientoInformar.

export interface CaeaInfo {
  caea: string
  period: string
  order: 1 | 2
  validFrom: Date | null
  validTo: Date | null
  reportDeadline: Date | null
}

function parseCaea(xml: string, period: string, order: 1 | 2): CaeaInfo | null {
  const caea = getText(xml, 'CAEA')
  if (!caea) return null
  return {
    caea,
    period,
    order,
    validFrom: fromArcaDate(getText(xml, 'FchVigDesde') ?? ''),
    validTo: fromArcaDate(getText(xml, 'FchVigHasta') ?? ''),
    reportDeadline: fromArcaDate(getText(xml, 'FchTopeInf') ?? ''),
  }
}

/** Pide el CAEA del período; si ya se había pedido, lo consulta. */
export async function feCaeaObtener(
  env: FiscalEnvironment,
  auth: WsfeAuth,
  period: string,
  order: 1 | 2,
  fetchImpl?: FetchLike
): Promise<CaeaInfo> {
  const inner = `${authXml(auth)}<ar:Periodo>${period}</ar:Periodo><ar:Orden>${order}</ar:Orden>`
  const requested = await soapCall(env, 'FECAEASolicitar', inner, fetchImpl)
  const got = parseCaea(requested, period, order)
  if (got) return got
  // 15008: «Existe un CAEA otorgado para el período»: se consulta.
  const consulted = await soapCall(env, 'FECAEAConsultar', inner, fetchImpl)
  const again = parseCaea(consulted, period, order)
  if (again) return again
  const errors = parseMessages(requested, 'Errors', 'Err')
  throw new ArcaError('rejected', errors[0] ? `${errors[0].code}: ${errors[0].message}` : 'ARCA no otorgó el CAEA', errors[0]?.code)
}

/** Informa UN comprobante emitido con CAEA. */
export async function feCaeaRegInformativo(
  env: FiscalEnvironment,
  auth: WsfeAuth,
  req: CaeRequest & { caea: string },
  fetchImpl?: FetchLike
): Promise<{ result: 'A' | 'R' | 'P'; observations: ArcaMessage[]; errors: ArcaMessage[] }> {
  const body = caeRequestXml(req)
    .replace('<ar:FeCAEReq>', '<ar:FeCAEARegInfReq>')
    .replace('</ar:FeCAEReq>', '</ar:FeCAEARegInfReq>')
    .replace('<ar:FECAEDetRequest>', '<ar:FECAEADetRequest>')
    .replace('</ar:FECAEDetRequest>', `<ar:CAEA>${escapeXml(req.caea)}</ar:CAEA></ar:FECAEADetRequest>`)
  const xml = await soapCall(env, 'FECAEARegInformativo', authXml(auth) + body, fetchImpl)
  const det = getAllTags(xml, 'FECAEADetResponse')[0] ?? ''
  return {
    result: (getText(det, 'Resultado') ?? getText(xml, 'Resultado') ?? 'R') as 'A' | 'R' | 'P',
    observations: parseMessages(det, 'Observaciones', 'Obs'),
    errors: parseMessages(xml, 'Errors', 'Err'),
  }
}

/** Informa que un punto de venta de contingencia no usó el CAEA. */
export async function feCaeaSinMovimiento(
  env: FiscalEnvironment,
  auth: WsfeAuth,
  pointOfSale: number,
  caea: string,
  fetchImpl?: FetchLike
): Promise<void> {
  const xml = await soapCall(
    env,
    'FECAEASinMovimientoInformar',
    `${authXml(auth)}<ar:PtoVta>${pointOfSale}</ar:PtoVta><ar:CAEA>${escapeXml(caea)}</ar:CAEA>`,
    fetchImpl
  )
  const errors = parseMessages(xml, 'Errors', 'Err')
  if (errors.length > 0) throw new ArcaError('rejected', `${errors[0].code}: ${errors[0].message}`, errors[0].code)
}

/** Período y orden de CAEA para una fecha (hora argentina). */
export function caeaPeriodFor(date: Date): { period: string; order: 1 | 2 } {
  const ymd = toArcaDate(date)
  return { period: ymd.slice(0, 6), order: Number(ymd.slice(6, 8)) <= 15 ? 1 : 2 }
}

/** La quincena siguiente a la de `date`. */
export function nextCaeaPeriod(date: Date): { period: string; order: 1 | 2 } {
  const { period, order } = caeaPeriodFor(date)
  if (order === 1) return { period, order: 2 }
  const year = Number(period.slice(0, 4))
  const month = Number(period.slice(4, 6))
  const next = month === 12 ? `${year + 1}01` : `${year}${String(month + 1).padStart(2, '0')}`
  return { period: next, order: 1 }
}
