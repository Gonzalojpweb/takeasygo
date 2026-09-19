import { cotizarOnDemand, type RapiboyConfig, type RapiboyCoord } from '@/lib/rapiboy/client'

// ─── Delivery Quotation Logic ────────────────────────────────────────────────
//
// Decide cuándo usar franja fija (flota propia) y cuándo usar Rapiboy.
// Flujo:
//   1. Si Rapiboy está deshabilitado → franja fija
//   2. Si la distancia está dentro del maxRangeKm de flota propia → franja fija
//   3. Si no → cotizar con Rapiboy
//   4. Si Rapiboy falla → franja fija como respaldo (si dentro de maxRangeKm)

export interface CotizacionInput {
  /** Coordenadas del restaurante (origen) */
  origen: RapiboyCoord
  /** Coordenadas del cliente (destino) */
  destino: RapiboyCoord
  /** Distancia en km entre origen y destino */
  distanciaKm: number
  /** Configuración de delivery de la sede */
  deliveryConfig?: {
    enabled: boolean
    ranges: Array<{ fromKm: number; toKm: number; price: number }>
    maxRangeKm: number
  }
  /** Configuración de Rapiboy de la sede */
  rapiboyConfig?: RapiboyConfig & {
    enabled: boolean
    margen: number
  }
}

export interface CotizacionResult {
  /** Proveedor usado: 'own' (franja fija) o 'rapiboy' */
  provider: 'own' | 'rapiboy'
  /** Costo del envío al cliente (centavos) */
  costoAlCliente: number
  /** Costo real de Rapiboy (centavos). 0 si se usa franja fija. */
  costoRealRapiboy: number
  /** Margen aplicado (centavos). Diferencia entre costoAlCliente y costoRealRapiboy. */
  margen: number
  /** Si Rapiboy falló y se usó franja fija como respaldo */
  fallback: boolean
}

/**
 * Cotiza el envío y decide qué proveedor usar.
 * Se llama en la transición preparing → ready, NO en el checkout.
 */
export async function cotizarEnvio(input: CotizacionInput): Promise<CotizacionResult> {
  const { origen, destino, distanciaKm, deliveryConfig, rapiboyConfig } = input

  // ── Caso 1: Rapiboy deshabilitado → franja fija ──
  if (!rapiboyConfig?.enabled) {
    const costoFranja = buscarFranja(distanciaKm, deliveryConfig?.ranges ?? [])
    return {
      provider: 'own',
      costoAlCliente: costoFranja,
      costoRealRapiboy: 0,
      margen: 0,
      fallback: false,
    }
  }

  // ── Caso 2: Distancia dentro del maxRangeKm → franja fija ──
  if (deliveryConfig?.maxRangeKm && distanciaKm <= deliveryConfig.maxRangeKm) {
    const costoFranja = buscarFranja(distanciaKm, deliveryConfig.ranges ?? [])
    return {
      provider: 'own',
      costoAlCliente: costoFranja,
      costoRealRapiboy: 0,
      margen: 0,
      fallback: false,
    }
  }

  // ── Caso 3: Cotizar con Rapiboy ──
  try {
    const cotizacion = await cotizarOnDemand(origen, destino, rapiboyConfig)
    const costoReal = cotizacion.precio  // En centavos
    const margenPercent = rapiboyConfig.margen ?? 0
    const margenCentavos = Math.round(costoReal * (margenPercent / 100))
    const costoAlCliente = costoReal + margenCentavos

    return {
      provider: 'rapiboy',
      costoAlCliente,
      costoRealRapiboy: costoReal,
      margen: margenCentavos,
      fallback: false,
    }
  } catch (error) {
    // ── Caso 4: Rapiboy falló → fallback a franja fija ──
    console.error('[cotizarEnvio] Rapiboy falló, usando fallback:', error)

    if (deliveryConfig?.maxRangeKm && distanciaKm <= deliveryConfig.maxRangeKm) {
      const costoFranja = buscarFranja(distanciaKm, deliveryConfig.ranges ?? [])
      return {
        provider: 'own',
        costoAlCliente: costoFranja,
        costoRealRapiboy: 0,
        margen: 0,
        fallback: true,
      }
    }

    // Distancia fuera del rango de flota propia y Rapiboy falló
    throw new Error('No se pudo cotizar el envío: Rapiboy no disponible y distancia fuera de rango')
  }
}

