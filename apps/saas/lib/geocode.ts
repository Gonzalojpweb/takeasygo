import { connectDB } from '@/lib/mongoose'
import Location from '@/models/Location'
import { cotizarOnDemand, RapiboyError, type RapiboyConfig, type RapiboyCoord } from '@/lib/rapiboy/client'

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
  neighborhood?: string
  complement?: string
}

// ── Barrios conocidos de CABA ──────────────────────────────────────────────
// Si el usuario pone un barrio en "city", lo detectamos y armamos la dirección correcta para Nominatim.
const CABA_NEIGHBORHOODS = new Set([
  'agronomía', 'almagro', 'balvanera', 'barracas', 'belgrano', 'boedo',
  'caballito', 'capital federal', 'chacarita', 'coghlan', 'coleiales',
  'constitución', 'flores', 'floresta', 'la boca', 'laPaternal', 'liniers',
  'mataderos', 'monte castro', 'montserrat', 'nueva pompeya', 'núñez',
  'palermo', 'parque avellaneda', 'parque chas', 'parque patricios',
  'puerto madero', 'recoleta', 'saavedra', 'san cristóbal', 'san nicolás',
  'san telmo', 'santos lugares', 'sarría', 'serrezuela', 'solano',
  'versalles', 'villa crespo', 'villa del parque', 'villa devoto',
  'villa general mitre', 'villa luro', 'villa mitre', 'villa orozco',
  'villa riachuelo', 'villa santa rita', 'villa soldati', 'villa urquiza',
  'vitacura',
])

// Patrones de complemento que Nominatim NO reconoce (pisos, deptos, unidades)
// Se usa para filtrar el campo apt/complement antes de enviar a Nominatim
const COMPLEMENT_PATTERNS = /^(pb|ph|°|[ps]?\d+[a-z]?|d[to]?[°]?\s*\d*|torre|block|casa\s+\d*|local|depto|depto\.?\s*\d*|piso\s+\d+|\d+[a-z]\s*\d*|[a-z]\d+|\d+[a-z])$/i

function isPisoDepto(complement: string): boolean {
  return COMPLEMENT_PATTERNS.test(complement.trim())
}

/**
 * Decide si el apt/complement debe incluirse en el string de geocodificación.
 * Se excluye si matchea patrones de piso/depto (ej: "Pb", "Dpto 3", "Torre B").
 * Se conserva si es info útil (ej: "casa", "local", "frente al parque").
 */
function shouldIncludeComplement(apt?: string): boolean {
  if (!apt || !apt.trim()) return false
  return !isPisoDepto(apt)
}

function normalizeCityForGeocoding(address: DeliveryAddress): { geocodingAddress: string; cityNormalized: string } {
  const cityLower = address.city?.toLowerCase().trim() ?? ''

  // Detectar si city es un barrio de CABA
  const isCabaNeighborhood = CABA_NEIGHBORHOODS.has(cityLower)
  // Reconocer variaciones truncadas: "Ciudad A", "CABA", "capital federal", etc.
  const isCabaCity = isCabaNeighborhood
    || cityLower.includes('caba')
    || cityLower.startsWith('ciudad a')  // "Ciudad A" = "Ciudad Autónoma..."
    || cityLower.includes('ciudad autónoma')
    || cityLower.includes('ciudad autonoma')
    || cityLower.includes('capital federal')

  const city = isCabaCity ? 'Ciudad Autónoma de Buenos Aires' : address.city

  // Barrio: si city es un barrio, usarlo como neighborhood en el string
  const neighborhood = isCabaNeighborhood ? address.city : ''

  // Armar string para Nominatim: incluir apt SOLO si no es piso/depto
  const parts = [address.street, address.number]
  if (shouldIncludeComplement(address.apt)) parts.push(address.apt!)
  if (neighborhood) parts.push(neighborhood)
  parts.push(city, 'Argentina')

  return { geocodingAddress: parts.join(', '), cityNormalized: city }
}

/**
 * Consulta Nominatim con parámetros optimizados para CABA.
 * countrycodes=ar fuerza resultados en Argentina.
 * viewbox sesga hacia CABA pero bounded=0 permite resultados fuera del box.
 */
