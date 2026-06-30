import { connectDB } from '@/lib/mongoose'
import Location from '@/models/Location'

// ── In-memory cache for geocoding results ─────────────────────────────────
const geocodeCache = new Map<string, { lat: number; lng: number; expiresAt: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

function cacheKey(address: string): string {
  return address.toLowerCase().replace(/\s+/g, ' ').trim()
}

function getCached(address: string): { lat: number; lng: number } | null {
  const key = cacheKey(address)
  const entry = geocodeCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    geocodeCache.delete(key)
    return null
  }
  return { lat: entry.lat, lng: entry.lng }
}

function setCache(address: string, lat: number, lng: number) {
  const key = cacheKey(address)
  geocodeCache.set(key, { lat, lng, expiresAt: Date.now() + CACHE_TTL_MS })
}

// ── Interface ─────────────────────────────────────────────────────────────

export interface DeliveryAddress {
  street: string
  number: string
  apt?: string
  city: string
}

/**
 * Geocodifica una dirección usando Nominatim (OpenStreetMap).
 * Retorna { lat, lng } o null si no se pudo resolver.
 */
export async function geocodeAddress(address: DeliveryAddress): Promise<{ lat: number; lng: number } | null> {
  const fullAddress = `${address.street} ${address.number}, ${address.city}, Argentina`

  const cached = getCached(fullAddress)
  if (cached) return cached

  const encoded = encodeURIComponent(fullAddress)
  const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&addressdetails=1`

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'TakeasyGO/1.0 (delivery-module)',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(5000),
  })

  if (!response.ok) {
    console.error(`[geocode] Nominatim error: ${response.status} ${response.statusText}`)
    return null
  }

  const data = await response.json()

  if (!Array.isArray(data) || data.length === 0) {
    console.warn(`[geocode] No se encontró dirección: ${fullAddress}`)
    return null
  }

  const lat = parseFloat(data[0].lat)
  const lng = parseFloat(data[0].lon)

  if (isNaN(lat) || isNaN(lng)) {
    console.warn(`[geocode] Coordenadas inválidas para: ${fullAddress}`)
    return null
  }

  setCache(fullAddress, lat, lng)
  return { lat, lng }
}

/**
 * Calcula la distancia en km entre dos puntos usando la fórmula de Haversine.
 */
export function haversineDistance(
  coord1: { lat: number; lng: number },
  coord2: { lat: number; lng: number },
): number {
  const R = 6371 // Radio de la Tierra en km
  const dLat = toRad(coord2.lat - coord1.lat)
  const dLng = toRad(coord2.lng - coord1.lng)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coord1.lat)) * Math.cos(toRad(coord2.lat)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180)
}

/**
 * Calcula el costo de delivery para una dirección.
 *
 * 1. Geocodifica la dirección
 * 2. Obtiene las coordenadas de la sede desde Location.geo
 * 3. Calcula distancia Haversine
 * 4. Busca el rango correspondiente en deliveryConfig.ranges
 *
 * 🔒 Seguridad: siempre recalcula desde la DB. No confía en datos del frontend.
 */
export async function calculateDeliveryCost(
  tenantId: string,
  locationId: string,
  address: DeliveryAddress,
): Promise<{
  withinRange: boolean
  distance: number
  cost: number
  range: { fromKm: number; toKm: number; price: number } | null
  maxRangeKm: number
  coordinates: { lat: number; lng: number } | null
  error?: string
}> {
  await connectDB()

  // 1. Geocodificar dirección
  const coordinates = await geocodeAddress(address)
  if (!coordinates) {
    return {
      withinRange: false,
      distance: 0,
      cost: 0,
      range: null,
      maxRangeKm: 0,
      coordinates: null,
      error: 'No pudimos encontrar tu dirección. Verificá los datos e intentá de nuevo.',
    }
  }

  // 2. Obtener ubicación de la sede
  const location = await Location.findOne({ _id: locationId, tenantId }).lean() as any
  if (!location) {
    return {
      withinRange: false,
      distance: 0,
      cost: 0,
      range: null,
      maxRangeKm: 0,
      coordinates,
      error: 'Sede no encontrada.',
    }
  }

  if (!location.geo?.coordinates || location.geo.coordinates.length < 2) {
    return {
      withinRange: false,
      distance: 0,
      cost: 0,
      range: null,
      maxRangeKm: 0,
      coordinates,
      error: 'Esta sede no tiene coordenadas configuradas.',
    }
  }

  // Location.geo.coordinates = [longitude, latitude] (GeoJSON standard)
  const locationCoords = {
    lat: location.geo.coordinates[1],
    lng: location.geo.coordinates[0],
  }

  // 3. Calcular distancia Haversine
  const distance = haversineDistance(coordinates, locationCoords)

  // 4. Buscar el rango correspondiente
  const deliveryConfig = location.deliveryConfig || { enabled: false, ranges: [], maxRangeKm: 0 }
  const ranges = deliveryConfig.ranges || []
  const maxRangeKm = deliveryConfig.maxRangeKm || 0

  const matchedRange = ranges.find(
    (r: { fromKm: number; toKm: number; price: number }) =>
      distance > r.fromKm && distance <= r.toKm,
  )

  // Si cae exactamente en 0, usar el primer rango si existe
  const firstRange = !matchedRange && distance === 0 && ranges.length > 0
    ? ranges[0]
    : null

  const range = matchedRange || firstRange

  if (!range) {
    return {
      withinRange: false,
      distance,
      cost: 0,
      range: null,
      maxRangeKm,
      coordinates,
      error: `Tu dirección está a ${Math.round(distance)} km de distancia, fuera de nuestra zona de cobertura (máx. ${maxRangeKm} km).`,
    }
  }

  return {
    withinRange: true,
    distance: Math.round(distance * 100) / 100,
    cost: range.price,
    range: { fromKm: range.fromKm, toKm: range.toKm, price: range.price },
    maxRangeKm,
    coordinates,
  }
}
