'use client'

// ============================================================================
// AdsMediaUpload — subida de imágenes y videos de marketing (CP3, 21/11/2026)
// ============================================================================
// 1. Muestra las medidas recomendadas de la superficie.
// 2. Chequeo previo en el navegador (formato, peso, medidas, duración) con la
//    misma regla que el servidor (lib/media/spec.ts → checkMedia).
// 3. Pide la firma, sube directo a Cloudinary (cuenta ads) con progreso y pide
//    la verificación al servidor; si no cumple, el servidor lo borra y acá se
//    muestra el motivo.
// 4. Vista previa de cómo se va a ver en cada lugar, antes de guardar.
// ============================================================================

import { useRef, useState } from 'react'
import { Upload, Loader2, X, Film, ImageIcon } from 'lucide-react'
import {
  SURFACE_SPECS, checkMedia, cropWarning, IMAGE_MAX_BYTES, VIDEO_MAX_BYTES, VIDEO_MIN_SECONDS, VIDEO_MAX_SECONDS,
  type MediaKind, type MediaSurface,
} from '@/lib/media/spec'

export interface AdsMediaValue {
  kind: MediaKind
  url: string
  posterUrl?: string | null
  durationMs?: number | null
  /** Datos del archivo verificado (pantallas: orientación, peso, public_id). */
  publicId?: string
  width?: number
  height?: number
  bytes?: number
}

interface Props {
  /** '/api/superadmin/media' o '/api/{slug}/media'. */
  endpointBase: string
  surface: MediaSurface
  /** Tipos que acepta este campo (por defecto, los de la superficie). */
  kinds?: MediaKind[]
  value: AdsMediaValue | null
  onChange: (v: AdsMediaValue | null) => void
  label?: string
}

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heic',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
}

function extOf(file: File): string {
  return EXT_BY_MIME[file.type] || (file.name.split('.').pop() || '').toLowerCase()
}

/** Medidas (y duración) leídas en el navegador; null si no se pueden leer (p. ej., HEIC). */
function readFacts(file: File, kind: MediaKind): Promise<{ width: number; height: number; duration?: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const done = (v: { width: number; height: number; duration?: number } | null) => { URL.revokeObjectURL(url); resolve(v) }
    if (kind === 'image') {
      const img = new Image()
      img.onload = () => done({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => done(null)
      img.src = url
    } else {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.muted = true
      v.onloadedmetadata = () => done({ width: v.videoWidth, height: v.videoHeight, duration: v.duration })
      v.onerror = () => done(null)
      v.src = url
    }
  })
}

/** Mensaje claro para los errores de Cloudinary más comunes. */
export function explainCloudinaryError(message: string | undefined, kind: MediaKind): string {
  const m = (message || '').toLowerCase()
  if (m.includes('invalid signature')) return 'Cloudinary rechazó la firma: el API Secret de la cuenta ads en el servidor (Vercel) no coincide. Revisá CLOUDINARY_ADS_API_SECRET y volvé a desplegar.'
  if (m.includes('invalid api_key') || m.includes('unknown api_key')) return 'Cloudinary no reconoce la API Key de la cuenta ads en el servidor (Vercel). Revisá CLOUDINARY_ADS_API_KEY y CLOUDINARY_ADS_CLOUD_NAME.'
  if (m.includes('upload preset') && m.includes('not found')) return 'No existe el preset de subida en la cuenta ads. Revisá CLOUDINARY_ADS_IMAGE_PRESET / CLOUDINARY_ADS_VIDEO_PRESET.'
  if (m.includes('file size') || m.includes('too large')) return `El archivo supera el máximo (${kind === 'image' ? '8' : '30'} MB).`
  if (m.includes('stale request')) return 'La firma venció (el reloj del servidor o la subida tardaron demasiado). Probá de nuevo.'
  return `Cloudinary rechazó el archivo: ${message || 'error desconocido'}`
}

function uploadWithProgress(url: string, form: FormData, onProgress: (pct: number) => void): Promise<{ public_id?: string; error?: { message?: string } }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) }
    xhr.onload = () => { try { resolve(JSON.parse(xhr.responseText)) } catch { reject(new Error('Respuesta inválida de Cloudinary')) } }
    xhr.onerror = () => reject(new Error('Se cortó la conexión durante la subida'))
    xhr.send(form)
  })
}

