import { decrypt } from '@/lib/crypto'

// ─── Rapiboy API Client (OnDemandSmart) ─────────────────────────────────────
//
// Validado el 20/11/2026 contra la documentación oficial
// (https://rapiboy.com/documentacionapi/openapi, guía OnDemandSmart):
//   · Cotizar:   POST {base}/v1/OnDemandSmart/Cotizar → { Precio: number } en PESOS
//   · Crear:     POST {base}/v1/Viaje/Post con EsOnDemand=true, mismas
//                coordenadas y una cotización vigente (3 minutos)
//   · Consultar: GET  {base}/v1/OnDemandSmart/GetQuery?IdPedido=
//   · Cancelar:  PUT  {base}/v1/OnDemandSmart/Cancel → HTTP 200 SIN cuerpo
//   · Evidencias GET  {base}/v1/OnDemandSmart/Evidencias?IdPedido=
//   · Catálogos: GET  {base}/v1/LastMile/Estados y /v1/LastMile/MotivosCancelado
// Auth: header `Token`. Errores: HTTP 400 con { Message }.
// TakeasyGO guarda TODO en centavos: los precios de Rapiboy (pesos, con
// decimales; en la creación vienen como texto) se convierten acá y en ningún
// otro lado.
// No se loguean cuerpos: llevan nombre, teléfono y dirección del cliente.

export interface RapiboyConfig {
  apiToken: string          // Cifrado con AES-256-GCM
  environment: 'production' | 'uat'
  codigoPlataforma: string
}

export interface RapiboyCoord {
  lat: number
  lng: number
  address?: string
}

export interface CotizacionResult {
  /** Costo del envío en centavos. */
  precio: number
  /** Minutos de vigencia de la cotización (fija: 3 según la documentación). */
  vigencia: number
}

export interface CrearViajeResult {
  /** IdPedido de Rapiboy (número, guardado como texto). */
  tripId: string
  trackingId: string
  /** Link de seguimiento público (campo `Link`). */
  trackingUrl: string
  trackingEncriptado: string
  /** Estado inicial (normalmente 10, ProcesandoPedido). */
  estado: number | null
  /** Precio informado al crear, en centavos (null si Rapiboy no lo manda). */
  precio: number | null
}

export interface RapiboyPedido {
  idPedido: string
  estado: number | null
  estadoNombre: string
  cancelado: boolean
  terminado: boolean
  trackingUrl: string
  driverName: string
  /** Precio en centavos (null si no vino). */
  precio: number | null
}

export interface RapiboyEvidencia {
  titulo: string
  texto: string
  archivo: string | null
}

export interface RapiboyEnumeracion {
  id: number
  nombre: string
}

/** Motivos de cancelación (GET /v1/LastMile/MotivosCancelado, 02/10/2026). */
export const RAPIBOY_MOTIVO = {
  FueraAreaCobertura: 1,
  DomicilioIncorrecto: 2,
  Otro: 12,
} as const

export const RAPIBOY_QUOTE_VALIDITY_MINUTES = 3

const TIMEOUT_MS = { read: 5000, write: 10000 }

// ─── Error ──────────────────────────────────────────────────────────────────

export class RapiboyError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: string,
  ) {
    super(message)
    this.name = 'RapiboyError'
  }

  /** Mensaje de Rapiboy (`Message` del cuerpo 400), si vino. */
  get apiMessage(): string | null {
    try {
      const parsed = JSON.parse(this.body || '{}')
      return typeof parsed?.Message === 'string' ? parsed.Message : null
    } catch {
      return null
    }
  }

  /** Error de red o timeout: el resultado es incierto (no reintentar a ciegas). */
  get isUncertain(): boolean {
    return this.status === 0 || this.status >= 500
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function rapiboyBaseUrl(environment: RapiboyConfig['environment']): string {
  return environment === 'production' ? 'https://rapiboy.com' : 'https://uat.rapiboy.com'
}

/**
 * Pesos de Rapiboy → centavos. Acepta número o texto ("100.50", "$ 1.234,50").
 * Devuelve null si no hay un importe interpretable.
 */
export function pesosToCents(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) : null
  if (typeof value !== 'string') return null
  let s = value.replace(/[^\d.,-]/g, '')
  if (!s) return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > lastDot) {
    // Formato local: 1.234,50
    s = s.replace(/\./g, '').replace(',', '.')
  } else {
    s = s.replace(/,/g, '')
  }
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

