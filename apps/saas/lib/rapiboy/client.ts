import { decrypt } from '@/lib/crypto'

// ─── Rapiboy API Client ─────────────────────────────────────────────────────
//
// Cliente HTTP para la API de Rapiboy OnDemand.
// Todas las funciones usan fetch con timeout de 3 segundos.
// El apiToken se descifra antes de cada request.

const RAPIBOY_BASE_URL = process.env.RAPIBOY_API_URL || 'https://api.rapiboy.com'

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
    ? 'https://api.rapiboy.com'
    : 'https://api.uat.rapiboy.com'

  return {
    baseUrl,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Codigo-Plataforma': rapiboyConfig.codigoPlataforma,
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

// ─── Public Functions ───────────────────────────────────────────────────────

/**
 * Cotizar envío OnDemand.
 * La cotización vence a los 3 minutos — si expira, hay que re-cotizar.
 */
export async function cotizarOnDemand(
  origen: RapiboyCoord,
  destino: RapiboyCoord,
  config: RapiboyConfig,
): Promise<CotizacionResult> {
  const result = await rapiboyFetch<any>(config, '/api/v1/ondemand/cotizar', {
    method: 'POST',
    body: JSON.stringify({
      Origen: {
        Direccion: origen.address || '',
        Latitud: origen.lat,
        Longitud: origen.lng,
      },
      Destino: {
        Direccion: destino.address || '',
        Latitud: destino.lat,
        Longitud: destino.lng,
      },
      CodigoPlataforma: config.codigoPlataforma,
    }),
  })

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
