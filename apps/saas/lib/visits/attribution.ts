import { Types } from 'mongoose'
import Location from '@/models/Location'
import { locationRefFilter, parseMenuPathSegment } from '@/lib/menu/location-ref'

// ============================================================================
// Atribución de visitas al menú (MenuVisit): sede, origen y dispositivo
// ============================================================================
// 20/11/2026 — corrección de dos fallas:
//   · Sede: desde el 31/10 las direcciones del menú usan el slug de la sede y
//     acá solo se reconocía el _id → casi ninguna visita quedaba con sede.
//   · Origen: se leía ?source= de la URL del beacon (/api/visits/log), que
//     nunca lo trae, y el header Referer del beacon es la propia página del
//     menú → casi todo quedaba como «other». Ahora el cliente manda el source
//     de la página y document.referrer.
// ============================================================================

const VALID_SOURCES = ['instagram', 'facebook', 'qr', 'whatsapp', 'google', 'direct', 'other']

export function getDeviceType(userAgent: string | null): 'mobile' | 'desktop' | 'unknown' {
  if (!userAgent) return 'unknown'
  const ua = userAgent.toLowerCase()
  if (/mobile|android|iphone|ipod|blackberry|windows phone/i.test(ua)) return 'mobile'
  if (/tablet|ipad|playbook|silk/i.test(ua)) return 'desktop'
  if (/bot|crawler|spider|crawl/i.test(ua)) return 'unknown'
  return 'desktop'
}

export function extractBaseSource(raw: string): string {
  const lower = raw.toLowerCase()
  if (VALID_SOURCES.includes(lower)) return lower
  const prefix = lower.split('-')[0]
  if (VALID_SOURCES.includes(prefix)) return prefix
  return lower
}

/**
 * Origen de la visita. Orden: ?source= de la página → navegador interno de
 * Instagram → de dónde llegó la persona (referrer externo) → directo.
 */
export function detectTrafficSource(
  referer: string | null,
  urlSource: string | null,
  userAgent: string | null
): string {
  if (urlSource) return extractBaseSource(urlSource)

  if (userAgent && userAgent.toLowerCase().includes('instagram')) return 'instagram'

  if (referer) {
    const ref = referer.toLowerCase()
    if (ref.includes('instagram.com')) return 'instagram'
    if (ref.includes('facebook.com') || ref.includes('fb.com')) return 'facebook'
    if (ref.includes('whatsapp.com') || ref.includes('wa.me')) return 'whatsapp'
    if (ref.includes('google.')) return 'google'
    return 'other'
  }

  return 'direct'
}

/**
 * Referrer externo (origen + camino, sin query), o null si falta, es inválido o
 * es del mismo sitio (navegó dentro de TakeasyGO → cuenta como directo).
 */
export function externalReferrer(raw: string | null | undefined, ownHost: string): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.host === ownHost) return null
    return url.origin + url.pathname
  } catch {
    return null
  }
}

/**
 * Sede de la visita desde la ruta del menú, validada contra el comercio: por
 * slug, por _id (direcciones viejas) o, en el link general /{tenant}/menu, la
 * única sede activa. null si no se puede saber.
 */
export async function resolveVisitLocation(tenantId: Types.ObjectId, locationPath: string | null): Promise<Types.ObjectId | null> {
  const parsed = parseMenuPathSegment(locationPath)
  if (!parsed) return null
  if (parsed.ref) {
    const loc = await Location.findOne({ ...locationRefFilter(parsed.ref), tenantId }).select('_id').lean<{ _id: Types.ObjectId }>()
    return loc ? new Types.ObjectId(String(loc._id)) : null
  }
  const active = await Location.find({ tenantId, isActive: true }).select('_id').limit(2).lean<Array<{ _id: Types.ObjectId }>>()
  return active.length === 1 ? new Types.ObjectId(String(active[0]._id)) : null
}