export default function AdsMediaUpload({ endpointBase, surface, kinds, value, onChange, label }: Props) {
  const spec = SURFACE_SPECS[surface]
  const allowed = (kinds ?? spec.kinds).filter((k) => spec.kinds.includes(k))
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<null | 'checking' | 'uploading' | 'verifying'>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  const accept = [
    ...(allowed.includes('image') ? ['image/jpeg', 'image/png', 'image/webp', 'image/heic', '.heic'] : []),
    ...(allowed.includes('video') ? ['video/mp4', 'video/quicktime', 'video/webm'] : []),
  ].join(',')

  async function handleFile(file: File) {
    setError(null)
    setWarning(null)
    const kind: MediaKind = file.type.startsWith('video/') ? 'video' : 'image'
    if (!allowed.includes(kind)) { setError(`${spec.label}: solo acepta ${allowed.includes('image') ? 'imágenes' : 'videos'}.`); return }
    const format = extOf(file)

    // Chequeo previo (lo mismo verifica el servidor después de subir).
    setBusy('checking')
    const facts = await readFacts(file, kind)
    if (facts) {
      const problem = checkMedia(surface, { kind, format, bytes: file.size, ...facts })
      if (problem) { setError(problem); setBusy(null); return }
    } else if (kind === 'video') {
      setError('No se pudo leer el video. Probá con un MP4.'); setBusy(null); return
    } else if (file.size > IMAGE_MAX_BYTES) {
      setError(checkMedia(surface, { kind, format, bytes: file.size, width: 99999, height: 99999 }) ?? 'Archivo inválido'); setBusy(null); return
    }

    try {
      const signRes = await fetch(`${endpointBase}/sign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ surface, kind }),
      })
      const signed = await signRes.json().catch(() => null)
      if (!signRes.ok || !signed) throw new Error(signed?.error || `No se pudo preparar la subida (error ${signRes.status}). Probá de nuevo.`)

      setBusy('uploading'); setProgress(0)
      const form = new FormData()
      for (const [k, v] of Object.entries(signed.fields as Record<string, string>)) form.append(k, v)
      form.append('file', file)
      const up = await uploadWithProgress(signed.uploadUrl, form, setProgress)
      if (up.error) throw new Error(explainCloudinaryError(up.error.message, kind))

      setBusy('verifying')
      const confRes = await fetch(`${endpointBase}/confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ surface, kind, publicId: signed.publicId }),
      })
      const conf = await confRes.json().catch(() => null)
      if (!confRes.ok || !conf) throw new Error(conf?.error || `No se pudo verificar el archivo (error ${confRes.status}). Probá de nuevo.`)
      onChange({
        kind, url: conf.media.url, posterUrl: conf.media.posterUrl, durationMs: conf.media.durationMs,
        publicId: conf.media.publicId, width: conf.media.width, height: conf.media.height, bytes: conf.media.bytes,
      })
      setWarning(conf.media.warning ?? (facts && kind === 'image' ? cropWarning(surface, facts.width, facts.height) : null))
    } catch (e) {
      setError((e as Error).message || 'No se pudo subir el archivo')
    } finally {
      setBusy(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-medium">{label}</p>}

      <div className="rounded-xl border border-dashed p-3 text-xs leading-relaxed text-muted-foreground">
        <p><b>{spec.label}</b> · {spec.ratioLabel} · recomendado <b>{spec.recommended.w}×{spec.recommended.h}</b> · mínimo {spec.min.w}×{spec.min.h}</p>
        <p>{spec.howShown}</p>
        <p>
          {allowed.includes('image') && <>Imagen: JPG, PNG, WebP o HEIC, hasta {Math.round((spec.imageMaxBytes ?? IMAGE_MAX_BYTES) / 1048576)} MB. </>}
          {allowed.includes('video') && (() => {
            const v = spec.video ?? { minS: VIDEO_MIN_SECONDS, maxS: VIDEO_MAX_SECONDS, maxBytes: VIDEO_MAX_BYTES, orientation: 'vertical' as const }
            return <>Video: MP4, MOV o WebM, {v.orientation === 'vertical' ? 'vertical' : 'horizontal o vertical'}, de {v.minS} a {v.maxS} s, hasta {Math.round(v.maxBytes / 1048576)} MB (se reproduce sin sonido).</>
          })()}
        </p>
        {spec.safeZone && <p>Dejá libres arriba ~{spec.safeZone.top}px y abajo ~{spec.safeZone.bottom}px (barras, textos y botón).</p>}
        <p>No se recorta al subir: cada lugar la encuadra al mostrarla (ver vista previa). Una imagen con otra proporción se acepta igual, con aviso.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }}
        />
        <button
          type="button"
          disabled={!!busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Upload size={15} aria-hidden />}
          {busy === 'checking' ? 'Revisando…' : busy === 'uploading' ? `Subiendo ${progress}%` : busy === 'verifying' ? 'Verificando…' : value ? 'Reemplazar' : 'Subir archivo'}
        </button>
        {value && !busy && (
          <button type="button" onClick={() => onChange(null)} className="inline-flex items-center gap-1 rounded-xl px-2 py-2 text-xs text-muted-foreground hover:text-foreground">
            <X size={13} aria-hidden /> Quitar
          </button>
        )}
      </div>

      {error && <p role="alert" className="text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>}
      {warning && !error && <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{warning}</p>}

      {value && <MediaPreview surface={surface} value={value} />}
    </div>
  )
}

