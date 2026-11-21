// ============================================================================
// Subida firmada directa a la cuenta ads (CP3, 21/11/2026)
// ============================================================================
// 1. sign(): el servidor arma y firma los parámetros. El public_id incluye la
//    ruta completa `{raíz}/{dueño}/{superficie}/{azar}` (dueño = 'platform' o
//    't-{tenantId}'), así el aislamiento no depende del modo de carpetas de la
//    cuenta. Se sube con la etiqueta 'pending'.
// 2. El navegador sube directo a api.cloudinary.com (no pasa por Vercel: sin
//    el límite de 4,5 MB).
// 3. verify(): el servidor lee el archivo con la Admin API y verifica formato,
//    peso, medidas, duración y proporción. Si no cumple lo BORRA. Si el
//    public_id no es de quien pregunta, rechaza SIN tocarlo.
// 4. Al guardar la story o la promo se quita 'pending' (markSaved). Lo que
//    quedó 'pending' más de 24 h lo borra el cron ads-media-cleanup.
// ============================================================================

import { randomBytes } from 'node:crypto'
import { adsCreds, adsFolderRoot, adsPreset, cloudinarySdk as cloudinary } from '@/lib/cloudinary'
import { checkMedia, cropWarning, SURFACE_SPECS, type MediaKind, type MediaSurface } from '@/lib/media/spec'

export const PENDING_TAG = 'pending'

/** Transformaciones del video de story: 720p H.264 y portada del primer cuadro. */
const VIDEO_DELIVERY = { crop: 'limit', width: 720, height: 1280, quality: 'auto', video_codec: 'h264' } as const
const VIDEO_POSTER = { crop: 'limit', width: 720, height: 1280, start_offset: '0' } as const

/**
 * Pantallas (21/11/2026): 1080p a 4 Mbps y 720p a 2 Mbps, SIN audio (no hay
 * sonido y pesa menos), y portada. c_limit con caja de 1920×1920 (o 1280)
 * sirve igual para horizontal y vertical.
 */
const SCREEN_1080 = { crop: 'limit', width: 1920, height: 1920, quality: 'auto', video_codec: 'h264', bit_rate: '4m', audio_codec: 'none' } as const
const SCREEN_720 = { crop: 'limit', width: 1280, height: 1280, quality: 'auto', video_codec: 'h264', bit_rate: '2m', audio_codec: 'none' } as const
const SCREEN_POSTER = { crop: 'limit', width: 1920, height: 1920, start_offset: '0' } as const
const SCREEN_IMG_1080 = { crop: 'limit', width: 1920, height: 1920, quality: 'auto' } as const
const SCREEN_IMG_720 = { crop: 'limit', width: 1280, height: 1280, quality: 'auto' } as const

export type MediaOwner = { kind: 'platform' } | { kind: 'tenant'; tenantId: string }

export function ownerSegment(owner: MediaOwner): string {
  return owner.kind === 'platform' ? 'platform' : `t-${owner.tenantId}`
}

export function folderFor(owner: MediaOwner, surface: MediaSurface): string {
  return `${adsFolderRoot()}/${ownerSegment(owner)}/${surface}`
}

export interface SignedUpload {
  uploadUrl: string
  fields: Record<string, string>
  publicId: string
}

