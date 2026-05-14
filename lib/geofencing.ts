import Location from '@/models/Location'
import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'

export interface GeoPoint {
  lat: number
  lng: number
}

export interface NearbyLocation {
  _id: string
  name: string
  tenantId: string
  lat: number
  lng: number
  distanceM: number
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
 * Obtiene las locaciones activas de un tenant con coordenadas geo
 */
export async function getTenantLocationsWithGeo(
  tenantId: string
): Promise<NearbyLocation[]> {
  const locations = await Location.find({
    tenantId,
    isActive: true,
    'geo.coordinates': { $exists: true },
  }).lean()

  return locations.map(loc => ({
    _id: loc._id.toString(),
    name: loc.name || '',
    tenantId: loc.tenantId.toString(),
    lat: loc.geo!.coordinates[1],
    lng: loc.geo!.coordinates[0],
    distanceM: 0,
  }))
}

/**
 * Busca miembros del club para un tenant que tengan push subscriptions activas
 */
export async function getClubMembersWithPush(tenantId: string): Promise<string[]> {
  const members = await LoyaltyMember.find({
    tenantId,
    status: 'active',
    'wallet.publicId': { $exists: true },
  })
    .select('_id')
    .lean()

  return members.map(m => m._id.toString())
}

/**
 * Filtra locaciones que están dentro de un radio desde un punto dado
 */
export function filterLocationsWithinRadius(
  userPos: GeoPoint,
  locations: NearbyLocation[],
  radiusM: number
): NearbyLocation[] {
  return locations
    .map(loc => ({
      ...loc,
      distanceM: haversineDistance(userPos, { lat: loc.lat, lng: loc.lng }),
    }))
    .filter(loc => loc.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM)
}