/** Cómo se va a ver en cada lugar (mismo encuadre que los componentes). */
export function MediaPreview({ surface, value }: { surface: MediaSurface; value: AdsMediaValue }) {
  const media = (cls: string) => value.kind === 'video'
    ? <video src={value.url} poster={value.posterUrl || undefined} muted playsInline loop autoPlay className={cls} />
    : <img src={value.url} alt="" className={cls} />

  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
        {value.kind === 'video' ? <Film size={12} aria-hidden /> : <ImageIcon size={12} aria-hidden />} Vista previa
        {value.kind === 'video' && value.durationMs ? ` · ${(value.durationMs / 1000).toFixed(1).replace('.', ',')} s` : ''}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        {surface === 'story' && (
          <figure className="relative w-[120px] overflow-hidden rounded-xl bg-black" style={{ aspectRatio: '9 / 16' }}>
            {media('absolute inset-0 h-full w-full object-cover')}
            {/* Zonas reservadas: barras arriba, textos y botón abajo. */}
            <div className="absolute inset-x-0 top-0 bg-red-500/20" style={{ height: `${(220 / 1920) * 100}%` }} />
            <div className="absolute inset-x-0 bottom-0 bg-red-500/20" style={{ height: `${(560 / 1920) * 100}%` }} />
            <figcaption className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9px] text-white">Story</figcaption>
          </figure>
        )}
        {surface === 'promo_card' && (
          <>
            <figure className="relative h-[86px] w-[86px] overflow-hidden rounded-xl bg-muted">
              {media('h-full w-full object-cover')}
              <figcaption className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9px] text-white">Destacada</figcaption>
            </figure>
            <figure className="relative h-[64px] w-[54px] overflow-hidden rounded-xl bg-muted">
              {media('h-full w-full object-cover')}
              <figcaption className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9px] text-white">Compacta</figcaption>
            </figure>
            <figure className="relative h-[32px] w-[32px] overflow-hidden rounded-md bg-muted">
              {media('h-full w-full object-cover')}
            </figure>
            <span className="text-[10px] text-muted-foreground">Descubrí (64×64)</span>
          </>
        )}
        {surface === 'club_card' && (
          <>
            <figure className="relative h-[68px] w-[120px] overflow-hidden rounded-xl bg-muted">
              {media('h-full w-full object-cover')}
              <figcaption className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9px] text-white">Tienda del club</figcaption>
            </figure>
            <figure className="relative h-[56px] w-[66px] overflow-hidden rounded-xl bg-muted">
              {media('h-full w-full object-cover')}
              <figcaption className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9px] text-white">Menú</figcaption>
            </figure>
          </>
        )}
        {surface === 'qr_promo' && (
          <figure className="relative h-[80px] w-[80px] overflow-hidden rounded-2xl bg-muted">
            {media('h-full w-full object-cover')}
            <figcaption className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9px] text-white">QrPromo</figcaption>
          </figure>
        )}
        {surface === 'screen' && (() => {
          const portrait = (value.height ?? 0) > (value.width ?? 0)
          return (
            <figure className="relative overflow-hidden rounded-xl bg-black" style={{ width: portrait ? 90 : 240, aspectRatio: portrait ? '9 / 16' : '16 / 9' }}>
              {media('absolute inset-0 h-full w-full object-cover')}
              <figcaption className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9px] text-white">{portrait ? 'Pantalla vertical' : 'Pantalla horizontal'}</figcaption>
            </figure>
          )
        })()}
        {surface === 'home_banner' && (
          <figure className="relative w-[240px] overflow-hidden rounded-xl bg-muted" style={{ aspectRatio: '2 / 1' }}>
            {media('absolute inset-0 h-full w-full object-cover')}
            <figcaption className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9px] text-white">Banner del inicio</figcaption>
          </figure>
        )}
      </div>
    </div>
  )
}