async function queryNominatim(query: string): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const encoded = encodeURIComponent(query)
  // viewbox: min_lon, min_lat, max_lon, max_lat (corregido)
  const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&addressdetails=1&countrycodes=ar&viewbox=-58.55,-34.68,-58.35,-34.52&bounded=0`

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
    console.log(`[geocode] Nominatim: 0 resultados para "${query}"`)
    return null
  }

  const lat = parseFloat(data[0].lat)
  const lng = parseFloat(data[0].lon)
  if (isNaN(lat) || isNaN(lng)) return null

  console.log(`[geocode] Nominatim: 1 resultado → ${lat.toFixed(5)}, ${lng.toFixed(5)} (${data[0].display_name?.substring(0, 80)}...)`)
  return { lat, lng, displayName: data[0].display_name || '' }
}

/**
 * Geocodifica una dirección usando Nominatim (OpenStreetMap).
 * Fallback en cascada: con barrio → sin barrio → solo calle+ciudad.
 */
export async function geocodeAddress(address: DeliveryAddress): Promise<{ lat: number; lng: number } | null> {
  const { geocodingAddress, cityNormalized } = normalizeCityForGeocoding(address)

  // Cache check
  const cached = getCached(geocodingAddress)
  if (cached) return cached

  // Fallback en cascada
  const cityLabel = cityNormalized || address.city
  const attempts = [
    geocodingAddress,                                                  // calle + altura + barrio + ciudad + Argentina
    `${address.street} ${address.number}, ${cityLabel}, Argentina`,    // sin barrio
    `${address.street}, ${cityLabel}, Argentina`,                       // sin altura
  ]

  for (const attempt of attempts) {
    console.log(`[geocode] Intento: "${attempt}"`)
    const result = await queryNominatim(attempt)
    if (result) {
      setCache(geocodingAddress, result.lat, result.lng)
      return { lat: result.lat, lng: result.lng }
    }
  }

  console.warn(`[geocode] Todos los intentos fallaron para: ${geocodingAddress}`)
  return null
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
  errorCode?: string
  provider?: 'own' | 'rapiboy'
  rapiboyCost?: number
  rapiboyVigencia?: number
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
      error: 'No pudimos ubicar tu dirección. Verificá la calle, el número y el barrio e intentá de nuevo.',
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

  // Sanity check: warn si >30km (posible geolocalización dudosa), error si >100km (claramente mal)
  if (distance > 100) {
    console.warn(`[geocode] Distancia absurda: ${distance.toFixed(2)}km — dirección geolocalizada incorrectamente. String enviado: "${address.street} ${address.number}, ${address.city}"`)
    return {
      withinRange: false,
      distance,
      cost: 0,
      range: null,
      maxRangeKm: 0,
      coordinates,
      error: 'No pudimos ubicar tu dirección. Verificá que los datos sean correctos e intentá de nuevo.',
    }
  }
  if (distance > 30) {
    console.warn(`[geocode] Distancia sospechosa: ${distance.toFixed(2)}km — posible geolocalización dudosa. String enviado: "${address.street} ${address.number}, ${address.city}"`)
  }

  // 4. Buscar el rango correspondiente
  const deliveryConfig = location.deliveryConfig || { enabled: false, ranges: [], maxRangeKm: 0 }
  const ranges = deliveryConfig.ranges || []
  const maxRangeKm = deliveryConfig.maxRangeKm || 0
  const rapiboyEnabled = location.rapiboyConfig?.enabled === true

  const matchedRange = ranges.find(
    (r: { fromKm: number; toKm: number; price: number }) =>
      distance > r.fromKm && distance <= r.toKm,
  )

  // Si cae exactamente en 0, usar el primer rango si existe
  const firstRange = !matchedRange && distance === 0 && ranges.length > 0
    ? ranges[0]
    : null

  const range = matchedRange || firstRange

  console.log(`[geocode] distance=${distance.toFixed(2)}km, maxRangeKm=${maxRangeKm}, matchedRange=${!!matchedRange}, rapiboyEnabled=${rapiboyEnabled}, hasApiToken=${!!location.rapiboyConfig?.apiToken}`)

  if (!range) {
    // Si Rapiboy está habilitado, cotizar con Rapiboy en tiempo real
    if (rapiboyEnabled && location.rapiboyConfig?.apiToken) {
      try {
        const rapiboyConfig: RapiboyConfig = {
          apiToken: location.rapiboyConfig.apiToken,
          environment: location.rapiboyConfig.environment as 'production' | 'uat',
          codigoPlataforma: location.rapiboyConfig.codigoPlataforma,
        }
        const origen: RapiboyCoord = { lat: locationCoords.lat, lng: locationCoords.lng }
        const destino: RapiboyCoord = { lat: coordinates.lat, lng: coordinates.lng, address: `${address.street} ${address.number}, ${address.city}` }
        const cotizacion = await cotizarOnDemand(origen, destino, rapiboyConfig)

        const margen = location.rapiboyConfig.margen ?? 0
        const costConMargen = Math.round(cotizacion.precio * (1 + margen / 100))

        console.log(`[geocode] Rapiboy cotización OK: precio=${cotizacion.precio}, margen=${margen}%, costFinal=${costConMargen}`)

        return {
          withinRange: true,
          distance,
          cost: costConMargen,
          range: null,
          maxRangeKm,
          coordinates,
          provider: 'rapiboy',
          rapiboyCost: cotizacion.precio,
          rapiboyVigencia: cotizacion.vigencia,
        }
      } catch (err) {
        // Rapiboy sin repartidores disponibles — devolver errorCode para UI amigable
        if (err instanceof RapiboyError && err.status === 400) {
          try {
            const body = JSON.parse(err.body || '{}')
            if (body.Message?.includes('repartidores disponibles')) {
              return {
                withinRange: true,
                distance,
                cost: 0,
                range: null,
                maxRangeKm,
                coordinates,
                provider: 'rapiboy',
                errorCode: 'RAPIBOY_NO_DRIVERS',
                error: 'No hay repartidores disponibles en este momento.',
              }
            }
          } catch { /* ignore parse error */ }
          console.error(`[Rapiboy] API error 400: no se pudo cotizar —`, err.body)
        } else if (err instanceof RapiboyError) {
          console.error(`[Rapiboy] API error ${err.status}:`, err.body)
        } else {
          console.error('[Rapiboy] Error desconocido:', err)
        }
        return {
          withinRange: false,
          distance,
          cost: 0,
          range: null,
          maxRangeKm,
          coordinates,
          error: `Tu dirección está a ${Math.round(distance)} km, fuera de nuestra zona de cobertura (máx. ${maxRangeKm} km). El servicio de envío alternativo no está disponible en este momento.`,
        }
      }
    }

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

  if (!range.price || range.price <= 0) {
    return {
      withinRange: false,
      distance,
      cost: 0,
      range: null,
      maxRangeKm,
      coordinates,
      error: 'El costo de envío no está configurado correctamente.',
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