export function signUpload(owner: MediaOwner, surface: MediaSurface, kind: MediaKind, now = Date.now()): SignedUpload {
  const spec = SURFACE_SPECS[surface]
  if (!spec || !spec.kinds.includes(kind)) throw new Error('Superficie o tipo no admitidos')
  const creds = adsCreds()
  const folder = folderFor(owner, surface)
  const publicId = `${folder}/${randomBytes(9).toString('hex')}`
  const params: Record<string, string | number> = {
    timestamp: Math.floor(now / 1000),
    public_id: publicId,
    asset_folder: folder,
    upload_preset: surface === 'screen' && kind === 'video' ? adsPreset('screen_video') : adsPreset(kind),
    tags: PENDING_TAG,
  }
  if (kind === 'video') {
    const buildEager = (cloudinary.utils as unknown as { build_eager: (e: object[]) => string }).build_eager
    params.eager = surface === 'screen'
      ? buildEager([{ ...SCREEN_1080, format: 'mp4' }, { ...SCREEN_720, format: 'mp4' }, { ...SCREEN_POSTER, format: 'jpg' }])
      : buildEager([{ ...VIDEO_DELIVERY, format: 'mp4' }, { ...VIDEO_POSTER, format: 'jpg' }])
    params.eager_async = 'true'
  }
  const signature = cloudinary.utils.api_sign_request(params, creds.api_secret)
  const fields: Record<string, string> = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
  fields.api_key = creds.api_key
  fields.signature = signature
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${creds.cloud_name}/${kind}/upload`,
    fields,
    publicId,
  }
}

/** ¿El public_id es de ese dueño y superficie? (aislamiento entre comercios) */
export function belongsTo(publicId: string, owner: MediaOwner, surface: MediaSurface): boolean {
  const prefix = `${folderFor(owner, surface)}/`
  return typeof publicId === 'string' && publicId.startsWith(prefix) && /^[a-f0-9]{18}$/.test(publicId.slice(prefix.length))
}

export interface VerifiedMedia {
  kind: MediaKind
  url: string
  posterUrl: string | null
  publicId: string
  width: number
  height: number
  bytes: number
  /** Solo video. */
  durationMs: number | null
  /** Aviso (no rechazo): la imagen tiene otra proporción y se va a recortar al mostrarla. */
  warning: string | null
  /** Solo pantalla: variante 720p (equipos débiles o pantallas chicas). */
  url720?: string | null
}

export type VerifyResult =
  | { ok: true; media: VerifiedMedia }
  | { ok: false; status: number; error: string; deleted: boolean }

type ResourceInfo = {
  format?: string; bytes?: number; width?: number; height?: number; duration?: number; secure_url?: string; public_id?: string
  /** Con media_metadata: duración y rotación del video. */
  video_metadata?: { duration?: number; format_duration?: number; rotation?: number; width?: number; height?: number }
}

/**
 * Datos reales del archivo. Video: la duración viene en video_metadata (la
 * consulta simple no la trae) y, si el celular lo guardó «rotado 90°» (un
 * reel vertical que figura 1920×1080), se intercambian ancho y alto.
 */
export function factsFromResource(info: ResourceInfo, kind: MediaKind) {
  let width = info.width ?? 0
  let height = info.height ?? 0
  let duration: number | null = null
  if (kind === 'video') {
    const vm = info.video_metadata ?? {}
    const d = info.duration ?? vm.duration ?? vm.format_duration
    duration = typeof d === 'number' && Number.isFinite(d) ? d : null
    const rot = Math.abs(Number(vm.rotation) || 0) % 360
    if (rot === 90 || rot === 270) [width, height] = [height, width]
  }
  return { format: info.format ?? '', bytes: info.bytes ?? 0, width, height, duration }
}

/** Dependencias de Cloudinary (inyectables para tests). */
export interface AdsApi {
  resource(publicId: string, kind: MediaKind): Promise<ResourceInfo | null>
  destroy(publicId: string, kind: MediaKind): Promise<void>
  removePendingTag(publicId: string, kind: MediaKind): Promise<void>
}

export function cloudinaryAdsApi(): AdsApi {
  return {
    async resource(publicId, kind) {
      try {
        // media_metadata: sin esto la Admin API no devuelve la duración del video.
        return await cloudinary.api.resource(publicId, { ...adsCreds(), resource_type: kind, ...(kind === 'video' ? { media_metadata: true } : {}) } as never) as ResourceInfo
      } catch (e) {
        const code = (e as { error?: { http_code?: number } })?.error?.http_code
        if (code === 404) return null
        throw e
      }
    },
    async destroy(publicId, kind) {
      await cloudinary.api.delete_resources([publicId], { ...adsCreds(), resource_type: kind, invalidate: true })
    },
    async removePendingTag(publicId, kind) {
      await cloudinary.uploader.remove_tag(PENDING_TAG, [publicId], { ...adsCreds(), resource_type: kind })
    },
  }
}

/** URLs de pantalla (1080p, 720p y portada) a partir del public_id. */
export function screenUrls(publicId: string, kind: MediaKind): { url: string; url720: string; posterUrl: string | null } {
  const { cloud_name } = adsCreds()
  const u = (t: object, rt: MediaKind, format?: string) =>
    cloudinary.url(publicId, { cloud_name, secure: true, resource_type: rt, transformation: [t], ...(format ? { format } : {}), urlAnalytics: false } as never)
  if (kind === 'image') return { url: u(SCREEN_IMG_1080, 'image'), url720: u(SCREEN_IMG_720, 'image'), posterUrl: null }
  return { url: u(SCREEN_1080, 'video', 'mp4'), url720: u(SCREEN_720, 'video', 'mp4'), posterUrl: u(SCREEN_POSTER, 'video', 'jpg') }
}

export function deliveryUrls(publicId: string, kind: MediaKind, secureUrl?: string): { url: string; posterUrl: string | null } {
  const { cloud_name } = adsCreds()
  if (kind === 'image') {
    return { url: secureUrl || cloudinary.url(publicId, { cloud_name, secure: true, resource_type: 'image', urlAnalytics: false } as never), posterUrl: null }
  }
  return {
    url: cloudinary.url(publicId, { cloud_name, secure: true, resource_type: 'video', transformation: [VIDEO_DELIVERY], format: 'mp4', urlAnalytics: false } as never),
    posterUrl: cloudinary.url(publicId, { cloud_name, secure: true, resource_type: 'video', transformation: [VIDEO_POSTER], format: 'jpg', urlAnalytics: false } as never),
  }
}

export async function verifyUpload(
  owner: MediaOwner,
  surface: MediaSurface,
  kind: MediaKind,
  publicId: string,
  api: AdsApi = cloudinaryAdsApi(),
  /** Tope extra (p. ej., biblioteca de pantallas del comercio): null = pasa; texto = se rechaza y se borra. */
  quota?: (bytes: number) => Promise<string | null>,
): Promise<VerifyResult> {
  if (!belongsTo(publicId, owner, surface)) {
    // Nunca se toca un archivo ajeno.
    return { ok: false, status: 403, error: 'El archivo no corresponde a este panel.', deleted: false }
  }
  const info = await api.resource(publicId, kind)
  if (!info) return { ok: false, status: 404, error: 'No se encontró el archivo subido. Probá de nuevo.', deleted: false }

  const facts = factsFromResource(info, kind)
  const problem = checkMedia(surface, { kind, ...facts })
  if (problem) {
    await api.destroy(publicId, kind).catch(() => {})
    return { ok: false, status: 422, error: problem, deleted: true }
  }
  const over = quota ? await quota(facts.bytes) : null
  if (over) {
    await api.destroy(publicId, kind).catch(() => {})
    return { ok: false, status: 409, error: over, deleted: true }
  }
  const screen = surface === 'screen' ? screenUrls(publicId, kind) : null
  const { url, posterUrl } = screen ?? deliveryUrls(publicId, kind, info.secure_url)
  return {
    ok: true,
    media: {
      kind, url, posterUrl, publicId,
      width: facts.width, height: facts.height, bytes: facts.bytes,
      durationMs: kind === 'video' && facts.duration !== null ? Math.round(facts.duration * 1000) : null,
      warning: kind === 'image' ? cropWarning(surface, facts.width, facts.height) : null,
      ...(screen ? { url720: screen.url720 } : {}),
    },
  }
}

/**
 * public_id y tipo de una URL de la cuenta ads, o null si es de otra cuenta
 * (fotos de menús, URLs viejas pegadas a mano).
 */
export function adsAssetFromUrl(url: string | null | undefined): { publicId: string; kind: MediaKind } | null {
  if (!url) return null
  let cloud: string
  try { cloud = adsCreds().cloud_name } catch { return null }
  const m = url.match(/^https:\/\/res\.cloudinary\.com\/([^/]+)\/(image|video)\/upload\/(.+)$/)
  if (!m || m[1] !== cloud) return null
  const root = adsFolderRoot()
  const rest = m[3].split(/[?#]/)[0]
  const idx = rest.indexOf(`${root}/`)
  if (idx === -1) return null
  const publicId = rest.slice(idx).replace(/\.[a-z0-9]+$/i, '')
  return { publicId, kind: m[2] as MediaKind }
}

/** Al guardar: quita 'pending' a los archivos ads usados (los demás se ignoran). */
export async function markSaved(urls: Array<string | null | undefined>, api: AdsApi = cloudinaryAdsApi()): Promise<void> {
  const seen = new Set<string>()
  for (const u of urls) {
    const a = adsAssetFromUrl(u)
    if (!a || seen.has(a.publicId)) continue
    seen.add(a.publicId)
    await api.removePendingTag(a.publicId, a.kind).catch((e) => {
      console.error('[ads-media] no se pudo quitar pending:', (e as Error)?.message)
    })
  }
}
