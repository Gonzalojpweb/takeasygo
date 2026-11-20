// ============================================================================
// Validación de coordenadas GeoJSON [longitud, latitud] — sedes y directorio
// ============================================================================
// 20/11/2026: una sede quedó con [-74, -74] (latitud −74 = Antártida). La
// geocodificación automática está acotada a Argentina (lib/geocode.ts), pero
// el alta y la edición de sedes guardaban `geo` del cuerpo sin validar.
//   · Error: no son 2 números finitos, fuera de rango mundial, o latitud igual
//     a longitud (error típico de carga: el mismo número en los dos campos).
//   · Aviso (no bloquea): fuera de la caja aproximada de Argentina, para no
//     trabar un comercio de otro país en el futuro.
// Puro: lo usan el modelo, las rutas y los tests.
// ============================================================================

/** Caja aproximada de Argentina continental (con margen). */
export const ARGENTINA_BOX = { minLat: -56, maxLat: -21, minLng: -74, maxLng: -53 } as const

export type GeoCheck =
  | { ok: true; warning: string | null }
  | { ok: false; error: string }

export function checkGeoCoordinates(coordinates: unknown): GeoCheck {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) {
    return { ok: false, error: 'Las coordenadas tienen que ser [longitud, latitud]' }
  }
  const [lng, lat] = coordinates
  if (typeof lng !== 'number' || typeof lat !== 'number' || !Number.isFinite(lng) || !Number.isFinite(lat)) {
    return { ok: false, error: 'Las coordenadas tienen que ser números' }
  }
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    return { ok: false, error: 'Coordenadas fuera de rango' }
  }
  if (lat === lng) {
    return { ok: false, error: 'La latitud y la longitud son iguales: revisá que no se haya cargado el mismo número dos veces' }
  }
  const inArgentina = lat >= ARGENTINA_BOX.minLat && lat <= ARGENTINA_BOX.maxLat && lng >= ARGENTINA_BOX.minLng && lng <= ARGENTINA_BOX.maxLng
  return { ok: true, warning: inArgentina ? null : 'La ubicación quedó fuera de Argentina. Revisá la dirección en el mapa.' }
}

/**
 * Valida el `geo` que llega en el cuerpo de una ruta. Sin `geo` (o null, que
 * borra la ubicación) no hay nada que validar.
 */
export function checkGeoBody(geo: unknown): GeoCheck {
  if (geo == null) return { ok: true, warning: null }
  if (typeof geo !== 'object') return { ok: false, error: 'Ubicación inválida' }
  const g = geo as { type?: unknown; coordinates?: unknown }
  if (g.coordinates == null) return { ok: true, warning: null }
  if (g.type !== undefined && g.type !== 'Point') return { ok: false, error: 'Ubicación inválida' }
  return checkGeoCoordinates(g.coordinates)
}