/**
 * Busca el precio de la franja que contiene la distancia dada.
 * Retorna 0 si no encuentra ninguna franja.
 */
function buscarFranja(distanciaKm: number, ranges: Array<{ fromKm: number; toKm: number; price: number }>): number {
  for (const range of ranges) {
    if (distanciaKm >= range.fromKm && distanciaKm <= range.toKm) {
      return range.price
    }
  }
  return 0
}

/**
 * Verifica si Rapiboy está habilitado para una sede.
 */
export function isRapiboyEnabled(rapiboyConfig?: { enabled: boolean }): boolean {
  return rapiboyConfig?.enabled === true
}

/**
 * Calcula el margen de TakeasyGO sobre el costo de Rapiboy.
 * Margen = costoReal * (porcentajeMargen / 100)
 */
export function calcularMargen(costoRealCentavos: number, porcentajeMargen: number): number {
  return Math.round(costoRealCentavos * (porcentajeMargen / 100))
}

// ─── Re-cotización para Ready ────────────────────────────────────────────────
//
// Cuando el admin cambia el estado a "ready", se re-cotiza con Rapiboy
// y se compara con el precio que pagó el cliente en el checkout.

export interface RecotizarReadyInput {
  /** Coordenadas del restaurante (origen) */
  origen: RapiboyCoord
  /** Coordenadas del cliente (destino) */
  destino: RapiboyCoord
  /** Configuración de Rapiboy de la sede */
  rapiboyConfig: RapiboyConfig & {
    enabled: boolean
    margen: number
  }
  /** Precio real de Rapiboy en el checkout (centavos) */
  checkoutCost: number
  /** Colchón de transferencia (centavos) */
  transferBuffer: number
  /** Método de pago del pedido */
  paymentMethod: string
}

export interface RecotizarReadyResult {
  /** Acción a tomar */
  action: 'create_trip' | 'pending_accept'
  /** Nuevo precio de Rapiboy (centavos) */
  newCost: number
  /** Diferencia entre nuevo precio y lo que pagó el cliente (centavos) */
  costDifference: number
  /** Si es transferencia */
  isTransfer: boolean
  /** Precio que pagó el cliente (centavos, incluye buffer si transfer) */
  chargedToCustomer: number
}

/**
 * Re-cotiza con Rapiboy cuando el pedido pasa a "ready".
 * Decide si crear el viaje automáticamente o notificar al cliente.
 */
export async function recotizarParaReady(input: RecotizarReadyInput): Promise<RecotizarReadyResult> {
  const { origen, destino, rapiboyConfig, checkoutCost, transferBuffer, paymentMethod } = input

  const isTransfer = paymentMethod === 'transfer'
  const chargedToCustomer = checkoutCost + transferBuffer

  // Re-cotizar con Rapiboy
  const cotizacion = await cotizarOnDemand(origen, destino, rapiboyConfig)
  const newCost = cotizacion.precio

  // Comparar contra lo que pagó el cliente (checkoutCost + buffer)
  const costDifference = newCost - chargedToCustomer

  if (costDifference <= 0) {
    // El precio bajó o se mantuvo → crear viaje automáticamente
    // TakeasyGO se queda la diferencia como margen
    return {
      action: 'create_trip',
      newCost,
      costDifference,
      isTransfer,
      chargedToCustomer,
    }
  }

  // El precio subió
  if (isTransfer) {
    // Transfer: el colchón absorbe la mayoría de las variaciones
    // Si el nuevo precio supera el colchón, es un caso extremo
    // En ese caso, crear viaje igualmente (el colchón ya cubrió parte)
    return {
      action: 'create_trip',
      newCost,
      costDifference,
      isTransfer,
      chargedToCustomer,
    }
  }

  // MP u otro método: notificar al cliente
  return {
    action: 'pending_accept',
    newCost,
    costDifference,
    isTransfer,
    chargedToCustomer,
  }
}
