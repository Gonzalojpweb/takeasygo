import { decrypt } from '@/lib/crypto'
import https from 'node:https'

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
  const token = decrypt(rapiboyConfig.apiToken)
  const baseUrl = rapiboyConfig.environment === 'production'
    ? 'https://rapiboy.com'
    : 'https://uat.rapiboy.com'

  return {
    baseUrl,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  }
}

async function rapiboyFetch<T>(
  config: RapiboyConfig,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const { baseUrl, headers } = getConfig(config)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3000)

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { ...headers, ...options.headers },
      signal: controller.signal,
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new RapiboyError(`RapiBoy API error ${res.status}: ${body}`, res.status, body)
    }

    return res.json() as Promise<T>
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

/**
 * GET con body — Rapiboy lo requiere para /v1/OnDemandSmart/Cotizar.
 * fetch nativo lo rechaza, así que usamos node:https directamente.
 */
async function rapiboyGetWithBody<T>(
  config: RapiboyConfig,
  path: string,
  body: Record<string, unknown>,
  timeoutMs = 5000,
): Promise<T> {
  const { baseUrl, headers } = getConfig(config)
  const url = new URL(`${baseUrl}${path}`)
  const bodyStr = JSON.stringify(body)

  return new Promise<T>((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'GET',
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(bodyStr),
        },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data) as T)
          } else {
            reject(new RapiboyError(
              `RapiBoy API error ${res.statusCode}: ${data}`,
              res.statusCode ?? 500,
              data,
            ))
          }
        })
      },
    )
    req.on('error', reject)
    req.setTimeout(timeoutMs, () => {
      req.destroy()
      reject(new Error('Rapiboy request timeout'))
    })
    req.write(bodyStr)
    req.end()
  })
}

// ─── Public Functions ───────────────────────────────────────────────────────

/**
 * Cotizar envío OnDemandSmart.
 * La cotización vence a los 3 minutos — si expira, hay que re-cotizar.
 * Endpoint: GET /v1/OnDemandSmart/Cotizar con body JSON (requiere node:https).
 */
export async function cotizarOnDemand(
  origen: RapiboyCoord,
  destino: RapiboyCoord,
  config: RapiboyConfig,
): Promise<CotizacionResult> {
  const result = await rapiboyGetWithBody<any>(
    config,
    '/v1/OnDemandSmart/Cotizar',
    {
      LatitudOrigen: origen.lat,
      LongitudOrigen: origen.lng,
      LatitudDestino: destino.lat,
      LongitudDestino: destino.lng,
    },
  )

  return {
    precio: result.Precio ?? 0,
    vigencia: result.VigenciaMinutos ?? 3,
  }
}

/**
 * Crear viaje OnDemand.
 * El pedido ya está listo (TiempoDeCocina: 0).
 * Si la cotización expira, hay que re-cotizar y crear de nuevo.
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
  const result = await rapiboyFetch<any>(config, '/api/v1/ondemand/crear', {
    method: 'POST',
    body: JSON.stringify({
      CodigoPlataforma: config.codigoPlataforma,
      ReferenciaExterna: params.orderNumber,
      Origen: {
        Direccion: params.origen.address || '',
        Latitud: params.origen.lat,
        Longitud: params.origen.lng,
      },
      Destino: {
        Direccion: params.destino.address || '',
        Latitud: params.destino.lat,
        Longitud: params.destino.lng,
      },
      NombreCliente: params.customerName,
      TelefonoCliente: params.customerPhone,
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
 */
export async function cancelarViaje(
  tripId: string,
  motivoId: number,
  config: RapiboyConfig,
): Promise<void> {
  await rapiboyFetch<any>(config, '/api/v1/ondemand/cancelar', {
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