/** Solo links https (se muestran al cliente y al local como <a href>). */
function httpsUrl(v: unknown): string {
  return typeof v === 'string' && /^https:\/\//i.test(v.trim()) ? v.trim() : ''
}

function getConfig(rapiboyConfig: RapiboyConfig): { baseUrl: string; headers: Record<string, string> } {
  let token: string
  try {
    token = decrypt(rapiboyConfig.apiToken)
  } catch (e) {
    throw new RapiboyError(`Token Rapiboy no válido o corrupto: ${(e as Error).message}`, 401, 'INVALID_TOKEN')
  }
  return {
    baseUrl: rapiboyBaseUrl(rapiboyConfig.environment),
    headers: { 'Token': token, 'Content-Type': 'application/json', 'Accept': 'application/json' },
  }
}

async function rapiboyFetch<T>(
  config: RapiboyConfig,
  path: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<T | null> {
  const { timeoutMs = TIMEOUT_MS.read, ...init } = options
  const { baseUrl, headers } = getConfig(config)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const method = init.method || 'GET'

  let res: Response
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
      signal: controller.signal,
    })
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError'
    throw new RapiboyError(
      `Rapiboy ${method} ${path}: ${aborted ? 'timeout' : 'error de red'}`,
      0,
      aborted ? 'TIMEOUT' : 'NETWORK',
    )
  } finally {
    clearTimeout(timeout)
  }

  const text = await res.text()
  if (!res.ok) {
    console.warn(`[Rapiboy] ${method} ${path} → HTTP ${res.status}`)
    throw new RapiboyError(`Rapiboy API error ${res.status}`, res.status, text)
  }
  // Cancel y Delete responden 200 sin cuerpo.
  if (!text.trim()) return null
  try {
    return JSON.parse(text) as T
  } catch {
    throw new RapiboyError('Respuesta de Rapiboy no es JSON', res.status, text.slice(0, 500))
  }
}

// ─── Cotizar ────────────────────────────────────────────────────────────────

/**
 * Cotiza un envío OnDemandSmart. La cotización vale 3 minutos: para crear el
 * viaje hay que usar las MISMAS coordenadas dentro de ese plazo.
 */
export async function cotizarOnDemand(
  origen: RapiboyCoord,
  destino: RapiboyCoord,
  config: RapiboyConfig,
): Promise<CotizacionResult> {
  const result = await rapiboyFetch<{ Precio?: unknown }>(config, '/v1/OnDemandSmart/Cotizar', {
    method: 'POST',
    body: JSON.stringify({
      LatitudOrigen: origen.lat,
      LongitudOrigen: origen.lng,
      LatitudDestino: destino.lat,
      LongitudDestino: destino.lng,
    }),
  })
  const precio = pesosToCents(result?.Precio)
  if (precio == null || precio <= 0) {
    throw new RapiboyError('Rapiboy no devolvió un precio válido', 200, JSON.stringify(result ?? null))
  }
  return { precio, vigencia: RAPIBOY_QUOTE_VALIDITY_MINUTES }
}

// ─── Crear viaje ────────────────────────────────────────────────────────────

export interface CrearViajeParams {
  orderNumber: string
  origen: RapiboyCoord
  destino: RapiboyCoord
  /** Nombre del local (origen). */
  originName: string
  originPhone?: string
  customerName: string
  customerPhone: string
  customerEmail?: string
  /** Ciudad del cliente. */
  destinationCity?: string
  /** Piso / depto tal como lo cargó el cliente. */
  apt?: string
  observaciones?: string
  /** Minutos hasta que el pedido esté listo. 0 = ya está listo. */
  tiempoCocina?: number
  /** Valor declarado del pedido, en centavos. */
  declaredValueCents?: number
}

