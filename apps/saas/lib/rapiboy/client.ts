import { decrypt } from '@/lib/crypto'

// ─── Rapiboy API Client ─────────────────────────────────────────────────────
//
// Cliente HTTP para la API de Rapiboy OnDemand.
// Todas las funciones usan fetch con timeout de 3 segundos.
// El apiToken se descifra antes de cada request.

const RAPIBOY_BASE_URL = process.env.RAPIBOY_API_URL || 'https://rapiboy.com'

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
  precio: number           // Costo del envío en centavos
  vigencia: number         // Minutos de vigencia de la cotización
}

export interface CrearViajeResult {
  tripId: string           // ID del viaje en Rapiboy
  trackingId: string       // ID de tracking para el cliente
  trackingUrl: string      // URL de tracking en tiempo real
}

export interface RapiboyEstado {
  id: number
  nombre: string
}

export interface RapiboyMotivoCancelacion {
  id: number
  nombre: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getConfig(rapiboyConfig: RapiboyConfig): { baseUrl: string; headers: Record<string, string> } {
  let token: string
  try {
    token = decrypt(rapiboyConfig.apiToken)
  } catch (e) {
    throw new RapiboyError(`Token Rapiboy no válido o corrupto: ${(e as Error).message}`, 401, 'INVALID_TOKEN')
  }
  const baseUrl = rapiboyConfig.environment === 'production'
    ? 'https://rapiboy.com'
    : 'https://uat.rapiboy.com'

  return {
    baseUrl,
    headers: {
      'Token': token,
      'Content-Type': 'application/json',
    },
  }
}

async function rapiboyFetch<T>(
  config: RapiboyConfig,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3000)

  try {
    const { baseUrl, headers } = getConfig(config)

    // Log del payload completo antes de enviar
    if (options.body) {
      console.log(`[Rapiboy] ${options.method || 'GET'} ${baseUrl}${path}`)
      console.log(`[Rapiboy Payload]`, options.body)
    }

    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { ...headers, ...options.headers },
      signal: controller.signal,
    })

    const responseBody = await res.text()

    if (!res.ok) {
      throw new RapiboyError(`RapiBoy API error ${res.status}: ${responseBody}`, res.status, responseBody)
    }

    return JSON.parse(responseBody) as Promise<T>
  } finally {
    clearTimeout(timeout)
  }
}

// ─── Error Class ────────────────────────────────────────────────────────────

export class RapiboyError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: string,
  ) {
    super(message)
    this.name = 'RapiboyError'
  }
}

// ─── Public Functions ───────────────────────────────────────────────────────

/**
 * Cotizar envío OnDemandSmart.
 * La cotización vence a los 3 minutos — si expira, hay que re-cotizar.
 * Endpoint: POST /v1/OnDemandSmart/Cotizar
 */
export async function cotizarOnDemand(
  origen: RapiboyCoord,
  destino: RapiboyCoord,
  config: RapiboyConfig,
): Promise<CotizacionResult> {
  const result = await rapiboyFetch<any>(config, '/v1/OnDemandSmart/Cotizar', {
    method: 'POST',
    body: JSON.stringify({
      LatitudOrigen: origen.lat,
      LongitudOrigen: origen.lng,
      LatitudDestino: destino.lat,
      LongitudDestino: destino.lng,
    }),
  })

  return {
    precio: result.Precio ?? 0,
    vigencia: result.VigenciaMinutos ?? 3,
  }
}

/**
 * Crear viaje OnDemandSmart.
 * El pedido ya está listo (TiempoDeCocina: 0).
 * Si la cotización expira, hay que re-cotizar y crear de nuevo.
 * Endpoint: POST /v1/OnDemandSmart/crear
 */
export async function crearViajeOnDemand(
  params: {
    orderNumber: string
    origen: RapiboyCoord
    destino: RapiboyCoord
    customerName: string
    customerPhone: string
    observaciones?: string
    tiempoCocina?: number  // Minutos. Default: 0 (ya listo)
  },
  config: RapiboyConfig,
): Promise<CrearViajeResult> {
  const result = await rapiboyFetch<any>(config, '/v1/OnDemandSmart/crear', {
    method: 'POST',
    body: JSON.stringify({
      CodigoPlataforma: config.codigoPlataforma,
      ReferenciaExterna: params.orderNumber,
      LatitudOrigen: params.origen.lat,
      LongitudOrigen: params.origen.lng,
      LatitudDestino: params.destino.lat,
      LongitudDestino: params.destino.lng,
      Nombre: params.customerName,
      Telefono: params.customerPhone,
      Observaciones: params.observaciones || '',
      TiempoDeCocina: params.tiempoCocina ?? 0,
    }),
  })

  return {
    tripId: result.IdPedido ?? '',
    trackingId: result.TrackingId ?? '',
    trackingUrl: result.TrackingUrl ?? '',
  }
}

/**
 * Cancelar viaje.
 * Endpoint: POST /v1/OnDemandSmart/cancelar
 */
export async function cancelarViaje(
  tripId: string,
  motivoId: number,
  config: RapiboyConfig,
): Promise<void> {
  await rapiboyFetch<any>(config, '/v1/OnDemandSmart/cancelar', {
    method: 'POST',
    body: JSON.stringify({
      CodigoPlataforma: config.codigoPlataforma,
      IdPedido: tripId,
      IdMotivo: motivoId,
    }),
  })
}

/**
 * Obtener estados disponibles de Rapiboy.
 */
export async function obtenerEstados(
  config: RapiboyConfig,
): Promise<RapiboyEstado[]> {
  const result = await rapiboyFetch<any[]>(config, '/api/v1/estados')
  return result.map((e: any) => ({
    id: e.Id,
    nombre: e.Nombre,
  }))
}

/**
 * Obtener motivos de cancelación disponibles.
 */
export async function obtenerMotivosCancelacion(
  config: RapiboyConfig,
): Promise<RapiboyMotivoCancelacion[]> {
  const result = await rapiboyFetch<any[]>(config, '/api/v1/motivos-cancelacion')
  return result.map((m: any) => ({
    id: m.Id,
    nombre: m.Nombre,
  }))
}
