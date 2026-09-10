export interface GeoPoint {
  lat: number
  lng: number
}

/**
 * Calcula distancia entre dos puntos usando la fórmula de Haversine (en metros)
 */
export function haversineDistance(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const aCalc =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinDLng * sinDLng
  const c = 2 * Math.atan2(Math.sqrt(aCalc), Math.sqrt(1 - aCalc))
  return R * c
}

/**
 * Filtra locaciones que están dentro de un radio desde un punto dado
 */
export function filterLocationsWithinRadius(
  userPos: GeoPoint,
  locations: Array<GeoPoint & Record<string, any>>,
  radiusM: number
) {
  return locations
    .map(loc => ({
      ...loc,
      distanceM: haversineDistance(userPos, { lat: loc.lat, lng: loc.lng }),
    }))
    .filter(loc => loc.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM)
}