/** Arma el cuerpo de /v1/Viaje/Post (exportado para los tests de contrato). */
export function buildCrearViajeBody(params: CrearViajeParams, config: Pick<RapiboyConfig, 'codigoPlataforma'>) {
  return {
    EsOnDemand: true,
    ReferenciaExterna: params.orderNumber,
    ...(config.codigoPlataforma ? { CodigoPlataforma: config.codigoPlataforma } : {}),
    NombreOrigen: params.originName,
    DireccionOrigen: params.origen.address || '',
    TelefonoOrigen: params.originPhone || '',
    LatitudOrigen: params.origen.lat,
    LongitudOrigen: params.origen.lng,
    NombreDestino: params.customerName,
    DireccionDestino: params.destino.address || '',
    CiudadDestino: params.destinationCity || '',
    TelefonoDestino: params.customerPhone || '',
    EmailDestino: params.customerEmail || '',
    Departamento: params.apt || '',
    ObservacionDestino: (params.observaciones || '').slice(0, 250),
    LatitudDestino: params.destino.lat,
    LongitudDestino: params.destino.lng,
    TiempoDeCocina: Math.max(0, Math.round(params.tiempoCocina ?? 0)),
    ...(params.declaredValueCents ? { ValorDeclarado: Math.round(params.declaredValueCents) / 100 } : {}),
    Paquetes: [{ Cantidad: 1, ReferenciaExterna: params.orderNumber }],
  }
}

/**
 * Crea el viaje (flujo cotizar → crear de la guía OnDemand). Requiere una
 * cotización vigente con las mismas coordenadas: llamar a cotizarOnDemand
 * justo antes. Rapiboy no tiene clave de idempotencia: ante un resultado
 * incierto (timeout) NO reintentar sin consultar antes por ReferenciaExterna.
 */
export async function crearViajeOnDemand(
  params: CrearViajeParams,
  config: RapiboyConfig,
): Promise<CrearViajeResult> {
  const result = await rapiboyFetch<any>(config, '/v1/Viaje/Post', {
    method: 'POST',
    body: JSON.stringify(buildCrearViajeBody(params, config)),
    timeoutMs: TIMEOUT_MS.write,
  })
  const idPedido = result?.IdPedido
  if (idPedido == null || idPedido === '' || idPedido === 0) {
    throw new RapiboyError('Rapiboy no devolvió IdPedido', 200, JSON.stringify(result ?? null).slice(0, 500))
  }
  return {
    tripId: String(idPedido),
    trackingId: result?.TrackingId != null ? String(result.TrackingId) : '',
    trackingUrl: httpsUrl(result?.Link),
    trackingEncriptado: typeof result?.TrackingEncriptado === 'string' ? result.TrackingEncriptado : '',
    estado: typeof result?.Estado === 'number' ? result.Estado : null,
    precio: pesosToCents(result?.Precio),
  }
}

// ─── Consultar ──────────────────────────────────────────────────────────────

// Pedido trae el repartidor en RepartidorOnDemand (ODS) o en Nombre (junto a
// TelefonoRepartidor y Patente). NombreDestino es el cliente: nunca usarlo.
function driverNameFrom(p: any): string {
  const candidates = [p?.RepartidorOnDemand, p?.Nombre]
  for (const c of candidates) if (typeof c === 'string' && c.trim()) return c.trim()
  return ''
}

/** Normaliza un objeto Pedido de Rapiboy. */
export function parsePedido(p: any): RapiboyPedido | null {
  if (!p || typeof p !== 'object') return null
  const id = p.IdPedido ?? p.Id
  if (id == null) return null
  const estado = typeof p.Estado === 'number' ? p.Estado : (Number.isFinite(Number(p.Estado)) ? Number(p.Estado) : null)
  const precioDouble = typeof p.PrecioDouble === 'number' && p.PrecioDouble > 0 ? pesosToCents(p.PrecioDouble) : null
  return {
    idPedido: String(id),
    estado,
    estadoNombre: typeof p.EstadoNombre === 'string' ? p.EstadoNombre : '',
    cancelado: p.Cancelado === true,
    terminado: p.Terminado === true,
    trackingUrl: httpsUrl(p.TrackingUrl_OnDemand) || httpsUrl(p.TrackingUrl),
    driverName: driverNameFrom(p),
    precio: precioDouble ?? pesosToCents(p.Precio),
  }
}

/**
 * Consulta un pedido por IdPedido o ReferenciaExterna (GetQuery, sin cuerpo).
 * Devuelve null si Rapiboy no lo encuentra.
 */
export async function consultarViaje(
  ref: { idPedido?: string | number | null; referenciaExterna?: string | null },
  config: RapiboyConfig,
): Promise<RapiboyPedido | null> {
  const qs = new URLSearchParams()
  if (ref.idPedido != null && String(ref.idPedido) !== '') qs.set('IdPedido', String(ref.idPedido))
  else if (ref.referenciaExterna) qs.set('ReferenciaExterna', ref.referenciaExterna)
  else throw new RapiboyError('consultarViaje: falta IdPedido o ReferenciaExterna', 400, 'BAD_REF')

  const result = await rapiboyFetch<any>(config, `/v1/OnDemandSmart/GetQuery?${qs.toString()}`)
  if (!result || result.Resultado === false) return null
  const pedido = result.Unico ?? (Array.isArray(result.Lista) ? result.Lista[0] : null)
  return parsePedido(pedido)
}

// ─── Cancelar ───────────────────────────────────────────────────────────────

/**
 * Cancela un viaje. Responde 200 sin cuerpo; si el estado ya no permite
 * cancelar, Rapiboy devuelve 400 con { Message }.
 */
export async function cancelarViaje(
  tripId: string,
  motivoId: number,
  config: RapiboyConfig,
): Promise<void> {
  const idPedido = Number(tripId)
  if (!Number.isInteger(idPedido) || idPedido <= 0) {
    throw new RapiboyError(`IdPedido inválido: ${tripId}`, 400, 'BAD_ID')
  }
  await rapiboyFetch<null>(config, '/v1/OnDemandSmart/Cancel', {
    method: 'PUT',
    body: JSON.stringify({ IdPedido: idPedido, IdMotivo: motivoId }),
    timeoutMs: TIMEOUT_MS.write,
  })
}

// ─── Evidencias ─────────────────────────────────────────────────────────────

export async function obtenerEvidencias(tripId: string, config: RapiboyConfig): Promise<RapiboyEvidencia[]> {
  const result = await rapiboyFetch<any[]>(config, `/v1/OnDemandSmart/Evidencias?IdPedido=${encodeURIComponent(tripId)}`)
  if (!Array.isArray(result)) return []
  return result.map(e => ({
    titulo: typeof e?.Titulo === 'string' ? e.Titulo : '',
    texto: typeof e?.Texto === 'string' ? e.Texto : '',
    archivo: httpsUrl(e?.Archivo) || null,
  }))
}

// ─── Catálogos ──────────────────────────────────────────────────────────────

function parseEnumeracion(list: any[] | null): RapiboyEnumeracion[] {
  return (list ?? []).map(e => ({ id: Number(e?.Id), nombre: String(e?.Valor ?? '') }))
}

export async function obtenerEstados(config: RapiboyConfig): Promise<RapiboyEnumeracion[]> {
  return parseEnumeracion(await rapiboyFetch<any[]>(config, '/v1/LastMile/Estados'))
}

export async function obtenerMotivosCancelacion(config: RapiboyConfig): Promise<RapiboyEnumeracion[]> {
  return parseEnumeracion(await rapiboyFetch<any[]>(config, '/v1/LastMile/MotivosCancelado'))
}
